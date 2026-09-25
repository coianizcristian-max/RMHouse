import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import Sondaggi from './Sondaggi';

export const dynamic = 'force-dynamic';

export default async function PaginaSondaggi() {
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const p = staff.palestra_id;
  const [{ data: sondaggi }, { data: risposte }, { data: inviti }] = await Promise.all([
    supabase.from('sondaggi').select('*').eq('palestra_id', p).order('created_at', { ascending: false }),
    supabase.from('sondaggi_risposte').select('sondaggio_id').eq('palestra_id', p),
    supabase.from('sondaggi_inviti').select('sondaggio_id').eq('palestra_id', p),
  ]);
  const conta = (x, id) => (x || []).filter((r) => r.sondaggio_id === id).length;
  const elenco = (sondaggi || []).map((s) => ({ ...s, risposte: conta(risposte, s.id), inviti: conta(inviti, s.id) }));
  return <Sondaggi palestraId={p} sondaggi={elenco} />;
}
