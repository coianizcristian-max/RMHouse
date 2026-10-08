import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import ElencoWorkshop from './ElencoWorkshop';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Workshop' };

// Tutti i workshop: in arrivo, passati, annullati, con iscritti, posti e incassi
export default async function PaginaWorkshop() {
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const p = staff.palestra_id;
  const [{ data: workshop }, { data: momenti }, { data: opzioni }, { data: iscrizioni }] = await Promise.all([
    supabase.from('workshop').select('id, titolo, slug, sottotitolo, insegnante, locandina_url, stato, compenso_tipo, compenso_cent, compenso_percentuale, created_at')
      .eq('palestra_id', p).order('created_at', { ascending: false }),
    supabase.from('workshop_momenti').select('id, workshop_id, titolo, inizio, fine, posti').eq('palestra_id', p).order('inizio'),
    supabase.from('workshop_opzioni').select('id, workshop_id, momenti').eq('palestra_id', p),
    supabase.from('workshop_iscrizioni').select('workshop_id, opzione_id, prezzo_cent, quota_cent, esterno, pagamenti ( stato, importo_cent )')
      .eq('palestra_id', p).eq('stato', 'iscritto'),
  ]);
  return <ElencoWorkshop workshop={workshop || []} momenti={momenti || []} opzioni={opzioni || []} iscrizioni={iscrizioni || []} />;
}
