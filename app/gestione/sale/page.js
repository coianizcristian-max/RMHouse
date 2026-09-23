import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import Sale from './Sale';

export const dynamic = 'force-dynamic';

export default async function PaginaSale() {
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const [{ data: sale }, { data: sedi }, { data: orari }] = await Promise.all([
    supabase.from('sale').select('*').eq('palestra_id', staff.palestra_id).order('nome'),
    supabase.from('sedi').select('id, nome').eq('palestra_id', staff.palestra_id).order('ordine'),
    supabase.from('orari').select('sala_id').eq('palestra_id', staff.palestra_id).eq('attivo', true),
  ]);

  const { data: post } = await supabase.from('postazioni').select('sala_id')
    .eq('palestra_id', staff.palestra_id).eq('attiva', true);
  const conta = {};
  (post || []).forEach((p) => { conta[p.sala_id] = (conta[p.sala_id] || 0) + 1; });

  return (
    <Sale palestraId={staff.palestra_id} sale={sale || []} sedi={sedi || []} orari={orari || []}
          postazioni={conta} />
  );
}
