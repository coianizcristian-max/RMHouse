import { staffCorrente } from '@/lib/staff';
import MieiCompensi from './MieiCompensi';

export const dynamic = 'force-dynamic';

// L'insegnante vede i suoi cedolini, li controlla e li conferma (o segnala una differenza)
export default async function PaginaMieiCompensi() {
  const { supabase, staff } = await staffCorrente();
  const { data: cedolini } = await supabase.from('compensi')
    .select('id, anno, mese, ore, lezioni, totale_cent, stato, da_verificare, sostituzioni, visto_at, segnalazione, segnalata_at, pagato_at')
    .eq('staff_id', staff.id).order('anno', { ascending: false }).order('mese', { ascending: false }).limit(18);
  return <MieiCompensi cedolini={cedolini || []} />;
}
