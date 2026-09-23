import Link from 'next/link';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import Riepilogo from './Riepilogo';

export const dynamic = 'force-dynamic';

export default async function Area() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/area/accedi');

  // al primo ingresso si collega l'utente all'anagrafica della segreteria
  await supabase.rpc('collega_account');
  const { data } = await supabase.rpc('area_riepilogo');

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

  return <Riepilogo dati={data} />;
}
