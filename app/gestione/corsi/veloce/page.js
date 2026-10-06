import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import ModificaVeloce from './ModificaVeloce';

export const dynamic = 'force-dynamic';

// Modifica veloce: posti, prova, prenotazioni e stato di tutti i corsi in una tabella
export default async function PaginaModificaVeloce() {
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const { data: corsi } = await supabase.from('corsi')
    .select('id, nome, colore, attivo, prova_abilitata, prenotabile, prezzo_prova_cent, max_prove_per_lezione, capienza, discipline ( nome )')
    .eq('palestra_id', staff.palestra_id)
    .order('attivo', { ascending: false }).order('nome');
  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Struttura</div>
        <h1>Modifica veloce dei corsi</h1>
        <p>Posti, prova e prenotazioni di tutti i corsi in una tabella: ogni modifica si salva da sola. Per cambiarne tanti insieme spuntali e usa la barra in basso.</p>
      </div>
      <ModificaVeloce corsi={corsi || []} />
    </>
  );
}
