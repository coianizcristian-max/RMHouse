import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import Rinnovi from './Rinnovi';

export const dynamic = 'force-dynamic';

export default async function PaginaRinnovi({ searchParams }) {
  const { giorni = '20' } = await searchParams;
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');

  const finestra = Math.min(Math.max(parseInt(giorni, 10) || 20, 5), 90);
  const [{ data: righe }, { data: tipi }] = await Promise.all([
    supabase.rpc('da_rinnovare', { p_palestra: staff.palestra_id, p_giorni: finestra }),
    supabase.from('tipi_abbonamento').select('id, nome, prezzo_cent')
      .eq('palestra_id', staff.palestra_id).eq('attivo', true).order('nome'),
  ]);

  return <Rinnovi righe={righe || []} tipi={tipi || []} giorni={finestra} />;
}
