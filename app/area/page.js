import Link from 'next/link';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { utenteCorrente } from '@/lib/utente';
import Riepilogo from './Riepilogo';
import { aspettoAreaCliente } from '@/lib/palestra';

export const dynamic = 'force-dynamic';

export default async function Area() {
  const supabase = await supabaseServer();
  const user = await utenteCorrente();
  if (!user) redirect('/area/accedi');

  // al primo ingresso si collega l'utente all'anagrafica della segreteria
  await supabase.rpc('collega_account');
  const [{ data }, { data: materiali }, { data: inVerifica }, aspetto, { data: miei }, { data: disdette }] = await Promise.all([
    supabase.rpc('area_riepilogo'),
    supabase.rpc('materiali_area'),
    supabase.from('certificati').select('allievo_id, scadenza, caricato_at').eq('stato', 'da_verificare'),
    aspettoAreaCliente(),
    supabase.from('account').select('consenso_marketing, consenso_chiesto_at').eq('user_id', user.id).limit(1),
    supabase.rpc('disdette_area'),
  ]);
  // moduli obbligatori ancora da firmare, per sé e per i figli
  // (tutte le persone insieme, non una dopo l'altra: una famiglia con tre figli aspettava tre viaggi al database)
  const moduliDaFirmare = (await Promise.all((data?.allievi || []).map(async (a) => {
    const { data: m } = await supabase.rpc('moduli_da_firmare', { p_allievo: a.id });
    return (m || []).filter((x) => x.obbligatorio && x.firmata_versione !== x.versione).length;
  }))).reduce((s, n) => s + n, 0);
  const chiediConsenso = !!miei?.[0] && !miei[0].consenso_marketing && !miei[0].consenso_chiesto_at;

  if (!data?.collegato) {
    return (
      <>
        <h1>Non ti riconosciamo</h1>
        <p>
          L'indirizzo <strong>{user.email}</strong> non risulta fra i contatti della scuola.
          Probabilmente in segreteria ne è registrato un altro, per esempio quello di un genitore.
        </p>
        <p className="piccolo muto">Scrivici e lo sistemiamo in un attimo.</p>
      </>
    );
  }

  return <Riepilogo dati={data} materiali={materiali || []} inVerifica={inVerifica || []} aspetto={aspetto} chiediConsenso={chiediConsenso} moduliDaFirmare={moduliDaFirmare}
                    disdette={disdette || {}} />;
}
