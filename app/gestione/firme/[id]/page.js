import { notFound } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import Stampa from '../../ricevute/[id]/Stampa';
import FoglioFirma from '../FoglioFirma';

export const dynamic = 'force-dynamic';

// Il modulo firmato, com'era al momento della firma: anteprima e "Stampa o salva in PDF"
export default async function FirmaStampata({ params }) {
  const { id } = await params;
  const { supabase, staff } = await staffCorrente();
  const [{ data: f }, { data: pal }] = await Promise.all([
    supabase.from('firme').select('*, allievi ( nome, cognome, data_nascita, codice_fiscale )').eq('id', id).maybeSingle(),
    supabase.from('palestre').select('nome, dati_fiscali, indirizzo').eq('id', staff.palestra_id).maybeSingle(),
  ]);
  if (!f) notFound();
  const { data: modulo } = await supabase.from('moduli').select('scelte').eq('id', f.modulo_id).maybeSingle();
  return (
    <>
      <div className="foglio senza-stampa" style={{ paddingBottom: 0 }}><Stampa /></div>
      <FoglioFirma f={f} pal={pal} scelte={modulo?.scelte} />
    </>
  );
}
