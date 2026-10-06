'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';

// Le feste nazionali della stagione in un colpo (senza doppioni, senza un avviso per ogni festa)
export default function Festivita({ palestraId }) {
  const router = useRouter();
  const ora = new Date();
  const stagione = ora.getMonth() + 1 >= 8 ? ora.getFullYear() : ora.getFullYear() - 1;
  const [quale, setQuale] = useState(stagione);
  const [msg, setMsg] = useState('');
  const [invio, setInvio] = useState(false);
  async function aggiungi() {
    setInvio(true); setMsg('');
    const { data, error } = await supabaseBrowser().rpc('aggiungi_festivita', { p_palestra: palestraId, p_stagione: quale });
    setInvio(false);
    if (error) { setMsg('Non riuscito: riprova.'); return; }
    setMsg(data ? `Aggiunte ${data} festività: le lezioni di quei giorni sono annullate.` : 'C\'erano già tutte.');
    router.refresh();
  }
  return (
    <div className="festivita">
      <span>Feste nazionali (Ognissanti, Immacolata, Natale e S. Stefano, Capodanno, Epifania, Pasqua e Pasquetta, 25 aprile, 1° maggio, 2 giugno):</span>
      <select value={quale} onChange={(e) => setQuale(Number(e.target.value))} aria-label="Stagione">
        {[stagione, stagione + 1].map((a) => <option key={a} value={a}>stagione {a}/{String(a + 1).slice(2)}</option>)}
      </select>
      <button type="button" className="btn btn-piccolo" disabled={invio} onClick={aggiungi}>{invio ? 'Aggiungo…' : 'Aggiungi le festività'}</button>
      {msg && <span className="piccolo" role="status">{msg}</span>}
    </div>
  );
}
