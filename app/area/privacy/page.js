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
  // per ogni persona: i moduli in vigore (firmati o no) e le firme, per aprirne la copia
  const moduli = {};
  await Promise.all((data.allievi || []).map(async (a) => {
    const [{ data: m }, { data: f }] = await Promise.all([
      supabase.rpc('moduli_da_firmare', { p_allievo: a.id }),
      supabase.from('firme').select('id, modulo_id, versione, titolo, firmato_at').eq('allievo_id', a.id).order('firmato_at', { ascending: false }),
    ]);
    moduli[a.id] = (m || []).map((x) => ({
      titolo: x.titolo, firmato: x.firmata_versione === x.versione, obbligatorio: x.obbligatorio,
      firma: (f || []).find((y) => y.modulo_id === x.modulo_id && y.versione === x.firmata_versione) || null,
    }));
  }));
  return <IMieiDati allievi={(data.allievi || []).map((a) => ({ id: a.id, nome: a.nome }))} moduli={moduli}
                    marketing={!!acc?.[0]?.consenso_marketing} privacyDal={acc?.[0]?.consenso_privacy_at || null} />;
}
