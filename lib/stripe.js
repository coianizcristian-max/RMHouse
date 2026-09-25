import 'server-only';
import crypto from 'node:crypto';

// Stripe senza librerie: le chiamate sono semplici richieste HTTP.
// Si accende solo con PAGAMENTI_ONLINE=true e STRIPE_SECRET_KEY su Vercel.
const VERSIONE = '2024-06-20';   // versione dell'API fissata: i campi non cambiano sotto i piedi

export function stripeAttivo() {
  return process.env.PAGAMENTI_ONLINE === 'true' && !!process.env.STRIPE_SECRET_KEY;
}
export function stripeModo() {
  const k = process.env.STRIPE_SECRET_KEY || '';
  return k.startsWith('sk_live_') ? 'reale' : k.startsWith('sk_test_') ? 'prova' : null;
}

// { a: { b: 1 }, c: [x, y] } → a[b]=1&c[0]=x&c[1]=y
function codifica(obj, prefisso = '', out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const chiave = prefisso ? `${prefisso}[${k}]` : k;
    if (typeof v === 'object') codifica(v, chiave, out);
    else out.push(`${encodeURIComponent(chiave)}=${encodeURIComponent(String(v))}`);
  }
  return out;
}

export async function stripe(metodo, percorso, parametri) {
  const url = new URL(`https://api.stripe.com/v1/${percorso}`);
  const opzioni = {
    method: metodo,
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Stripe-Version': VERSIONE,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    cache: 'no-store',
  };
  if (parametri) {
    const q = codifica(parametri).join('&');
    if (metodo === 'GET') url.search = q; else opzioni.body = q;
  }
  const r = await fetch(url, opzioni);
  const dati = await r.json();
  if (!r.ok) {
    const e = new Error(dati?.error?.message || `Stripe ${r.status}`);
    e.stripe = dati?.error;
    throw e;
  }
  return dati;
}

// Una pagina di pagamento di Stripe (Checkout)
export async function creaCheckout({ righe, email, cliente, metadata, successo, annullato, ricorrente = false, scadenzaMinuti = 60 }) {
  const line_items = righe.map((r) => ({
    quantity: 1,
    price_data: {
      currency: 'eur',
      unit_amount: r.importo_cent,
      product_data: { name: r.descrizione.slice(0, 250) },
      ...(ricorrente && r.ricorrente ? { recurring: { interval: 'month' } } : {}),
    },
  }));
  const parametri = {
    mode: ricorrente ? 'subscription' : 'payment',
    locale: 'it',
    line_items,
    success_url: successo,
    cancel_url: annullato,
    metadata,
    client_reference_id: metadata?.riferimento,
    expires_at: Math.floor(Date.now() / 1000) + Math.max(31, scadenzaMinuti) * 60,
    ...(cliente ? { customer: cliente } : email ? { customer_email: email } : {}),
    ...(ricorrente ? { subscription_data: { metadata } } : { payment_intent_data: { metadata }, ...(cliente ? {} : { customer_creation: 'always' }) }),
  };
  return stripe('POST', 'checkout/sessions', parametri);
}

// La firma dei messaggi che Stripe manda al webhook
export function firmaValida(corpo, intestazione, segreto, tolleranza = 300) {
  if (!intestazione || !segreto) return false;
  const firme = [];
  let t = null;
  for (const pezzo of intestazione.split(',')) {
    const [k, v] = pezzo.split('=');
    if (k === 't') t = v; else if (k === 'v1') firme.push(v);
  }
  if (!t || !firme.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > tolleranza) return false;
  const atteso = crypto.createHmac('sha256', segreto).update(`${t}.${corpo}`, 'utf8').digest('hex');
  return firme.some((f) => f.length === atteso.length && crypto.timingSafeEqual(Buffer.from(f), Buffer.from(atteso)));
}

// Commissione trattenuta da Stripe su un pagamento, in centesimi
export async function commissioneDi(paymentIntent) {
  if (!paymentIntent) return null;
  try {
    const pi = await stripe('GET', `payment_intents/${paymentIntent}`, { expand: ['latest_charge.balance_transaction'] });
    return pi?.latest_charge?.balance_transaction?.fee ?? null;
  } catch {
    return null;
  }
}

// Indirizzo pubblico del sito, per i link di ritorno
export function baseUrl(richiesta) {
  if (process.env.NEXT_PUBLIC_SITO_URL) return process.env.NEXT_PUBLIC_SITO_URL.replace(/\/$/, '');
  const u = new URL(richiesta.url);
  return `${u.protocol}//${u.host}`;
}
