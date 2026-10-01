import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { utenteCorrente } from '@/lib/utente';
import Personal from './Personal';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Lezione privata · Ritmo Metropolitano' };

export default async function PaginaPersonal() {
  const user = await utenteCorrente();
  if (!user) redirect('/area/accedi?da=/area/personal');
  const supabase = await supabaseServer();
  const [{ data: dati }, { data: insegnanti }] = await Promise.all([supabase.rpc('area_riepilogo'), supabase.rpc('insegnanti_personal')]);
  if (!dati?.collegato) redirect('/area');
  return <Personal insegnanti={insegnanti || []} allievi={(dati.allievi || []).map((a) => ({ id: a.id, nome: a.nome }))} />;
}
