import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import Importa from './Importa';

export const dynamic = 'force-dynamic';

export default async function PaginaImporta() {
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');

  const [corsi, tipi] = await Promise.all([
    supabase.from('corsi').select('id, nome').eq('palestra_id', staff.palestra_id).order('nome'),
    supabase.from('tipi_abbonamento').select('id, nome').eq('palestra_id', staff.palestra_id).order('nome'),
  ]);

  return <Importa corsi={corsi.data || []} tipi={tipi.data || []} palestraId={staff.palestra_id} />;
}
