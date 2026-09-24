import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import { oggiISO, spostaGiorni } from '@/lib/formato';
import Fatture from './Fatture';

export const dynamic = 'force-dynamic';

export default async function PaginaFatture({ searchParams }) {
  const { dal, al, tipo = 'passiva', stato } = await searchParams;
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const p = staff.palestra_id;

  const da = /^\d{4}-\d{2}-\d{2}$/.test(dal || '') ? dal : spostaGiorni(oggiISO(), -120);
  const a = /^\d{4}-\d{2}-\d{2}$/.test(al || '') ? al : oggiISO();

  let q = supabase.from('fatture').select('*').eq('palestra_id', p).eq('tipo', tipo)
    .gte('data', da).lte('data', a);
  if (stato) q = q.eq('stato', stato);

  const [{ data: righe }, { data: quadratura }] = await Promise.all([
    q.order('data', { ascending: false }).limit(300),
    supabase.rpc('quadratura_fatture', { p_palestra: p, p_dal: da, p_al: a }),
  ]);

  return <Fatture righe={righe || []} quadratura={quadratura || {}} dal={da} al={a} tipo={tipo} stato={stato || ''} />;
}
