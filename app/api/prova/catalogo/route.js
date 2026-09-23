import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { palestraPubblica } from '@/lib/palestra';

export const dynamic = 'force-dynamic';

// Catalogo pubblico per il percorso di prova: discipline, fasce d'età, livelli, corsi prenotabili
export async function GET() {
  try {
    const pal = await palestraPubblica();
    const db = supabaseAdmin();
    const [disc, fasce, livelli, corsi, cat] = await Promise.all([
      db.from('discipline').select('id, nome, descrizione, categoria_id').eq('palestra_id', pal.id).eq('attiva', true).order('ordine'),
      db.from('fasce_eta').select('id, nome, eta_min, eta_max, adulti').eq('palestra_id', pal.id).order('ordine'),
      db.from('livelli').select('id, nome, descrizione').eq('palestra_id', pal.id).order('ordine'),
      db.from('corsi')
        .select('id, nome, descrizione, disciplina_id, fascia_eta_id, livello_id, prezzo_prova_cent')
        .eq('palestra_id', pal.id).eq('attivo', true).eq('prova_abilitata', true).order('nome'),
      db.from('categorie').select('id, nome, descrizione').eq('palestra_id', pal.id).eq('attiva', true).order('ordine'),
    ]);
    const err = disc.error || fasce.error || livelli.error || corsi.error || cat.error;
    if (err) throw err;
    return NextResponse.json({
      palestra: { nome: pal.nome },
      categorie: cat.data, discipline: disc.data, fasce: fasce.data, livelli: livelli.data, corsi: corsi.data,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ errore: 'Catalogo non disponibile al momento.' }, { status: 500 });
  }
}
