'use client';
import { useState } from 'react';

export default function Compila({ token, domande }) {
  const [r, setR] = useState({});
  const [stato, setStato] = useState('');
  const [errore, setErrore] = useState('');
  const set = (id, v) => setR({ ...r, [id]: v });

  async function invia(e) {
    e.preventDefault();
    const mancanti = domande.filter((d) => d.tipo !== 'testo' && r[d.id] === undefined);
    if (mancanti.length) { setErrore(`Manca la risposta a: ${mancanti[0].testo}`); return; }
    setStato('invio'); setErrore('');
    const res = await fetch('/api/sondaggio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, risposte: r }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setErrore(d.errore || 'Invio non riuscito.'); setStato(''); return; }
    setStato('fatto');
  }

  if (stato === 'fatto') return <><h2>Grazie! 🙏</h2><p>Le tue risposte ci aiutano a migliorare.</p></>;

  return (
    <form onSubmit={invia} className="sondaggio">
      {errore && <div className="errore" role="alert">{errore}</div>}
      {domande.map((d, i) => (
        <fieldset key={d.id} className="domanda-pubblica">
          <legend>{i + 1}. {d.testo}</legend>
          {d.tipo === 'stelle' && (
            <div className="stelle" role="radiogroup">
              {[1, 2, 3, 4, 5].map((n) => (
                <button type="button" key={n} role="radio" aria-checked={r[d.id] === n} aria-label={`${n} stelle`}
                        className={r[d.id] >= n ? 'accesa' : ''} onClick={() => set(d.id, n)}>★</button>
              ))}
            </div>
          )}
          {d.tipo === 'nps' && (
            <>
              <div className="voti" role="radiogroup">
                {Array.from({ length: 11 }, (_, n) => (
                  <button type="button" key={n} role="radio" aria-checked={r[d.id] === n}
                          className={r[d.id] === n ? 'scelto' : ''} onClick={() => set(d.id, n)}>{n}</button>
                ))}
              </div>
              <div className="voti-legenda piccolo muto"><span>per niente</span><span>sicuramente</span></div>
            </>
          )}
          {d.tipo === 'scelta' && (
            <div className="scelte">
              {d.opzioni.map((o) => (
                <label key={o} className={`scelta${r[d.id] === o ? ' scelto' : ''}`}>
                  <input type="radio" name={d.id} checked={r[d.id] === o} onChange={() => set(d.id, o)} />
                  <span>{o}</span>
                </label>
              ))}
            </div>
          )}
          {d.tipo === 'testo' && (
            <div className="campo" style={{ margin: 0 }}>
              <textarea rows={3} value={r[d.id] || ''} onChange={(e) => set(d.id, e.target.value.slice(0, 2000))} aria-label={d.testo} />
            </div>
          )}
        </fieldset>
      ))}
      <button className="btn btn-primario btn-pieno" disabled={stato === 'invio'}>{stato === 'invio' ? 'Invio…' : 'Invia le risposte'}</button>
    </form>
  );
}
