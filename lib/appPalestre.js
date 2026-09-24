// Lettura degli export CSV di APP Palestre ("lista clienti" e "lista abbonamenti").
// Tutto avviene nel browser: i dati personali non passano da nessun file del progetto.
import { leggiCsv, leggiData } from './csv';

const pulisci = (v) => {
  const t = String(v ?? '').replace(/\s+/g, ' ').trim();
  return t && !/^(non impostato|not set)$/i.test(t) ? t : null;
};
const minuscolo = (v) => pulisci(v)?.toLowerCase() || null;

// Chiave che lega un cliente ai suoi abbonamenti: nome|cognome|email
export const chiaveCliente = (nome, cognome, email) =>
  [nome, cognome, email].map((v) => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase()).join('|');

// Data di nascita ricavata dal codice fiscale, quando manca quella scritta
const MESI_CF = 'ABCDEHLMPRST';
export function nascitaDaCf(cf) {
  const c = String(cf || '').toUpperCase().trim();
  if (!/^[A-Z]{6}\d{2}[ABCDEHLMPRST]\d{2}[A-Z]\d{3}[A-Z]$/.test(c)) return null;
  const aa = Number(c.slice(6, 8));
  const mese = MESI_CF.indexOf(c[8]) + 1;
  let giorno = Number(c.slice(9, 11));
  if (giorno > 40) giorno -= 40;
  const oggi = new Date().getFullYear() % 100;
  const anno = aa > oggi ? 1900 + aa : 2000 + aa;
  if (giorno < 1 || giorno > 31) return null;
  return `${anno}-${String(mese).padStart(2, '0')}-${String(giorno).padStart(2, '0')}`;
}

const soloCap = (v) => pulisci(v)?.replace(/^cap\s*/i, '') || null;
const unisci = (...v) => v.map(pulisci).filter(Boolean).join(' ') || null;
const stesso = (a, b) => (a || '').toLowerCase().replace(/[^a-zà-ü]/g, '') === (b || '').toLowerCase().replace(/[^a-zà-ü]/g, '');

export function leggiClienti(testo) {
  const { intestazioni, righe } = leggiCsv(testo);
  if (!intestazioni.includes('NOME') || !intestazioni.includes('NATO IL')) {
    throw new Error('Non sembra la "lista clienti" di APP Palestre.');
  }
  return righe.map((r) => {
    // chi si è registrato dall'app a volte ha scritto nome e cognome nello stesso campo
    let nome = pulisci(r.NOME), cognome = pulisci(r.COGNOME);
    if (!nome || !cognome) {
      const intero = (nome || cognome || '').split(' ');
      nome = intero.length > 1 ? intero.slice(0, -1).join(' ') : intero[0] || null;
      cognome = intero.length > 1 ? intero[intero.length - 1] : '';
    }
    const email = minuscolo(r.EMAIL);
    const cf = pulisci(r['CODICE FISCALE'])?.toUpperCase() || null;
    const nascita = leggiData(r['NATO IL']) || nascitaDaCf(cf);
    const ragione = pulisci(r['RAGIONE SOCIALE']);
    // chi paga è un'altra persona (di solito il genitore) se l'intestazione è diversa dal cliente
    const intestatario = ragione && !stesso(ragione, `${nome} ${cognome}`) && !stesso(ragione, `${cognome} ${nome}`)
      ? ragione : null;
    const cellulare = pulisci(r.CELLULARE);
    const telefono = cellulare ? unisci(r.PREFISSO, cellulare) : pulisci(r.TELEFONO);
    const viaFattura = unisci(r['VIA (FATTURA)'], r['CIVICO (FATTURA)']);
    const sesso = pulisci(r.SESSO);
    return {
      chiave: chiaveCliente(r.NOME, r.COGNOME, r.EMAIL),
      nome, cognome, email,
      telefono,
      nascita,
      luogo: pulisci(r['LUOGO DI NASCITA']),
      cf,
      sesso: sesso === 'Femmina' ? 'F' : sesso === 'Maschio' ? 'M' : null,
      indirizzo: viaFattura || unisci(r.VIA, r['NUMERO CIVICO']),
      cap: soloCap(viaFattura ? r['CAP (FATTURA)'] : r.CAP),
      citta: pulisci(viaFattura ? r['COMUNE (FATTURA)'] : r.COMUNE),
      provincia: pulisci(r.PROVINCIA),
      intestatario,
      tessera: pulisci(r.TESSERA),
      certificato: leggiData(r['ATTESTATO MEDICO SCADENZA']),
      prima: leggiData(r['DATA PRIMA ISCRIZIONE']),
      quota_dal: leggiData(r['DATA INIZIO ISCRIZIONE']),
      nota: pulisci(r.NOTA),
      bloccato: pulisci(r.STATO) === 'Bloccato',
    };
  }).filter((r) => r.nome);
}

export function leggiAbbonamenti(testo) {
  const { intestazioni, righe } = leggiCsv(testo);
  if (!intestazioni.includes('ABBONAMENTO') || !intestazioni.includes('DAL')) {
    throw new Error('Non sembra la "lista abbonamenti" di APP Palestre.');
  }
  return righe.map((r) => ({
    chiave: chiaveCliente(r.NOME, r.COGNOME, r.EMAIL),
    abbonamento: pulisci(r.ABBONAMENTO),
    dal: leggiData(r.DAL),
    al: leggiData(r.AL),
    stato: minuscolo(r.STATO),
    esaurito: minuscolo(r.ESAURITO) === 'esaurito',
    restanti: /^\d+$/.test(String(r.RESTANTI).trim()) ? Number(r.RESTANTI) : null,
    valore_cent: Number.isFinite(parseFloat(r.VALORE)) ? Math.round(parseFloat(r.VALORE) * 100) : null,
  })).filter((r) => r.abbonamento && r.chiave !== '||');
}
