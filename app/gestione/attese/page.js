import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import Attese from './Attese';

export const dynamic = 'force-dynamic';

export default async function PaginaAttese({ searchParams }) {
  const { stato = 'in_attesa' } = await searchParams;
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');

  const [{ data: righe }, { data: conta }, { data: corsi }] = await Promise.all([
    supabase.from('v_attese').select('*').eq('palestra_id', staff.palestra_id)
      .eq('stato', stato).order('corso').order('posizione').limit(200),
    supabase.rpc('conta_attese', { p_palestra: staff.palestra_id }),
    supabase.from('corsi').select('id, nome').eq('palestra_id', staff.palestra_id)
      .eq('attivo', true).order('nome'),
  ]);

  return <Attese righe={righe || []} conta={conta || {}} corsi={corsi || []} stato={stato} />;
}
