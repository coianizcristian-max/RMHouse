'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';

// Due schede della stessa persona (succede con gli import): si tiene questa e si porta dentro tutto dell'altra
export default function UnisciPersona({ palestraId, allievo }) {
  const router = useRouter();
  const [apri, setApri] = useState(false);
  const [cerca, setCerca] = useState('');
  const [trovati, setTrovati] = useState([]);
  const [errore, setErrore] = useState('');

  async function trova(t) {
    setCerca(t);
    if (t.trim().length < 2) { setTrovati([]); return; }
    const { data } = await supabaseBrowser().from('v_persone').select('id, nome, cognome, data_nascita, email')
      .eq('palestra_id', palestraId).ilike('ricerca', `%${t.trim().toLowerCase()}%`).neq('id', allievo.id).limit(8);
    setTrovati(data || []);
  }

  async function unisci(x) {
    if (!confirm(`Unire "${x.cognome} ${x.nome}" in questa scheda (${allievo.cognome} ${allievo.nome})?\n\nIscrizioni, presenze, pagamenti, certificati, storico e tutto il resto passano qui; l'altra scheda sparisce. Non si torna indietro.`)) return;
    setErrore('');
    const { error } = await supabaseBrowser().rpc('unisci_persone', { p_tenere: allievo.id, p_togliere: x.id });
    if (error) { setErrore('Unione non riuscita.'); return; }
    setApri(false); setCerca(''); setTrovati([]);
    router.refresh();
  }

  if (!apri) return <button className="link-btn piccolo" onClick={() => setApri(true)}>È un doppione? Unisci con un'altra scheda</button>;
  return (
    <div className="unisci">
      {errore && <div className="errore" role="alert">{errore}</div>}
      <p className="piccolo muto" style={{ margin: '0 0 6px' }}>Cerca l'altra scheda: tutto quello che ha passa in questa.</p>
      <input value={cerca} onChange={(e) => trova(e.target.value)} placeholder="Nome, cognome o email" aria-label="Cerca il doppione" />
      <ul className="mini-lista">
        {trovati.map((x) => (
          <li key={x.id}><span className="ml-riga">
            <span className="ml-testo"><strong>{x.cognome} {x.nome}</strong>
              <span className="piccolo muto">{[x.data_nascita, x.email].filter(Boolean).join(' · ')}</span></span>
            <button className="btn btn-piccolo" onClick={() => unisci(x)}>Unisci qui</button>
          </span></li>
        ))}
      </ul>
      <button className="link-btn piccolo" onClick={() => setApri(false)}>annulla</button>
    </div>
  );
}
