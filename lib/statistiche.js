import { euro } from './formato';

export const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
export const MESI_STAGIONE = ['set', 'ott', 'nov', 'dic', 'gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago'];
export const GIORNI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
export const eur = (c) => euro(Math.round((Number(c) || 0) / 100) * 100);
export const pct = (v) => (v == null ? '–' : `${String(v).replace('.', ',')}%`);
export const kEur = (v) => (Math.abs(v) >= 1000 ? `${String(Math.round(v / 100) / 10).replace('.', ',')}k` : v);
export const meseDi = (iso) => MESI[Number(String(iso).slice(5, 7)) - 1];
export const quota = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
