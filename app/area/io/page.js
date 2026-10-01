import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { utenteCorrente } from '@/lib/utente';
import Io from './Io';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Io · Ritmo Metropolitano' };

export default async function PaginaIo() {
  const user = await utenteCorrente();
  if (!user) redirect('/area/accedi?da=/area/io');
  const supabase = await supabaseServer();
  const [{ data: dati }, { data: persone }, { data: daFirmare }, { data: anagrafica }] = await Promise.all([
    supabase.rpc('area_riepilogo'),
    supabase.rpc('profilo_area'),
    supabase.rpc('moduli_da_firmare'),
    supabase.rpc('miei_dati_anagrafici'),
  ]);
  const { data: accPref } = await supabase.from('account').select('notifiche').eq('user_id', user.id).limit(1);
  const { data: richieste } = await supabase.from('richieste_cliente')
    .select('id, tipo, dati, importo_cent, stato, risposta, created_at, allievo_id').order('created_at', { ascending: false }).limit(10);
  if (!dati?.collegato) redirect('/area');
  return <Io titolare={dati.titolare} persone={persone || []} anagrafica={anagrafica || []} richieste={richieste || []} notifiche={accPref?.[0]?.notifiche || {}} moduliDaFirmare={(daFirmare || []).length} />;
}
