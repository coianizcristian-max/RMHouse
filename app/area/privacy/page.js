import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { utenteCorrente } from '@/lib/utente';
import IMieiDati from './IMieiDati';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'I miei dati · Ritmo Metropolitano' };

export default async function PaginaIMieiDati() {
  const user = await utenteCorrente();
  if (!user) redirect('/area/accedi?da=/area/privacy');
  const supabase = await supabaseServer();
  const [{ data }, { data: acc }] = await Promise.all([
    supabase.rpc('area_riepilogo'),
    supabase.from('account').select('consenso_marketing, consenso_privacy_at').eq('user_id', user.id).limit(1),
  ]);
  if (!data?.collegato) redirect('/area');
  return <IMieiDati allievi={(data.allievi || []).map((a) => ({ id: a.id, nome: a.nome }))}
                    marketing={!!acc?.[0]?.consenso_marketing} privacyDal={acc?.[0]?.consenso_privacy_at || null} />;
}
