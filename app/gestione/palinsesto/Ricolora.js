'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';

// Rigenera i colori dei corsi partendo da quelli delle discipline
export default function Ricolora({ palestraId }) {
  const router = useRouter();
  const [esito, setEsito] = useState('');
  const [invio, setInvio] = useState(false);

  async function lancia(forza) {
    if (forza && !confirm('Rigenero il colore di TUTTI i corsi, anche di quelli scelti a mano. Procedo?')) return;
    setInvio(true); setEsito('');
    const { data, error } = await supabaseBrowser().rpc('ricolora_corsi', { p_palestra: palestraId, p_forza: forza });
    setInvio(false);
    setEsito(error ? 'Operazione non riuscita.' : `Ricolorati ${data} corsi.`);
    router.refresh();
  }

  return (
    <div className="scheda" style={{ marginBottom: 16 }}>
      <strong style={{ color: 'var(--nero)' }}>Colori dei corsi</strong>
      <p className="piccolo muto" style={{ marginTop: 4 }}>
        Ogni corso prende una gradazione del colore della sua disciplina, così nel calendario si riconosce
        la famiglia a colpo d'occhio. I corsi con il colore scelto a mano non vengono toccati.
      </p>
      <div className="azioni">
        <button className="btn" disabled={invio} onClick={() => lancia(false)}>Assegna i colori mancanti</button>
        <button className="btn" disabled={invio} onClick={() => lancia(true)}>Rigenera tutti</button>
      </div>
      {esito && <p className="piccolo" style={{ marginTop: 8 }}>{esito}</p>}
    </div>
  );
}
