import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { stripeAttivo, creaCheckout, baseUrl } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

// La segreteria crea un link di pagamento per un incasso in attesa o per una rata, da mandare al cliente
export async function POST(request) {
  if (!stripeAttivo()) return NextResponse.json({ errore: 'I pagamenti online non sono ancora attivi.' }, { status: 503 });
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ errore: 'Non autorizzato.' }, { status: 401 });
  const { data: staff } = await supabase.from('staff').select('ruolo').eq('user_id', user.id).eq('attivo', true).maybeSingle();
  if (!staff || staff.ruolo === 'insegnante') return NextResponse.json({ errore: 'Servono i permessi di segreteria.' }, { status: 403 });

  const { pagamento_id, rata_id } = await request.json().catch(() => ({}));
  const sito = baseUrl(request);
  let righe, metadata, email;
  if (rata_id) {
    const { data: r } = await supabase.from('rate').select('id, descrizione, numero, di, importo_cent, stato, account ( email )').eq('id', rata_id).maybeSingle();
    if (!r || r.stato !== 'da_pagare') return NextResponse.json({ errore: 'Rata non da pagare.' }, { status: 404 });
    righe = [{ descrizione: `${r.descrizione} · rata ${r.numero} di ${r.di}`, importo_cent: r.importo_cent }];
    metadata = { tipo: 'rata', rata_id: r.id, riferimento: r.id };
    email = r.account?.email;
  } else {
    const { data: p } = await supabase.from('pagamenti').select('id, descrizione, importo_cent, stato, account ( email )').eq('id', pagamento_id).maybeSingle();
    if (!p || p.stato !== 'in_attesa') return NextResponse.json({ errore: 'Incasso non in attesa.' }, { status: 404 });
    righe = [{ descrizione: p.descrizione, importo_cent: p.importo_cent }];
    metadata = { tipo: 'link', pagamento_id: p.id, riferimento: p.id };
    email = p.account?.email;
  }
  try {
    const s = await creaCheckout({ righe, metadata, email, scadenzaMinuti: 23 * 60,
      successo: `${sito}/pagato`, annullato: `${sito}/` });
    return NextResponse.json({ url: s.url });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ errore: 'Link non creato: ' + e.message }, { status: 502 });
  }
}
