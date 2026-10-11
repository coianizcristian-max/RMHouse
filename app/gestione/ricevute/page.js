import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import { oggiISO, spostaGiorni } from '@/lib/formato';
import Ricevute from './Ricevute';

export const dynamic = 'force-dynamic';

// Ricevute, fatture e note di credito: elenco con filtri (periodo, metodo, abbonamento, documento, cliente),
// statistiche, e le azioni su ogni documento (stampa, PDF, reinvia, modifica, rimborso, annulla). Query 155.
export default async function PaginaRicevute({ searchParams }) {
  const { dal, al, vista } = await searchParams;
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const p = staff.palestra_id;

  const da = /^\d{4}-\d{2}-\d{2}$/.test(dal || '') ? dal : spostaGiorni(oggiISO(), -60);
  const a = /^\d{4}-\d{2}-\d{2}$/.test(al || '') ? al : oggiISO();

  const [{ data: righe, error }, { data: mancanti }, { data: tipi }, { data: pal }] = await Promise.all([
    supabase.rpc('cerca_ricevute', { p_palestra: p, p_dal: da, p_al: a }),
    supabase.rpc('ricevute_mancanti', { p_palestra: p, p_dal: da, p_al: a }),
    supabase.from('tipi_abbonamento').select('id, nome, famiglia, archiviato').eq('palestra_id', p).order('nome'),
    supabase.from('palestre').select('mese_inizio_stagione').eq('id', p).maybeSingle(),
  ]);

  return (
    <Ricevute palestraId={p} righeIniziali={Array.isArray(righe) ? righe : []} mancantiIniziali={mancanti || []} tipi={tipi || []}
              dal={da} al={a} oggi={oggiISO()} meseStagione={pal?.mese_inizio_stagione || 9}
              vistaIniziale={vista === 'statistiche' ? 'statistiche' : 'elenco'}
              errore={error ? (error.message?.includes('cerca_ricevute') ? 'Manca la query 155 in Supabase.' : 'Non riesco a leggere le ricevute.') : ''} />
  );
}
