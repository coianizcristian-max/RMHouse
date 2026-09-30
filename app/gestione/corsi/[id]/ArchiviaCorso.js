'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';

// Togliere un corso: archiviarlo (sparisce da calendario, sito e menù, lo storico resta)
// oppure eliminarlo del tutto se non è mai stato usato
export default function ArchiviaCorso({ corsoId, nome, attivo }) {
  const router = useRouter();
  const [invio, setInvio] = useState(false);

  async function archivia(sì) {
    if (sì && !confirm(`Archiviare "${nome}"?\n\nSparisce dal palinsesto, dal sito e dagli elenchi; le lezioni future senza nessuno dentro vengono tolte. Iscrizioni, presenze e pagamenti restano. Si può riattivare quando vuoi.`)) return;
    setInvio(true);
    const { data, error } = await supabaseBrowser().rpc('archivia_corso', { p_corso: corsoId, p_archivia: sì });
    setInvio(false);
    if (error) { alert('Operazione non riuscita.'); return; }
    if (sì && data?.iscritti_attivi > 0) alert(`Fatto. Attenzione: ${data.iscritti_attivi} persone hanno ancora un abbonamento in corso su questo corso.`);
    router.push(sì ? '/gestione/corsi' : `/gestione/corsi/${corsoId}`);
    router.refresh();
  }

  async function elimina() {
    if (!confirm(`Eliminare per sempre "${nome}"? Si può solo se non ha mai avuto iscrizioni, prove, incassi o presenze.`)) return;
    setInvio(true);
    const { error } = await supabaseBrowser().rpc('elimina_corso', { p_corso: corsoId });
    setInvio(false);
    if (error) {
      alert(error.message?.includes('corso_usato')
        ? 'Questo corso è stato usato (iscrizioni, prove, incassi o presenze): non si può cancellare, ma puoi archiviarlo.'
        : 'Eliminazione non riuscita.');
      return;
    }
    router.push('/gestione/corsi');
    router.refresh();
  }

  return attivo ? (
    <>
      <button className="btn btn-piccolo" disabled={invio} onClick={() => archivia(true)}>Archivia</button>
      <button className="link-btn piccolo pericolo" disabled={invio} onClick={elimina}>Elimina</button>
    </>
  ) : (
    <button className="btn btn-piccolo btn-primario" disabled={invio} onClick={() => archivia(false)}>Riattiva il corso</button>
  );
}
