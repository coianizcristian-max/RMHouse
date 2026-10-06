import 'server-only';
import crypto from 'node:crypto';
import { supabaseAdmin } from './supabase/admin';
import { SLUG } from './palestra';

// Collegamento diretto con Satispay Business (API "g_business").
// Ogni richiesta è firmata con la chiave RSA della scuola (firma "Signing HTTP Messages":
// (request-target), host, date, digest → RSA-SHA256), come da documentazione Satispay.
// Le chiavi stanno nella tabella satispay_chiavi (solo server) oppure nelle variabili
// SATISPAY_KEY_ID / SATISPAY_CHIAVE_PRIVATA / SATISPAY_AMBIENTE su Vercel.

const HOST = { prova: 'https://staging.authservices.satispay.com', reale: 'https://authservices.satispay.com' };
const WEB = { prova: 'https://staging.online.satispay.com', reale: 'https://online.satispay.com' };

export const baseApi = (ambiente) => (process.env.SATISPAY_API_URL || HOST[ambiente] || HOST.reale).replace(/\/$/, '');
const baseWeb = (ambiente) => (process.env.SATISPAY_WEB_URL || WEB[ambiente] || WEB.reale).replace(/\/$/, '');

// Le chiavi della scuola (null se Satispay non è collegato)
export async function chiaviSatispay() {
  if (process.env.SATISPAY_KEY_ID && process.env.SATISPAY_CHIAVE_PRIVATA) {
    return {
      keyId: process.env.SATISPAY_KEY_ID,
      chiave: process.env.SATISPAY_CHIAVE_PRIVATA.replace(/\\n/g, '\n'),
      ambiente: process.env.SATISPAY_AMBIENTE === 'prova' ? 'prova' : 'reale',
    };
  }
  const db = supabaseAdmin();
  const { data: pal } = await db.from('palestre').select('id').eq('slug', SLUG).maybeSingle();
  if (!pal) return null;
  const { data } = await db.from('satispay_chiavi').select('key_id, chiave_privata, ambiente').eq('palestra_id', pal.id).maybeSingle();
  return data ? { keyId: data.key_id, chiave: data.chiave_privata, ambiente: data.ambiente, palestraId: pal.id } : null;
}
export async function satispayAttivo() {
  try { return !!(await chiaviSatispay()); } catch { return false; }
}

// "Mon, 06 Oct 2026 15:10:24 +0000"
function dataHttp(d = new Date()) {
  return d.toUTCString().replace('GMT', '+0000');
}

// Le intestazioni firmate per una richiesta
export function intestazioniFirmate({ metodo, url, corpo = '', keyId, chiave }) {
  const u = new URL(url);
  const data = dataHttp();
  const digest = 'SHA-256=' + crypto.createHash('sha256').update(corpo).digest('base64');
  const daFirmare = `(request-target): ${metodo.toLowerCase()} ${u.pathname}\nhost: ${u.host}\ndate: ${data}\ndigest: ${digest}`;
  const firma = crypto.createSign('RSA-SHA256').update(daFirmare).sign(chiave, 'base64');
  return {
    Date: data,
    Digest: digest,
    Authorization: `Signature keyId="${keyId}", algorithm="rsa-sha256", headers="(request-target) host date digest", signature="${firma}"`,
  };
}

async function chiama(metodo, percorso, corpo, chiavi) {
  const k = chiavi || await chiaviSatispay();
  if (!k) throw new ErroreSatispay('Satispay non è collegato.', 'non_collegato');
  const url = baseApi(k.ambiente) + percorso;
  const testo = corpo === undefined ? '' : JSON.stringify(corpo);
  const r = await fetch(url, {
    method: metodo,
    headers: {
      Accept: 'application/json', ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...intestazioniFirmate({ metodo, url, corpo: testo, keyId: k.keyId, chiave: k.chiave }),
    },
    body: corpo === undefined ? undefined : testo,
    cache: 'no-store',
  });
  const dati = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroreSatispay(dati?.message || `Satispay ha risposto ${r.status}`, dati?.code || r.status, r.status);
  return dati;
}

export class ErroreSatispay extends Error {
  constructor(messaggio, codice, stato) { super(messaggio); this.codice = codice; this.stato = stato; }
}

// scadenza in formato Satispay: 2026-10-06T15:10:24.000Z
const traMinuti = (m) => new Date(Date.now() + m * 60000).toISOString();

// Pagamento dal sito/app: il cliente va sulla pagina Satispay (sul telefono si apre l'app)
export async function creaPagamentoOnline({ importoCent, callback, ritorno, riferimento, descrizione, minuti = 30 }) {
  const k = await chiaviSatispay();
  const p = await chiama('POST', '/g_business/v1/payments', {
    flow: 'MATCH_CODE', amount_unit: importoCent, currency: 'EUR',
    callback_url: callback, redirect_url: ritorno, external_code: String(riferimento).slice(0, 50),
    expiration_date: traMinuti(minuti), metadata: { descrizione: String(descrizione || '').slice(0, 200), riferimento: String(riferimento) },
  }, k);
  return { ...p, url: p.redirect_url || `${baseWeb(k.ambiente)}/pay/${p.id}?redirect_url=${encodeURIComponent(ritorno)}` };
}

// "+39 333 1234567" → "+393331234567"
export function telefonoSatispay(t) {
  let n = String(t || '').replace(/[^\d+]/g, '');
  if (n.startsWith('00')) n = '+' + n.slice(2);
  if (!n.startsWith('+')) n = '+39' + n;
  return n;
}

// Allo sportello: la richiesta arriva sull'app del cliente (cercato per numero di telefono)
export async function chiediAlTelefono({ telefono, importoCent, riferimento, descrizione, callback, minuti = 10 }) {
  const k = await chiaviSatispay();
  let cliente;
  try {
    cliente = await chiama('GET', `/g_business/v1/consumers/${encodeURIComponent(telefonoSatispay(telefono))}`, undefined, k);
  } catch (e) {
    if (e.stato === 404) throw new ErroreSatispay('Questo numero non ha Satispay (o è scritto diverso): controllalo o cambia metodo.', 'cliente_non_trovato', 404);
    throw e;
  }
  return chiama('POST', '/g_business/v1/payments', {
    flow: 'MATCH_USER', consumer_uid: cliente.id, amount_unit: importoCent, currency: 'EUR',
    external_code: String(riferimento).slice(0, 50), expiration_date: traMinuti(minuti),
    ...(callback ? { callback_url: callback } : {}),
    metadata: { descrizione: String(descrizione || '').slice(0, 200) },
  }, k);
}

export const leggiPagamento = (id) => chiama('GET', `/g_business/v1/payments/${encodeURIComponent(id)}`);
export const annullaPagamento = (id) => chiama('PUT', `/g_business/v1/payments/${encodeURIComponent(id)}`, { action: 'CANCEL' });

// Collegamento: con il codice di attivazione (6 caratteri, dalla Dashboard Satispay Business) si registra
// la chiave pubblica della scuola e Satispay risponde con il KeyId. La chiave privata resta solo sul server.
export async function collegaConCodice(codice, ambiente) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 4096,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const dati = await chiama('POST', '/g_business/v1/authentication_keys',
    { public_key: publicKey, token: String(codice).trim() }, { keyId: 'PLACEHOLDER', chiave: privateKey, ambiente });
  if (!dati?.key_id) throw new ErroreSatispay('Satispay non ha restituito il collegamento.', 'senza_key_id');
  return { keyId: dati.key_id, chiave: privateKey };
}

// Solo nell'ambiente di prova Satispay: verifica che la firma sia giusta
export const provaFirma = (chiavi) => chiama('POST', '/wally-services/protocol/tests/signature', {}, chiavi);
