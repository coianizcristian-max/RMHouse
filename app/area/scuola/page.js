import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { utenteCorrente } from '@/lib/utente';
import Scuola from './Scuola';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'La scuola · Ritmo Metropolitano' };

export default async function PaginaScuola() {
  const user = await utenteCorrente();
  if (!user) redirect('/area/accedi?da=/area/scuola');
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc('scuola_area');
  if (!data) redirect('/area');
  return <Scuola s={data} />;
}
