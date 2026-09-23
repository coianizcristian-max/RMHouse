'use client';
import { useState } from 'react';

const MOTIVI = [
  ['orari', 'Gli orari non mi vanno bene'],
  ['prezzo', 'Il prezzo'],
  ['livello', 'Il livello non era adatto'],
  ['distanza', 'È scomodo da raggiungere'],
  ['non_mi_e_piaciuto', 'La disciplina non fa per me'],
  ['altra_struttura', 'Ho scelto un\'altra struttura'],
  ['altro', 'Altro'],
];

export default function Modulo({ token }) {
  const [motivo, setMotivo] = useState('');
  const [testo, setTesto] = useState('');
  const [stato, setStato] = useState('');
  const [errore, setErrore] = useState('');

  async function invia(e) {
    e.preventDefault();
    setStato('invio'); setErrore('');
    const r = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, motivo, testo }) });
    const d = await r.json();
    if (!r.ok) { setErrore(d.errore); setStato(''); return; }
    setStato('fatto');
  }

  if (stato === 'fatto') return <><h1>Grazie</h1><p>Il tuo parere ci aiuta a migliorare. Se cambi idea, siamo qui.</p></>;

  return (
    <form onSubmit={invia}>
      <h1>Cosa non ti ha convinto?</h1>
      {errore && <div className="errore" role="alert">{errore}</div>}
      <div className="scelte" style={{ gridTemplateColumns: '1fr' }}>
        {MOTIVI.map(([k, l]) => (
          <button type="button" key={k} className="scelta" style={{ minHeight: 52 }} aria-pressed={motivo === k} onClick={() => setMotivo(k)}>{l}</button>
        ))}
      </div>
      <div className="campo">
        <label htmlFor="testo">Vuoi aggiungere qualcosa? (facoltativo)</label>
        <textarea id="testo" value={testo} onChange={(e) => setTesto(e.target.value)} maxLength={1000} />
      </div>
      <button className="btn btn-primario btn-pieno" disabled={!motivo || stato === 'invio'}>Invia</button>
    </form>
  );
}
