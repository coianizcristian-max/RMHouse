import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { firmaValida, stripe, commissioneDi } from '@/lib/stripe';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Stripe avvisa qui quando un pagamento va a buon fine, scade, viene rimborsato,
// o quando un rinnovo automatico viene pagato o annullato.
export async function POST(request) {
  const corpo = await request.text();
  if (!firmaValida(corpo, request.headers.get('stripe-signature'), process.env.STRIPE_WEBHOOK_SECRET)) {
    return NextResponse.json({ errore: 'firma non valida' }, { status: 400 });
  }
  const evento = JSON.parse(corpo);
  const db = supabaseAdmin();

  // ogni evento una volta sola
  const { error: gia } = await db.from('stripe_eventi').insert({ id: evento.id, tipo: evento.type });
  if (gia) return NextResponse.json({ ok: true, doppione: true });

  let esito = 'ignorato';
  try {
    esito = await gestisci(db, evento);
  } catch (e) {
    console.error('Webhook Stripe', evento.type, e);
    await db.from('stripe_eventi').delete().eq('id', evento.id);   // così Stripe riprova
    return NextResponse.json({ errore: 'elaborazione non riuscita' }, { status: 500 });
  }
  await db.from('stripe_eventi').update({ esito }).eq('id', evento.id);
  return NextResponse.json({ ok: true, esito });
}

async function ricevutaAutomatica(db, pagamentoId) {
  if (!pagamentoId) return;
  const { data: pal } = await db.from('pagamenti').select('palestre ( stripe )').eq('id', pagamentoId).maybeSingle();
  if (pal?.palestre?.stripe?.ricevuta_automatica === false) return;
  await db.rpc('emetti_ricevuta', { p_pagamento: pagamentoId });
}

async function segnaCommissione(db, intent) {
  const fee = await commissioneDi(intent);
  if (fee != null) await db.from('pagamenti').update({ commissione_cent: fee }).eq('stripe_payment_intent', intent);
}

async function gestisci(db, evento) {
  const o = evento.data.object;

  if (evento.type === 'checkout.session.completed' || evento.type === 'checkout.session.async_payment_succeeded') {
    // rileggo la sessione con la versione dell'API che usiamo noi
    const s = await stripe('GET', `checkout/sessions/${o.id}`);
    if (s.payment_status !== 'paid' && s.payment_status !== 'no_payment_required') return 'in_attesa';
    const m = s.metadata || {};
    let intent = s.payment_intent;
    if (!intent && s.invoice) intent = (await stripe('GET', `invoices/${s.invoice}`)).payment_intent;

    if (m.tipo === 'acquisto') {
      const { data: iscr } = await db.rpc('completa_acquisto', {
        p_acquisto: m.acquisto_id, p_session: s.id, p_intent: intent, p_customer: s.customer || null, p_subscription: s.subscription || null,
      });
      if (intent) {
        await db.from('pagamenti').update({ stripe_payment_intent: intent }).eq('id', m.pagamento_id);
        await segnaCommissione(db, intent);
      }
      await ricevutaAutomatica(db, m.pagamento_id);
      return iscr ? 'iscrizione creata' : 'pagato, iscrizione da sistemare a mano';
    }
    if (m.tipo === 'rata') {
      const { data: pag } = await db.rpc('paga_rata_online', { p_rata: m.rata_id, p_session: s.id, p_intent: intent });
      if (intent) await segnaCommissione(db, intent);
      await ricevutaAutomatica(db, pag);
      return 'rata pagata';
    }
    if (m.pagamento_id) {   // prova o link di pagamento della segreteria
      await db.rpc('conferma_pagamento_online', { p_pagamento: m.pagamento_id, p_session: s.id, p_intent: intent });
      if (intent) await segnaCommissione(db, intent);
      await ricevutaAutomatica(db, m.pagamento_id);
      return 'pagamento confermato';
    }
    return 'senza riferimenti';
  }

  if (evento.type === 'checkout.session.expired' || evento.type === 'checkout.session.async_payment_failed') {
    if (o.metadata?.pagamento_id && o.metadata?.tipo !== 'link') {
      await db.rpc('scadi_pagamento_online', { p_pagamento: o.metadata.pagamento_id });
    }
    return 'sessione scaduta';
  }

  if (evento.type === 'invoice.paid') {
    const inv = await stripe('GET', `invoices/${o.id}`);
    if (!inv.subscription || inv.billing_reason === 'subscription_create') return 'primo mese già registrato';
    const { data: pag } = await db.rpc('rinnova_ricorrente', {
      p_subscription: inv.subscription, p_importo_cent: inv.amount_paid, p_intent: inv.payment_intent,
    });
    if (inv.payment_intent) await segnaCommissione(db, inv.payment_intent);
    await ricevutaAutomatica(db, pag);
    return pag ? 'rinnovo registrato' : 'rinnovo già registrato';
  }

  if (evento.type === 'invoice.payment_failed' && o.subscription) {
    await db.rpc('stato_ricorrente', { p_subscription: o.subscription, p_stato: 'in_ritardo' });
    return 'rinnovo non pagato';
  }

  if (evento.type === 'customer.subscription.deleted') {
    await db.rpc('stato_ricorrente', { p_subscription: o.id, p_stato: 'annullato' });
    return 'rinnovo annullato';
  }

  if (evento.type === 'charge.refunded' && o.payment_intent) {
    await db.rpc('segna_rimborso_online', { p_intent: o.payment_intent, p_rimborsato_cent: o.amount_refunded });
    return 'rimborso registrato';
  }

  return 'ignorato';
}
