import { impostazioni } from '../dati';
import Ruoli from './Ruoli';

export const dynamic = 'force-dynamic';

export default async function PaginaRuoli() {
  const { supabase, staff } = await impostazioni('id');
  const [{ data: ruoli }, { data: persone }] = await Promise.all([
    supabase.from('ruoli').select('*').eq('palestra_id', staff.palestra_id).order('nome'),
    supabase.from('staff').select('id, nome, cognome, ruolo, ruolo_id, user_id').eq('palestra_id', staff.palestra_id)
      .eq('attivo', true).order('nome'),
  ]);
  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Impostazioni</div>
        <h1>Ruoli e accessi</h1>
        <p>
          Ognuno ha un ruolo di base: amministrazione (tutto), segreteria (tutto tranne le impostazioni riservate),
          insegnante (le sue lezioni). Qui crei profili su misura che nascondono parti del gestionale.
        </p>
      </div>
      <Ruoli ruoli={ruoli || []} persone={persone || []} admin={staff.ruolo === 'admin'} palestraId={staff.palestra_id} />
    </>
  );
}
