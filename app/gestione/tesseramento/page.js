import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import Tesseramento from './Tesseramento';

export const dynamic = 'force-dynamic';

export default async function PaginaTesseramento({ searchParams }) {
  const { stagione } = await searchParams;
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const { data: pal } = await supabase.from('palestre').select('id, ente, mese_inizio_stagione').eq('id', staff.palestra_id).maybeSingle();
  const oggi = new Date();
  const corrente = oggi.getMonth() + 1 >= (pal?.mese_inizio_stagione || 9) ? oggi.getFullYear() : oggi.getFullYear() - 1;
  const s = parseInt(stagione, 10) || corrente;
  // con la query 157: anche tipo/qualifica/disciplina per l'ente e le discipline dei corsi; senza, l'elenco di prima
  const [{ data: ricche, error }, { data: discipline }, { data: girati }] = await Promise.all([
    supabase.rpc('tesseramento_ente', { p_palestra: staff.palestra_id, p_stagione: s }),
    supabase.from('discipline').select('id, nome, categoria_id').eq('palestra_id', staff.palestra_id).eq('attiva', true).order('ordine').order('nome'),
    // in tutta la scuola: nome e cognome al contrario secondo il codice fiscale (query 157)
    supabase.rpc('nomi_invertiti', { p_palestra: staff.palestra_id }),
  ]);
  let righe = Array.isArray(ricche) ? ricche : null;
  if (error || !righe) {
    const { data } = await supabase.rpc('situazione_tesseramento', { p_palestra: staff.palestra_id, p_stagione: s });
    righe = data || [];
  }
  return <Tesseramento palestra={pal || {}} stagione={s} corrente={corrente} righe={righe} discipline={discipline || []}
                       girati={Array.isArray(girati) ? girati : []} />;
}
