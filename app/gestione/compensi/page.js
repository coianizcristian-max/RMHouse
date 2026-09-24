import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import Compensi from './Compensi';

export const dynamic = 'force-dynamic';

export default async function PaginaCompensi({ searchParams }) {
  const { anno, mese } = await searchParams;
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');

  const oggi = new Date();
  const a = parseInt(anno, 10) || oggi.getFullYear();
  const m = parseInt(mese, 10) || oggi.getMonth() + 1;

  const { data: righe } = await supabase
    .from('compensi')
    .select('*, staff ( nome, cognome, foto_url, colore, specialita )')
    .eq('palestra_id', staff.palestra_id).eq('anno', a).eq('mese', m)
    .order('totale_cent', { ascending: false });

  return <Compensi palestraId={staff.palestra_id} righe={righe || []} anno={a} mese={m} />;
}
