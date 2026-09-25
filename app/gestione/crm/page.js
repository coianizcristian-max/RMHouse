import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import Pipeline from './Pipeline';

export const dynamic = 'force-dynamic';

// Le persone arrivate come contatto, a colonne secondo la fase
export default async function PaginaPipeline() {
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const p = staff.palestra_id;
  const campi = 'id, nome, cognome, eta, stato_lead, created_at, prossimo_contatto, fonte, telefono, ultimo_contatto, contatti, ultima_nota, prova, seguito_da_nome';
  const trenta = new Date(Date.now() - 30 * 86400000).toISOString();
  const [{ data: aperti }, { data: chiusi }] = await Promise.all([
    supabase.from('v_lead').select(campi).eq('palestra_id', p).in('stato_lead', ['nuovo', 'prova_prenotata', 'prova_effettuata'])
      .order('created_at', { ascending: false }).limit(300),
    supabase.from('v_lead').select(campi).eq('palestra_id', p).in('stato_lead', ['iscritto', 'perso'])
      .gte('created_at', trenta).order('created_at', { ascending: false }).limit(100),
  ]);
  return <Pipeline righe={[...(aperti || []), ...(chiusi || [])]} />;
}
