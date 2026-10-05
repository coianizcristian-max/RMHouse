import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { stripeAttivo, stripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

// La segreteria ferma il rinnovo automatico di un cliente (anche quando annulla l'iscrizione):
// l'abbonamento su Stripe si chiude subito e non arrivano più addebiti.
export async function POST(request) {
  if (!stripeAttivo()) return NextResponse.json({ errore: 'I pagamenti online non sono attivi.' }, { status: 503 });
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ errore: 'Non autorizzato.' }, { status: 401 });
  const { data: staff } = await supabase.from('staff').select('palestra_id, ruolo').eq('user_id', user.id).eq('attivo', true).limit(1).maybeSingle();
  if (!staff || staff.ruolo === 'insegnante') return NextResponse.json({ errore: 'Servono i permessi di segreteria.' }, { status: 403 });

  const b = await request.json().catch(() => ({}));
  const ids = (Array.isArray(b.ids) ? b.ids : [b.id]).filter((x) => /^[0-9a-f-]{36}$/i.test(x || '')).slice(0, 10);
  if (!ids.length) return NextResponse.json({ errore: 'Nessun rinnovo indicato.' }, { status: 400 });

  const db = supabaseAdmin();
  const { data: righe } = await db.from('abbonamenti_ricorrenti').select('id, stato, stripe_subscription_id')
    .in('id', ids).eq('palestra_id', staff.palestra_id);
  const esiti = [];
  for (const r of righe || []) {
    if (r.stato === 'annullato') { esiti.push({ id: r.id, ok: true, gia: true }); continue; }
    try {
      if (r.stripe_subscription_id) await stripe('DELETE', `subscriptions/${r.stripe_subscription_id}`);
      await db.from('abbonamenti_ricorrenti').update({ stato: 'annullato', annullato_at: new Date().toISOString() }).eq('id', r.id);
      esiti.push({ id: r.id, ok: true });
    } catch (e) {
      // già chiuso su Stripe: va bene lo stesso
      if (e.stripe?.code === 'resource_missing') {
        await db.from('abbonamenti_ricorrenti').update({ stato: 'annullato', annullato_at: new Date().toISOString() }).eq('id', r.id);
        esiti.push({ id: r.id, ok: true });
      } else esiti.push({ id: r.id, ok: false, errore: e.message });
    }
  }
  const falliti = esiti.filter((x) => !x.ok);
  if (falliti.length) return NextResponse.json({ errore: `Stripe non ha chiuso il rinnovo: ${falliti[0].errore}. Riprova o chiudilo dalla dashboard di Stripe.`, esiti }, { status: 502 });
  return NextResponse.json({ ok: true, esiti });
}
