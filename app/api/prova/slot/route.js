import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { palestraPubblica } from '@/lib/palestra';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f-]{36}$/i;

// Lezioni prenotabili per la prova dei corsi indicati: ?corsi=id1,id2
export async function GET(request) {
  const ids = (request.nextUrl.searchParams.get('corsi') || '').split(',').filter((x) => UUID.test(x)).slice(0, 20);
  if (!ids.length) return NextResponse.json({ slot: [] });

  try {
    const pal = await palestraPubblica();
    const da = new Date(Date.now() + pal.preavviso_ore * 3600_000).toISOString();
    const a = new Date(Date.now() + pal.giorni_prenotabili * 86400_000).toISOString();

    const { data, error } = await supabaseAdmin()
      .from('v_lezioni')
      .select('id, corso_id, corso_nome, inizio, fine, sala_nome, insegnante_nome, capienza, partecipanti, prove, max_prove_per_lezione')
      .eq('palestra_id', pal.id)
      .in('corso_id', ids)
      .eq('stato', 'programmata')
      .gt('inizio', da)
      .lt('inizio', a)
      .order('inizio');
    if (error) throw error;

    const slot = data
      .filter((l) => l.prove < l.max_prove_per_lezione && (l.capienza == null || l.partecipanti < l.capienza))
      .map(({ id, corso_id, corso_nome, inizio, fine, sala_nome, insegnante_nome }) =>
        ({ id, corso_id, corso_nome, inizio, fine, sala_nome, insegnante_nome }));
    return NextResponse.json({ slot });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ errore: 'Orari non disponibili al momento.' }, { status: 500 });
  }
}
