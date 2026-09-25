import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import Abbonamenti from './Abbonamenti';

export const dynamic = 'force-dynamic';

export default async function PaginaAbbonamenti() {
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const p = staff.palestra_id;

  const [tipi, corsi, regole, palestra, voci, coperti, aliquote] = await Promise.all([
    supabase.from('tipi_abbonamento').select('*').eq('palestra_id', p).order('famiglia').order('nome'),
    supabase.from('corsi').select('id, nome').eq('palestra_id', p).eq('attivo', true).order('nome'),
    supabase.from('recuperi_ammessi').select('*').eq('palestra_id', p),
    supabase.from('palestre').select('id, quota_iscrizione_cent, mese_inizio_stagione, giorni_prenotabili, preavviso_ore, google_review_url, base_url, soglie').eq('id', p).maybeSingle(),
    supabase.from('voci_listino').select('*').eq('palestra_id', p).order('categoria').order('nome'),
    supabase.from('tipi_abbonamento_corsi').select('tipo_abbonamento_id, corso_id, tipi_abbonamento!inner ( palestra_id )')
      .eq('tipi_abbonamento.palestra_id', p),
    supabase.from('aliquote_iva').select('id, nome, predefinita').eq('palestra_id', p).eq('attiva', true).order('ordine'),
  ]);

  return (
    <Abbonamenti
      palestraId={p}
      tipi={tipi.data || []}
      corsi={corsi.data || []}
      regole={regole.data || []}
      palestra={palestra.data || {}}
      voci={voci.data || []}
      coperti={coperti.data || []}
      aliquote={aliquote.data || []}
    />
  );
}
