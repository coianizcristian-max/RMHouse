import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import Richieste from './Richieste';

export const dynamic = 'force-dynamic';

// Le richieste che i clienti fanno dall'app: abbonamenti pagati con bonifico e lezioni private
export default async function PaginaRichieste({ searchParams }) {
  const { vista = 'aperte' } = await searchParams;
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  let q = supabase.from('richieste_cliente')
    .select('id, tipo, dati, importo_cent, stato, risposta, created_at, gestita_at, allievi ( id, nome, cognome, account ( telefono, email ) )')
    .eq('palestra_id', staff.palestra_id).order('created_at', { ascending: vista === 'aperte' }).limit(100);
  q = vista === 'aperte' ? q.eq('stato', 'da_confermare') : q.neq('stato', 'da_confermare');
  const [{ data }, { data: orari }] = await Promise.all([
    q,
    supabase.from('orari').select('id, giorno_settimana, ora_inizio').eq('palestra_id', staff.palestra_id),
  ]);
  return <Richieste richieste={data || []} vista={vista} orari={orari || []} />;
}
