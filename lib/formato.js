const TZ = 'Europe/Rome';

export const euro = (cent) =>
  cent === 0 ? 'Gratuita' : (cent / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: cent % 100 ? 2 : 0 });

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

export const etaAl = (nascita, al = new Date()) => {
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
  iscritto: 'Iscritto',
  perso: 'Non convertito',
};
