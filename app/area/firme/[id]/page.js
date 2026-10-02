import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase/server';
import { utenteCorrente } from '@/lib/utente';
import FoglioFirma from '../../../gestione/firme/FoglioFirma';
import StampaArea from './StampaArea';

export const dynamic = 'force-dynamic';

// La copia di un documento firmato, per il cliente: si vede e si salva in PDF
export default async function MiaFirma({ params }) {
  const { id } = await params;
  const user = await utenteCorrente();
  if (!user) redirect('/area/accedi');
  const supabase = await supabaseServer();
  // si legge solo se è sua o dei figli (regola del database)
  const { data: f } = await supabase.from('firme').select('*, allievi ( nome, cognome, data_nascita, codice_fiscale )').eq('id', id).maybeSingle();
  if (!f) notFound();
  const [{ data: pal }, { data: modulo }] = await Promise.all([
    supabase.from('palestre').select('nome, dati_fiscali, indirizzo').eq('id', f.palestra_id).maybeSingle(),
    supabase.from('moduli').select('scelte').eq('id', f.modulo_id).maybeSingle(),
  ]);
  return (
    <>
      <div className="senza-stampa firma-area-barra">
        <Link prefetch={false} className="torna" href="/area/io">Io</Link>
        <StampaArea />
      </div>
      <FoglioFirma f={f} pal={pal} scelte={modulo?.scelte} />
    </>
  );
}
