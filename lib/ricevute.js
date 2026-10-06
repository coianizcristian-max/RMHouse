import 'server-only';

// Dopo un pagamento online (carta o Satispay): ricevuta emessa da sola e mandata per email.
// Se non riesce non blocca l'incasso: si emette a mano dalla scheda.
export async function ricevutaAutomatica(db, pagamentoId) {
  if (!pagamentoId) return;
  const { data: pal } = await db.from('pagamenti').select('palestre ( stripe )').eq('id', pagamentoId).maybeSingle();
  if (pal?.palestre?.stripe?.ricevuta_automatica === false) return;
  const { data: ricevuta, error } = await db.rpc('emetti_ricevuta', { p_pagamento: pagamentoId });
  if (error) { console.error('Ricevuta automatica non emessa', pagamentoId, error.message); return; }
  const { error: e2 } = await db.rpc('invia_ricevuta_email', { p_id: ricevuta });
  if (e2) console.error('Ricevuta non inviata per email', ricevuta, e2.message);
}
