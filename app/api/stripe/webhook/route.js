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

// una funzione del database che non riesce deve far fallire l'evento: Stripe lo rimanda più tardi
async function rpc(db, nome, args) {
  const { data, error } = await db.rpc(nome, args);
  if (error) throw new Error(`${nome}: ${error.message}`);
  return data;
}

async function ricevutaAutomatica(db, pagamentoId) {
  if (!pagamentoId) return;
  const { data: pal } = await db.from('pagamenti').select('palestre ( stripe )').eq('id', pagamentoId).maybeSingle();
  if (pal?.palestre?.stripe?.ricevuta_automatica === false) return;
  // la ricevuta non blocca l'incasso: se non riesce si emette a mano dalla scheda
  const { data: ricevuta, error } = await db.rpc('emetti_ricevuta', { p_pagamento: pagamentoId });
  if (error) { console.error('Ricevuta automatica non emessa', pagamentoId, error.message); return; }
  // e la manda per email al cliente (se ha un'email): se non riesce resta da scaricare nell'app
  const { error: e2 } = await db.rpc('invia_ricevuta_email', { p_id: ricevuta });
  if (e2) console.error('Ricevuta non inviata per email', ricevuta, e2.message);
}

async function segnaCommissione(db, intent) {
  const fee = await commissioneDi(intent);
  if (fee != null) await db.from('pagamenti').update({ commissione_cent: fee }).eq('stripe_payment_intent', intent);
}

// Il giorno dopo una data (YYYY-MM-DD), alle 6 di mattina in Italia, in secondi
function giornoDopoAlleSei(data) {
  const d = new Date(`${data}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1);
  const g = d.toISOString().slice(0, 10);
  const prova = new Date(`${g}T06:00:00Z`);
  const ore = Number(new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', hourCycle: 'h23' }).format(prova));
  return Math.floor(prova.getTime() / 1000) - (ore - 6) * 3600;
}

// Rinnovo automatico (mese solare): il primo mese è appena stato pagato; su Stripe si crea il rinnovo con la carta
// salvata e il primo addebito il 1° del mese dopo la scadenza (prova gratuita fino a quel giorno, senza importi a metà).
async function attivaRinnovo(db, acquistoId, iscrizioneId, s, intent) {
  const { data: gia } = await db.from('abbonamenti_ricorrenti').select('id').eq('ultima_iscrizione_id', iscrizioneId).maybeSingle();
  if (gia) return;
  const { data: q } = await db.from('acquisti_online')
    .select('palestra_id, allievi ( nome, cognome ), corsi ( nome ), tipi_abbonamento ( nome, durata_mesi, prezzo_cent, prezzo_web_cent )')
    .eq('id', acquistoId).maybeSingle();
  const { data: i } = await db.from('iscrizioni').select('data_fine').eq('id', iscrizioneId).maybeSingle();
  try {
    const pi = await stripe('GET', `payment_intents/${intent}`);
    const cliente = s.customer || pi.customer;
    if (!pi.payment_method || !cliente) throw new Error('carta non salvata');
    const t = q.tipi_abbonamento;
    const prodotto = await stripe('POST', 'products', { name: `${t.nome} · ${q.corsi.nome} · ${q.allievi.nome}`.slice(0, 250) }, `prodotto-${acquistoId}`);
    const sub = await stripe('POST', 'subscriptions', {
      customer: cliente,
      default_payment_method: pi.payment_method,
      items: [{ price_data: { currency: 'eur', product: prodotto.id, unit_amount: t.prezzo_web_cent || t.prezzo_cent,
                              recurring: { interval: 'month', interval_count: Math.max(1, t.durata_mesi || 1) } } }],
      trial_end: giornoDopoAlleSei(i.data_fine),
      proration_behavior: 'none',
      metadata: { tipo: 'rinnovo', acquisto_id: acquistoId },
    }, `rinnovo-${acquistoId}`);
    await rpc(db, 'collega_ricorrente', { p_acquisto: acquistoId, p_subscription: sub.id });
  } catch (e) {
    console.error('Rinnovo automatico non attivato', acquistoId, e.message);
    await db.from('promemoria').insert({ palestra_id: q?.palestra_id, data: new Date().toISOString().slice(0, 10), creato_da: 'Stripe',
      testo: `Rinnovo automatico non attivato per ${q?.allievi?.nome || ''} ${q?.allievi?.cognome || ''}: il mese è pagato, il prossimo va rinnovato a mano o rifatto dall'app (${e.message}).` });
  }
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
      const iscr = await rpc(db, 'completa_acquisto', {
        p_acquisto: m.acquisto_id, p_session: s.id, p_intent: intent, p_customer: s.customer || null, p_subscription: s.subscription || null,
      });
      if (intent) {
        await db.from('pagamenti').update({ stripe_payment_intent: intent }).eq('id', m.pagamento_id);
        await segnaCommissione(db, intent);
      }
      await ricevutaAutomatica(db, m.pagamento_id);
      if (iscr && m.ricorrente === '1' && !s.subscription) await attivaRinnovo(db, m.acquisto_id, iscr, s, intent);
      return iscr ? 'iscrizione creata' : 'pagato, iscrizione da sistemare a mano';
    }
    if (m.tipo === 'rata') {
      const pag = await rpc(db, 'paga_rata_online', { p_rata: m.rata_id, p_session: s.id, p_intent: intent });
      if (intent) await segnaCommissione(db, intent);
      await ricevutaAutomatica(db, pag);
      return pag ? 'rata pagata' : 'rata già pagata';
    }
    if (m.pagamento_id) {   // prova o link di pagamento della segreteria
      await rpc(db, 'conferma_pagamento_online', { p_pagamento: m.pagamento_id, p_session: s.id, p_intent: intent });
      if (intent) await segnaCommissione(db, intent);
      await ricevutaAutomatica(db, m.pagamento_id);
      return 'pagamento confermato';
    }
    return 'senza riferimenti';
  }

  if (evento.type === 'checkout.session.expired' || evento.type === 'checkout.session.async_payment_failed') {
    if (o.metadata?.pagamento_id && o.metadata?.tipo !== 'link') {
      await rpc(db, 'scadi_pagamento_online', { p_pagamento: o.metadata.pagamento_id });
    }
    return 'sessione scaduta';
  }

  if (evento.type === 'invoice.paid') {
    const inv = await stripe('GET', `invoices/${o.id}`);
    if (!inv.subscription || inv.billing_reason === 'subscription_create') return 'primo mese già registrato';
    const pag = await rpc(db, 'rinnova_ricorrente', {
      p_subscription: inv.subscription, p_importo_cent: inv.amount_paid, p_intent: inv.payment_intent,
    });
    if (inv.payment_intent) await segnaCommissione(db, inv.payment_intent);
    await ricevutaAutomatica(db, pag);
    return pag ? 'rinnovo registrato' : 'rinnovo già registrato';
  }

  if (evento.type === 'invoice.payment_failed' && o.subscription) {
    await rpc(db, 'stato_ricorrente', { p_subscription: o.subscription, p_stato: 'in_ritardo' });
    return 'rinnovo non pagato';
  }

  if (evento.type === 'customer.subscription.deleted') {
    await rpc(db, 'stato_ricorrente', { p_subscription: o.id, p_stato: 'annullato' });
    return 'rinnovo annullato';
  }

  if (evento.type === 'charge.dispute.created' && o.payment_intent) {
    const g = await rpc(db, 'segnala_contestazione', {
      p_intent: o.payment_intent, p_importo_cent: o.amount ?? null, p_motivo: o.reason || null,
      p_entro: o.evidence_details?.due_by ? new Date(o.evidence_details.due_by * 1000).toISOString() : null,
    });
    return g ? 'contestazione segnalata' : 'contestazione di un pagamento sconosciuto';
  }

  if (evento.type === 'charge.refunded' && o.payment_intent) {
    await rpc(db, 'segna_rimborso_online', { p_intent: o.payment_intent, p_rimborsato_cent: o.amount_refunded });
    return 'rimborso registrato';
  }

  return 'ignorato';
}
