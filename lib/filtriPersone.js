// Filtri della pagina Persone, usati sia dall'elenco sia dall'export CSV
export const CAMPANELLI = {
  certificato_scaduto: 'Certificato scaduto',
  quota_mancante: 'Quota da pagare',
  senza_orari: 'Senza giorni assegnati',
  compleanno: 'Compleanno questa settimana',
  senza_email: 'Senza email',
};

export function applicaFiltri(query, { q, stato, campanello, etichetta }) {
  let r = query;
  if (q?.trim()) r = r.ilike('ricerca', `%${q.trim().toLowerCase()}%`);
  if (stato === 'attivi') r = r.eq('attivo', true);
  else if (stato === 'nuovi') r = r.gte('prima_data', new Date().toISOString().slice(0, 8) + '01');
  else if (stato) r = r.eq('stato', stato);
  if (campanello === 'compleanno') r = r.eq('attivo', true).gte('giorni_al_compleanno', 0).lte('giorni_al_compleanno', 6);
  else if (campanello === 'senza_email') r = r.is('email', null);
  else if (campanello && CAMPANELLI[campanello]) r = r.eq(campanello, true);
  if (etichetta) r = r.contains('etichette_id', [etichetta]);
  return r;
}
