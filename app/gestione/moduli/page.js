import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import Moduli from './Moduli';

export const dynamic = 'force-dynamic';

export default async function PaginaModuli({ searchParams }) {
  const { m } = await searchParams;
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const p = staff.palestra_id;
  const [{ data: situazione }, { data: moduli }, { data: mancano }] = await Promise.all([
    supabase.rpc('situazione_moduli', { p_palestra: p }),
    supabase.from('moduli').select('*').eq('palestra_id', p).order('ordine').order('titolo'),
    m ? supabase.rpc('chi_manca_modulo', { p_palestra: p, p_modulo: m }) : Promise.resolve({ data: null }),
  ]);
  return <Moduli palestraId={p} situazione={situazione || []} moduli={moduli || []} scelto={m} mancano={mancano} />;
}
