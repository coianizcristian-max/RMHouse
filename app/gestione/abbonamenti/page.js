import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import Abbonamenti from './Abbonamenti';

export const dynamic = 'force-dynamic';

export default async function PaginaAbbonamenti({ searchParams }) {
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const p = staff.palestra_id;
  const { sezione } = await searchParams;

  const [tipi, corsi, regole, palestra, voci, coperti, aliquote, gruppi] = await Promise.all([
    supabase.from('tipi_abbonamento').select('*').eq('palestra_id', p).order('famiglia').order('nome'),
    supabase.from('corsi').select('id, nome, discipline ( nome )').eq('palestra_id', p).eq('attivo', true).order('nome'),
    supabase.from('recuperi_ammessi').select('*').eq('palestra_id', p),
    supabase.from('palestre').select('id, ore_disdetta, recuperi_max_mese, recupero_solo_disdetta').eq('id', p).maybeSingle(),
    supabase.from('voci_listino').select('*').eq('palestra_id', p).order('categoria').order('nome'),
    supabase.from('tipi_abbonamento_corsi').select('tipo_abbonamento_id, corso_id, tipi_abbonamento!inner ( palestra_id )')
      .eq('tipi_abbonamento.palestra_id', p),
    supabase.from('aliquote_iva').select('id, nome, percentuale, natura, predefinita').eq('palestra_id', p).eq('attiva', true).order('ordine'),
    supabase.from('gruppi_listino').select('id, nome, ordine').eq('palestra_id', p).order('ordine').order('nome'),
  ]);

  return (
    <Abbonamenti
      palestraId={p}
      sezioneIniziale={sezione || 'tipi'}
      tipi={tipi.data || []}
      corsi={(corsi.data || []).map((c) => ({ id: c.id, nome: c.nome, disciplina: c.discipline?.nome || 'Altri corsi' }))}
      regole={regole.data || []}
      palestra={palestra.data || {}}
      voci={voci.data || []}
      coperti={coperti.data || []}
      aliquote={aliquote.data || []}
      gruppi={gruppi.data || []}
    />
  );
}
