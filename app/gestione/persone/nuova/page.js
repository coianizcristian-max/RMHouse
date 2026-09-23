import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import NuovaPersona from './NuovaPersona';

export const dynamic = 'force-dynamic';

export default async function PaginaNuovaPersona() {
  const { staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  return <NuovaPersona palestraId={staff.palestra_id} />;
}
