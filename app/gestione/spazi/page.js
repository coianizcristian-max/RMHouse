import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import { oggiISO } from '@/lib/formato';
import Spazi from './Spazi';

export const dynamic = 'force-dynamic';

export default async function PaginaSpazi({ searchParams }) {
  const { giorno } = await searchParams;
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const p = staff.palestra_id;
  const data = /^\d{4}-\d{2}-\d{2}$/.test(giorno || '') ? giorno : oggiISO();

  const [richieste, prossime, agenda, sale, pacchetti, numeri] = await Promise.all([
    supabase.from('prenotazioni_spazi').select('*, sale ( nome )').eq('palestra_id', p)
      .eq('stato', 'richiesta').order('inizio'),
    supabase.from('prenotazioni_spazi').select('*, sale ( nome )').eq('palestra_id', p)
      .in('stato', ['opzione', 'confermata']).gte('inizio', new Date().toISOString()).order('inizio').limit(30),
    supabase.from('v_agenda_sale').select('*').eq('palestra_id', p).eq('data', data).order('inizio'),
    supabase.from('sale').select('id, nome, capienza').eq('palestra_id', p).order('nome'),
    supabase.from('pacchetti_evento').select('id, nome, durata_min, prezzo_cent').eq('palestra_id', p).eq('attivo', true),
    supabase.rpc('statistiche_spazi', { p_palestra: p, p_dal: oggiISO().slice(0, 8) + '01', p_al: oggiISO() }),
  ]);

  return (
    <Spazi
      palestraId={p} giorno={data}
      richieste={richieste.data || []} prossime={prossime.data || []} agenda={agenda.data || []}
      sale={sale.data || []} pacchetti={pacchetti.data || []} numeri={numeri.data || {}}
    />
  );
}
