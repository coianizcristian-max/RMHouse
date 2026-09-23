import Link from 'next/link';
import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import Listino from './Listino';

export const dynamic = 'force-dynamic';

export default async function PaginaListino() {
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const p = staff.palestra_id;

  const [tariffe, pacchetti, sale] = await Promise.all([
    supabase.from('tariffe_spazi').select('*').eq('palestra_id', p).order('nome'),
    supabase.from('pacchetti_evento').select('*').eq('palestra_id', p).order('nome'),
    supabase.from('sale').select('id, nome').eq('palestra_id', p).order('nome'),
  ]);

  return (
    <>
      <p><Link href="/gestione/spazi">‹ Torna agli spazi</Link></p>
      <Listino palestraId={p} tariffe={tariffe.data || []} pacchetti={pacchetti.data || []} sale={sale.data || []} />
    </>
  );
}
