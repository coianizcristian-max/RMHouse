import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import Lead from './Lead';

export const dynamic = 'force-dynamic';

const FILTRI = {
  da_seguire: ['nuovo', 'prova_effettuata'],
  prova_prenotata: ['prova_prenotata'],
  prova_effettuata: ['prova_effettuata'],
  persi: ['perso'],
  iscritti: ['iscritto'],
};

export default async function PaginaLead({ searchParams }) {
  const { vista = 'da_seguire' } = await searchParams;
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');

  let q = supabase.from('v_lead').select('*').eq('palestra_id', staff.palestra_id);
  if (vista === 'da_richiamare') {
    q = q.not('prossimo_contatto', 'is', null)
         .lte('prossimo_contatto', new Date().toLocaleDateString('sv-SE'))
         .not('stato_lead', 'in', '("iscritto","perso")');
  } else {
    q = q.in('stato_lead', FILTRI[vista] || FILTRI.da_seguire);
  }

  const [{ data: righe }, { data: conta }] = await Promise.all([
    q.order('prossimo_contatto', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false }).limit(200),
    supabase.rpc('conta_lead', { p_palestra: staff.palestra_id }),
  ]);

  return <Lead righe={righe || []} conta={conta || {}} vista={vista} />;
}
