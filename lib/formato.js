const TZ = 'Europe/Rome';

// Un importo: 0 è "0 €" (nei conti "Gratuita" non ha senso)
// Scritto a mano (non con toLocaleString): server e telefono a volte raggruppano diverso ("1111 €" / "1.111 €")
export const euro = (cent) => {
  const c = Math.round(Number(cent) || 0);
  const neg = c < 0; const a = Math.abs(c);
  const intero = String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const dec = a % 100 ? `,${String(a % 100).padStart(2, '0')}` : '';
  return `${neg ? '-' : ''}${intero}${dec}\u00A0€`;
};

// Il prezzo di una prova o di un servizio: 0 diventa "Gratuita"
export const prezzo = (cent) => (!cent ? 'Gratuita' : euro(cent));

export const ora = (iso) =>
  new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: TZ });

export const giornoLungo = (iso) =>
  new Date(iso).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });

export const dataBreve = (iso) =>
  new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ });

// Data di oggi (YYYY-MM-DD) nel fuso della palestra
export const oggiISO = () => new Date().toLocaleDateString('sv-SE', { timeZone: TZ });

export const spostaGiorni = (iso, n) => {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// chi paga per una persona: per i minorenni è "il genitore", per gli adulti "chi paga"
export const minorenne = (nascita) => { const e = etaAl(nascita); return e != null && e < 18; };
export const etichettaPaga = (nascita, maiuscola = false) => { const t = minorenne(nascita) ? 'genitore' : 'paga'; return maiuscola ? (minorenne(nascita) ? 'Genitore' : 'Chi paga') : t; };

export const etaAl = (nascita, al = new Date()) => {
  if (!nascita) return null;
  const n = new Date(nascita);
  let e = al.getFullYear() - n.getFullYear();
  const m = al.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && al.getDate() < n.getDate())) e--;
  return e;
};

export const STATI_LEAD = {
  nuovo: 'Nuovo',
  prova_prenotata: 'Prova prenotata',
  prova_effettuata: 'Prova fatta',
  iscritto: 'Iscritto/a',
  perso: 'Non convertito',
};
