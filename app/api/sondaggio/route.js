import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// Risposte al sondaggio dal link personale: una sola volta per invito
export async function POST(request) {
  const body = await request.json().catch(() => null);
  const token = body?.token;
  if (!token || !/^[0-9a-f-]{36}$/i.test(token) || typeof body?.risposte !== 'object') {
    return NextResponse.json({ errore: 'Richiesta non valida.' }, { status: 400 });
  }
  const db = supabaseAdmin();
  const { data: inv } = await db.from('sondaggi_inviti')
    .select('token, sondaggio_id, palestra_id, risposto_at, sondaggi ( domande, attivo )').eq('token', token).maybeSingle();
  if (!inv || !inv.sondaggi?.attivo) return NextResponse.json({ errore: 'Sondaggio non disponibile.' }, { status: 404 });
  if (inv.risposto_at) return NextResponse.json({ errore: 'Hai già risposto, grazie!' }, { status: 409 });

  // tengo solo risposte valide alle domande che esistono
  const pulite = {};
  for (const d of inv.sondaggi.domande || []) {
    const v = body.risposte[d.id];
    if (v === undefined || v === null || v === '') continue;
    if (d.tipo === 'stelle' && Number.isInteger(v) && v >= 1 && v <= 5) pulite[d.id] = v;
    else if (d.tipo === 'nps' && Number.isInteger(v) && v >= 0 && v <= 10) pulite[d.id] = v;
    else if (d.tipo === 'scelta' && (d.opzioni || []).includes(v)) pulite[d.id] = v;
    else if (d.tipo === 'testo' && typeof v === 'string') pulite[d.id] = v.trim().slice(0, 2000);
  }

  const { error } = await db.from('sondaggi_risposte').insert({
    sondaggio_id: inv.sondaggio_id, palestra_id: inv.palestra_id, invito_token: token, risposte: pulite,
  });
  if (error) return NextResponse.json({ errore: error.code === '23505' ? 'Hai già risposto, grazie!' : 'Invio non riuscito.' }, { status: 409 });
  await db.from('sondaggi_inviti').update({ risposto_at: new Date().toISOString() }).eq('token', token);
  return NextResponse.json({ ok: true });
}
