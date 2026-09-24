import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import { oggiISO, spostaGiorni } from '@/lib/formato';
import Banca from './Banca';

export const dynamic = 'force-dynamic';

export default async function PaginaBanca({ searchParams }) {
  const { dal, al, vista = 'da_verificare' } = await searchParams;
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const p = staff.palestra_id;

  const da = /^\d{4}-\d{2}-\d{2}$/.test(dal || '') ? dal : spostaGiorni(oggiISO(), -60);
  const a = /^\d{4}-\d{2}-\d{2}$/.test(al || '') ? al : oggiISO();

  let q = supabase.from('movimenti_banca').select('*').eq('palestra_id', p)
    .gte('data', da).lte('data', a);
  if (vista !== 'tutti') q = q.eq('stato', vista);

  const [{ data: movimenti }, { data: conti }, { data: differenze }, { data: flusso }] = await Promise.all([
    q.order('data', { ascending: false }).limit(300),
    supabase.from('conti').select('id, nome, tipo').eq('palestra_id', p).eq('attivo', true).order('nome'),
    supabase.rpc('differenze_banca', { p_palestra: p, p_dal: da, p_al: a }),
    supabase.rpc('flusso_cassa', { p_palestra: p, p_dal: da, p_al: a }),
  ]);

  return (
    <Banca palestraId={p} movimenti={movimenti || []} conti={conti || []}
           differenze={differenze || {}} flusso={flusso || {}} dal={da} al={a} vista={vista} />
  );
}
