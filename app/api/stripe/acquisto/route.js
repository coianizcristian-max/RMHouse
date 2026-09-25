import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { stripeAttivo, creaCheckout, baseUrl } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

const MESSAGGI = {
  abbonamento_non_acquistabile: 'Questo abbonamento non si può acquistare online.',
  corso_non_compreso: 'Questo abbonamento non comprende il corso scelto.',
  scegli_i_giorni: 'Scegli i giorni in cui verrai.',
  troppi_giorni: 'Hai scelto più giorni di quelli compresi nell\'abbonamento.',
  prezzo_mancante: 'Prezzo non disponibile: chiedi in segreteria.',
};

// Acquisto di un abbonamento dall'area clienti: prepara l'iscrizione e apre la cassa di Stripe
export async function POST(request) {
  if (!stripeAttivo()) return NextResponse.json({ errore: 'I pagamenti online non sono ancora attivi.' }, { status: 503 });
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ errore: 'Accedi prima alla tua area.' }, { status: 401 });
  const b = await request.json().catch(() => ({}));

  const { data: a, error } = await supabase.rpc('prepara_acquisto', { p: {
    allievo_id: b.allievo_id, tipo_abbonamento_id: b.tipo_abbonamento_id, corso_id: b.corso_id,
    orari: Array.isArray(b.orari) ? b.orari.slice(0, 7) : [], data_inizio: b.data_inizio || null, ricorrente: !!b.ricorrente,
  } });
  if (error) {
    const k = Object.keys(MESSAGGI).find((x) => error.message?.includes(x));
    return NextResponse.json({ errore: MESSAGGI[k] || 'Acquisto non riuscito.' }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: acc } = await db.from('account').select('email, stripe_customer_id').eq('user_id', user.id).limit(1).maybeSingle();
  const sito = baseUrl(request);
  const metadata = { tipo: 'acquisto', acquisto_id: a.acquisto_id, pagamento_id: a.pagamento_id, riferimento: a.acquisto_id };
  try {
    const righe = a.righe.map((r, i) => ({ ...r, ricorrente: i === 0 }));   // solo l'abbonamento si ripete, la quota no
    const s = await creaCheckout({
      righe, metadata, ricorrente: a.ricorrente, cliente: acc?.stripe_customer_id, email: acc?.email || user.email,
      successo: `${sito}/abbonamento/grazie?s={CHECKOUT_SESSION_ID}`, annullato: `${sito}/abbonamento?annullato=1`,
    });
    await db.from('acquisti_online').update({ stripe_session_id: s.id }).eq('id', a.acquisto_id);
    await db.from('pagamenti').update({ stripe_session_id: s.id }).eq('id', a.pagamento_id);
    return NextResponse.json({ url: s.url });
  } catch (e) {
    console.error(e);
    await db.from('pagamenti').update({ stato: 'annullato' }).eq('id', a.pagamento_id);
    await db.from('acquisti_online').update({ stato: 'errore', errore: e.message }).eq('id', a.acquisto_id);
    return NextResponse.json({ errore: 'Il pagamento non si è aperto. Riprova tra poco.' }, { status: 502 });
  }
}
