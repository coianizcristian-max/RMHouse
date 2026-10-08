import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { utenteCorrente } from '@/lib/utente';
import WorkshopArea from './WorkshopArea';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Workshop · Ritmo Metropolitano' };

export default async function PaginaWorkshopArea() {
  const user = await utenteCorrente();
  if (!user) redirect('/area/accedi?da=/area/workshop');
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc('workshop_area');
  return <WorkshopArea workshop={Array.isArray(data) ? data : []} />;
}
