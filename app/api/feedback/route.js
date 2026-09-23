import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

const MOTIVI = ['orari', 'prezzo', 'livello', 'distanza', 'non_mi_e_piaciuto', 'altra_struttura', 'altro'];

export async function POST(request) {
  let b;
  try { b = await request.json(); } catch { return NextResponse.json({ errore: 'Richiesta non valida.' }, { status: 400 }); }
  if (!/^[0-9a-f-]{36}$/i.test(b.token || '') || !MOTIVI.includes(b.motivo)) {
    return NextResponse.json({ errore: 'Scegli un motivo.' }, { status: 400 });
  }
  const { error } = await supabaseAdmin().rpc('registra_feedback', {
    p_token: b.token, p_motivo: b.motivo, p_testo: String(b.testo || '').slice(0, 1000),
  });
  if (error) {
    return NextResponse.json({ errore: error.message.includes('link_non_valido') ? 'Link non valido.' : 'Invio non riuscito, riprova.' }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
