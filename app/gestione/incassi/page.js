import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import { oggiISO, spostaGiorni } from '@/lib/formato';
import Incassi from './Incassi';

export const dynamic = 'force-dynamic';

export default async function PaginaIncassi({ searchParams }) {
  const { dal, al, stato } = await searchParams;
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');

  const da = /^\d{4}-\d{2}-\d{2}$/.test(dal || '') ? dal : spostaGiorni(oggiISO(), -30);
  const a = /^\d{4}-\d{2}-\d{2}$/.test(al || '') ? al : oggiISO();

  let q = supabase.from('v_incassi').select('*').eq('palestra_id', staff.palestra_id);
  if (stato === 'attesa') q = q.eq('stato', 'in_attesa');
  else q = q.gte('created_at', `${da}T00:00:00`).lte('created_at', `${a}T23:59:59`);

  const [{ data: righe }, { data: totali }] = await Promise.all([
    q.order('created_at', { ascending: false }).limit(300),
    supabase.rpc('incassi_periodo', { p_palestra: staff.palestra_id, p_dal: da, p_al: a }),
  ]);

  return (
    <Incassi palestraId={staff.palestra_id} righe={righe || []} totali={totali || {}}
             dal={da} al={a} stato={stato || 'periodo'} />
  );
}
