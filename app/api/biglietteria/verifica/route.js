import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { erroreBiglietteria } from '@/lib/biglietteria';

export const dynamic = 'force-dynamic';

// Il parente conferma con la data di nascita dell'allievo (errori contati: dopo 8 in un giorno, bloccato)
export async function POST(request) {
  const b = await request.json().catch(() => null);
  if (!b || !/^[0-9a-f-]{36}$/i.test(b.allievo_id || '') || !/^\d{4}-\d{2}-\d{2}$/.test(b.nascita || '')) {
    return NextResponse.json({ ok: false, errore: 'Scrivi la data di nascita dell\'allievo/a.' }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin().rpc('biglietteria_verifica', { p_allievo: b.allievo_id, p_nascita: b.nascita });
  if (error) return NextResponse.json({ ok: false, errore: 'Controllo non riuscito. Riprova.' }, { status: 500 });
  if (!data?.ok) return NextResponse.json({ ok: false, errore: erroreBiglietteria(data?.errore || '') || 'Dati non corretti.' }, { status: 409 });
  return NextResponse.json(data);
}
