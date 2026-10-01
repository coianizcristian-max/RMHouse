import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { utenteCorrente } from '@/lib/utente';
import EventiArea from './EventiArea';

export const dynamic = 'force-dynamic';

export default async function PaginaEventiArea() {
  const supabase = await supabaseServer();
  const user = await utenteCorrente();
  if (!user) redirect('/area/accedi');

  const [{ data: riepilogo }, { data: eventi }] = await Promise.all([
    supabase.rpc('area_riepilogo'),
    supabase.rpc('eventi_area'),
  ]);
  if (!riepilogo?.collegato) redirect('/area');

  return <EventiArea eventi={eventi || []} allievi={riepilogo.allievi || []} />;
}
