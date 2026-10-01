'use client';
import { useState } from 'react';
import { TAVOLOZZA_BASE, testoSu } from '@/lib/colori';

const valido = (c) => /^#[0-9a-f]{6}$/i.test(c || '');

// Scelta del colore: una tavolozza veloce e, sotto, qualunque altro colore
// (selettore del sistema oppure codice tipo #ff00ff).
// Con "applica" (es. nel calendario) il colore libero si conferma con un pulsante;
// senza, ogni cambio arriva subito a onChange.
export default function SceltaColore({ valore, onChange, tavolozza, applica, disabilitato = false }) {
  const colori = tavolozza?.length ? tavolozza : TAVOLOZZA_BASE;
  const [libero, setLibero] = useState(valido(valore) ? valore : '#f40000');
  const [codice, setCodice] = useState(valore || '');
  const uguale = (a, b) => (a || '').toLowerCase() === (b || '').toLowerCase();

  function scegliLibero(c) {
    setLibero(c); setCodice(c);
    if (!applica) onChange(c);
  }
  function scriviCodice(t) {
    const c = t.trim().startsWith('#') || !t.trim() ? t.trim() : `#${t.trim()}`;
    setCodice(c);
    if (valido(c)) { setLibero(c.toLowerCase()); if (!applica) onChange(c.toLowerCase()); }
  }

  return (
    <div className="scelta-colore">
      <div className="tinte">
        {colori.map((t) => (
          <button type="button" key={t.colore} title={t.nome} aria-label={`Colore ${t.nome}`} disabled={disabilitato}
                  aria-pressed={uguale(valore, t.colore)} onClick={() => { setCodice(t.colore); setLibero(t.colore); onChange(t.colore); }}
                  style={{ background: t.colore, color: testoSu(t.colore) }}>
            {uguale(valore, t.colore) ? '✓' : ''}
          </button>
        ))}
      </div>
      <div className="tinte-libero">
        <input type="color" aria-label="Qualunque altro colore" value={libero} disabled={disabilitato}
               onChange={(e) => scegliLibero(e.target.value)} />
        <input type="text" aria-label="Codice colore" placeholder="#ff00ff" maxLength={7} value={codice} disabled={disabilitato}
               onChange={(e) => scriviCodice(e.target.value)} />
        {applica
          ? <button type="button" className="btn btn-piccolo" disabled={disabilitato || !valido(libero) || uguale(libero, valore)}
                    onClick={() => onChange(libero)}>{applica}</button>
          : <span className="piccolo muto">qualunque altro colore</span>}
      </div>
    </div>
  );
}
