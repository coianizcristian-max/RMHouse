'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';

// Mettere qualcuno in coda dal banco, quando il corso è pieno
export default function Aggiungi({ corsi }) {
  const router = useRouter();
  const [apri, setApri] = useState(false);
  const [corso, setCorso] = useState(corsi[0]?.id || '');
  const [cerca, setCerca] = useState('');
  const [trovati, setTrovati] = useState([]);
  const [errore, setErrore] = useState('');

  async function cercaPersone(testo) {
    setCerca(testo);
    if (!corso || testo.trim().length < 2) { setTrovati([]); return; }
    const { data } = await supabaseBrowser().rpc('candidati_attesa', { p_corso: corso, p_cerca: testo.trim() });
    setTrovati(data || []);
  }

  async function metti(p) {
    if (p.gia_iscritto && !confirm(`${p.nome} ${p.cognome} è già iscritto a questo corso. Metterlo comunque in coda?`)) return;
    const { error } = await supabaseBrowser().rpc('aggiungi_in_attesa', {
      p_allievo: p.allievo_id, p_corso: corso, p_lezione: null, p_tipo: 'iscrizione',
    });
    if (error) { setErrore('Non è stato possibile metterlo in coda.'); return; }
    setApri(false); setCerca(''); setTrovati([]); router.refresh();
  }

  if (!apri) {
    return <button className="btn" style={{ marginBottom: 14 }} onClick={() => setApri(true)}>Metti qualcuno in coda</button>;
  }

  return (
    <div className="scheda" style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>Metti qualcuno in coda</h3>
      {errore && <div className="errore">{errore}</div>}
      <div className="campo">
        <label htmlFor="co">Corso</label>
        <select id="co" value={corso} onChange={(e) => { setCorso(e.target.value); setTrovati([]); }}>
          {corsi.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </div>
      <div className="campo">
        <label htmlFor="pe">Chi</label>
        <input id="pe" value={cerca} onChange={(e) => cercaPersone(e.target.value)} placeholder="Cognome o nome" />
      </div>
      <ul className="elenco">
        {trovati.map((p) => (
          <li key={p.allievo_id} className="persona">
            <span>
              {p.cognome} {p.nome}
              <span className="piccolo muto" style={{ display: 'block' }}>
                paga {p.titolare}{p.gia_iscritto ? ' · già iscritto a questo corso' : ''}
              </span>
            </span>
            <button className="link-btn piccolo" onClick={() => metti(p)}>metti in coda</button>
          </li>
        ))}
      </ul>
      <button className="link-btn piccolo" onClick={() => setApri(false)}>Chiudi</button>
    </div>
  );
}
