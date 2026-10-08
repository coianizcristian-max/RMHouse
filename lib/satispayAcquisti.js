import 'server-only';
import { leggiPagamento } from './satispay';
import { ricevutaAutomatica } from './ricevute';

// Un acquisto dall'app pagato con Satispay: si chiede a Satispay com'è andata (non ci si fida
// dell'avviso in sé) e, se è pagato, si completa come con la carta: iscrizione, lezioni, ricevuta.
export async function completaAcquistoSatispay(db, satispayId) {
  const { data: ao } = await db.from('acquisti_online').select('id, stato, pagamento_id, account_id').eq('satispay_id', satispayId).maybeSingle();
  if (!ao) return completaPagamentoSatispay(db, satispayId);   // non è un abbonamento: es. un workshop (query 147)
  if (ao.stato === 'completato' || ao.stato === 'errore') return { stato: ao.stato, acquisto: ao };
  const p = await leggiPagamento(satispayId);
  if (p.status === 'ACCEPTED') {
    const { error } = await db.rpc('completa_acquisto', { p_acquisto: ao.id, p_session: `satispay:${satispayId}`, p_intent: null, p_customer: null, p_subscription: null });
    if (error) throw new Error(`completa_acquisto: ${error.message}`);
    await db.from('pagamenti').update({ metodo: 'satispay', satispay_id: satispayId, stripe_session_id: null }).eq('id', ao.pagamento_id);
    await ricevutaAutomatica(db, ao.pagamento_id);
    const { data: dopo } = await db.from('acquisti_online').select('stato').eq('id', ao.id).maybeSingle();
    return { stato: dopo?.stato || 'completato', acquisto: ao };
  }
  if (p.status === 'CANCELED' || p.expired) {
    await db.from('acquisti_online').update({ stato: 'scaduto' }).eq('id', ao.id).eq('stato', 'in_attesa');
    await db.from('pagamenti').update({ stato: 'annullato' }).eq('id', ao.pagamento_id).eq('stato', 'in_attesa');
    return { stato: 'annullato', acquisto: ao };
  }
  return { stato: 'in_attesa', acquisto: ao };
}

// Un pagamento singolo (es. un workshop) pagato con Satispay: stessa regola, si rilegge da Satispay.
// Pagato: confermato (la quota annuale compresa e l'email partono da sole), ricevuta. Annullato o scaduto: resta da pagare.
export async function completaPagamentoSatispay(db, satispayId) {
  const { data: righe } = await db.from('pagamenti').select('id, stato').eq('satispay_id', satispayId).limit(2);
  if (!righe || righe.length !== 1) return { stato: 'sconosciuto' };
  const pg = righe[0];
  if (pg.stato !== 'in_attesa') return { stato: pg.stato };
  const p = await leggiPagamento(satispayId);
  if (p.status === 'ACCEPTED') {
    const { error } = await db.rpc('conferma_pagamento_online', { p_pagamento: pg.id, p_session: `satispay:${satispayId}`, p_intent: null });
    if (error) throw new Error(`conferma_pagamento_online: ${error.message}`);
    await db.from('pagamenti').update({ metodo: 'satispay', stripe_session_id: null }).eq('id', pg.id);
    await ricevutaAutomatica(db, pg.id);
    return { stato: 'pagato' };
  }
  if (p.status === 'CANCELED' || p.expired) {
    await db.from('pagamenti').update({ satispay_id: null }).eq('id', pg.id).eq('stato', 'in_attesa');
    return { stato: 'annullato' };
  }
  return { stato: 'in_attesa' };
}
