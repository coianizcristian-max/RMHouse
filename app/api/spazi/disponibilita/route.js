import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { palestraPubblica } from '@/lib/palestra';

export const dynamic = 'force-dynamic';

// Dice se la sala è libera in quella fascia e quanto costa
export async function GET(request) {
  const q = request.nextUrl.searchParams;
  const sala = q.get('sala');
  const inizio = q.get('inizio');
  const fine = q.get('fine');
  if (!/^[0-9a-f-]{36}$/i.test(sala || '') || !inizio || !fine) {
    return NextResponse.json({ errore: 'Richiesta non valida.' }, { status: 400 });
  }
  try {
    const pal = await palestraPubblica();
    const db = supabaseAdmin();
    // solo le sale affittabili di questa scuola
    const { data: s } = await db.from('sale').select('id').eq('id', sala).eq('palestra_id', pal.id).eq('affittabile', true).maybeSingle();
    if (!s) return NextResponse.json({ errore: 'Sala non disponibile per l\'affitto.' }, { status: 404 });
    const [libera, prezzo, occupato] = await Promise.all([
      db.rpc('sala_libera', { p_sala: sala, p_inizio: inizio, p_fine: fine }),
      db.rpc('prezzo_spazio', { p_palestra: pal.id, p_sala: sala, p_inizio: inizio, p_fine: fine }),
      db.rpc('occupazioni_sala', { p_sala: sala, p_inizio: inizio, p_fine: fine }),
    ]);
    return NextResponse.json({
      libera: libera.data === true,
      prezzo: prezzo.data || null,
      occupato: (occupato.data || []).map((o) => ({ inizio: o.inizio, fine: o.fine })),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ errore: 'Verifica non riuscita. Riprova.' }, { status: 500 });
  }
}
