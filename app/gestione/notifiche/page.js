import { staffCorrente } from '@/lib/staff';
import MieNotifiche from './MieNotifiche';

export const dynamic = 'force-dynamic';

// Ognuno dello staff attiva le notifiche sul suo telefono e sceglie quali ricevere
export default async function PaginaNotifiche() {
  const { supabase, staff } = await staffCorrente();
  const { data: io } = await supabase.from('staff').select('notifiche').eq('id', staff.id).maybeSingle();
  return <MieNotifiche ruolo={staff.ruolo} preferenze={io?.notifiche || {}} />;
}
