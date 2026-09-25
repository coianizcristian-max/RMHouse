import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';

// La palestra con tutte le impostazioni, solo per admin e segreteria
export async function impostazioni(campi = '*') {
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const { data } = await supabase.from('palestre').select(campi).eq('id', staff.palestra_id).maybeSingle();
  return { supabase, staff, palestra: data || {} };
}
