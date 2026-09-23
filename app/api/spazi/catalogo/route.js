import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { palestraPubblica } from '@/lib/palestra';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const pal = await palestraPubblica();
    const db = supabaseAdmin();
    const [sale, tariffe, pacchetti] = await Promise.all([
      db.from('sale').select('id, nome, capienza').eq('palestra_id', pal.id).order('nome'),
      db.from('tariffe_spazi').select('id, nome, sala_id, giorni, ora_da, ora_a, prezzo_ora_cent, minimo_ore')
        .eq('palestra_id', pal.id).eq('attiva', true),
      db.from('pacchetti_evento')
        .select('id, nome, descrizione, incluso, durata_min, prezzo_cent, ospiti_inclusi, prezzo_ospite_cent, sala_id, acconto_pct')
        .eq('palestra_id', pal.id).eq('attivo', true).eq('prenotabile_online', true).order('prezzo_cent'),
    ]);
    if (sale.error || tariffe.error || pacchetti.error) throw sale.error || tariffe.error || pacchetti.error;
    return NextResponse.json({
      palestra: { nome: pal.nome }, sale: sale.data, tariffe: tariffe.data, pacchetti: pacchetti.data,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ errore: 'Informazioni non disponibili al momento.' }, { status: 500 });
  }
}
