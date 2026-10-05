import { applicaRicerca } from './ricerca';
// Filtri della pagina Persone, usati sia dall'elenco sia dall'export CSV
export const CAMPANELLI = {
  certificato_scaduto: 'Certificato scaduto',
  quota_mancante: 'Quota da pagare',
  senza_orari: 'Senza giorni assegnati',
  compleanno: 'Compleanno questa settimana',
  senza_email: 'Senza email',
};

// Consensi firmati col modulo privacy: sì / no / non ancora chiesto (null)
export const CONSENSI = {
  whatsapp_si: ['consenso_whatsapp', true, 'Gruppo WhatsApp: sì'], whatsapp_no: ['consenso_whatsapp', false, 'Gruppo WhatsApp: no'], whatsapp_nd: ['consenso_whatsapp', null, 'Gruppo WhatsApp: non chiesto'],
  foto_si: ['consenso_immagini', true, 'Foto e video: sì'], foto_no: ['consenso_immagini', false, 'Foto e video: no'], foto_nd: ['consenso_immagini', null, 'Foto e video: non chiesto'],
  promo_si: ['consenso_marketing', true, 'Promozioni: sì'], promo_no: ['consenso_marketing', false, 'Promozioni: no'],
};

export function applicaFiltri(query, { q, stato, campanello, etichetta, consenso }) {
  let r = query;
  if (q?.trim()) r = applicaRicerca(r, q);
  if (stato === 'attivi') r = r.eq('attivo', true);
  else if (stato === 'nuovi') r = r.gte('prima_data', new Date().toISOString().slice(0, 8) + '01');
  else if (stato) r = r.eq('stato', stato);
  if (campanello === 'compleanno') r = r.eq('attivo', true).gte('giorni_al_compleanno', 0).lte('giorni_al_compleanno', 6);
  else if (campanello === 'senza_email') r = r.is('email', null);
  else if (campanello && CAMPANELLI[campanello]) r = r.eq(campanello, true);
  if (etichetta) r = r.contains('etichette_id', [etichetta]);
  if (consenso && CONSENSI[consenso]) {
    const [col, val] = CONSENSI[consenso];
    r = val === null ? r.is(col, null) : r.eq(col, val);
  }
  return r;
}
