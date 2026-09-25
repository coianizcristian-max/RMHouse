import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { stripeAttivo, creaCheckout, baseUrl } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

// Il cliente paga online una sua rata
export async function POST(request) {
  if (!stripeAttivo()) return NextResponse.json({ errore: 'I pagamenti online non sono ancora attivi.' }, { status: 503 });
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ errore: 'Accedi prima alla tua area.' }, { status: 401 });
  const { rata_id } = await request.json().catch(() => ({}));
  // la vede solo se è sua (regole del database)
  const { data: r } = await supabase.from('rate').select('id, descrizione, numero, di, importo_cent, stato, account ( email, stripe_customer_id )')
    .eq('id', rata_id).maybeSingle();
  if (!r || r.stato !== 'da_pagare') return NextResponse.json({ errore: 'Rata non trovata o già pagata.' }, { status: 404 });
  const sito = baseUrl(request);
  try {
    const s = await creaCheckout({
      righe: [{ descrizione: `${r.descrizione} · rata ${r.numero} di ${r.di}`, importo_cent: r.importo_cent }],
      metadata: { tipo: 'rata', rata_id: r.id, riferimento: r.id },
      cliente: r.account?.stripe_customer_id, email: r.account?.email || user.email,
      successo: `${sito}/area/pagamenti?pagato=1`, annullato: `${sito}/area/pagamenti`,
    });
    return NextResponse.json({ url: s.url });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ errore: 'Il pagamento non si è aperto. Riprova tra poco.' }, { status: 502 });
  }
}
