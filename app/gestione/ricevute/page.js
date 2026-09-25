import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import { oggiISO, spostaGiorni } from '@/lib/formato';
import Ricevute from './Ricevute';

export const dynamic = 'force-dynamic';

export default async function PaginaRicevute({ searchParams }) {
  const { dal, al } = await searchParams;
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const p = staff.palestra_id;

  const da = /^\d{4}-\d{2}-\d{2}$/.test(dal || '') ? dal : spostaGiorni(oggiISO(), -60);
  const a = /^\d{4}-\d{2}-\d{2}$/.test(al || '') ? al : oggiISO();

  const [{ data: righe }, { data: mancanti }, { data: riepilogo }] = await Promise.all([
    supabase.from('ricevute').select('*, numerazioni ( codice )').eq('palestra_id', p)
      .gte('data', da).lte('data', a).order('data', { ascending: false }).order('numero', { ascending: false }).limit(300),
    supabase.rpc('ricevute_mancanti', { p_palestra: p, p_dal: da, p_al: a }),
    supabase.rpc('riepilogo_ricevute', { p_palestra: p, p_dal: da, p_al: a }),
  ]);

  return (
    <Ricevute righe={righe || []} mancanti={mancanti || []} riepilogo={riepilogo || {}} dal={da} al={a} />
  );
}
