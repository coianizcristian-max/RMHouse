import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import Tesseramento from './Tesseramento';

export const dynamic = 'force-dynamic';

export default async function PaginaTesseramento({ searchParams }) {
  const { stagione } = await searchParams;
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const { data: pal } = await supabase.from('palestre').select('id, ente, mese_inizio_stagione').eq('id', staff.palestra_id).maybeSingle();
  const oggi = new Date();
  const corrente = oggi.getMonth() + 1 >= (pal?.mese_inizio_stagione || 9) ? oggi.getFullYear() : oggi.getFullYear() - 1;
  const s = parseInt(stagione, 10) || corrente;
  const { data: righe } = await supabase.rpc('situazione_tesseramento', { p_palestra: staff.palestra_id, p_stagione: s });
  return <Tesseramento palestra={pal || {}} stagione={s} corrente={corrente} righe={righe || []} />;
}
