'use client';
import { useEffect, useMemo, useRef, useState } from 'react';

const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Tendina con ricerca: si scrive e l'elenco si filtra lettera per lettera (anche più parole, in
// qualsiasi ordine: "pole 2 trim"), oppure si tocca ▾ per vedere tutto. Frecce + Invio per scegliere.
// opzioni: [{ value, label, gruppo?, extra? }]
export default function CampoCerca({ id, valore, onChange, opzioni, placeholder = 'Scrivi per cercare…', vuoto = 'Nessun risultato' }) {
  const [testo, setTesto] = useState('');
  const [aperto, setAperto] = useState(false);
  const [attivo, setAttivo] = useState(0);
  const box = useRef(null);
  const lista = useRef(null);
  const scelta = opzioni.find((o) => o.value === valore);

  useEffect(() => {
    const fuori = (e) => { if (box.current && !box.current.contains(e.target)) { setAperto(false); setTesto(''); } };
    document.addEventListener('mousedown', fuori);
    document.addEventListener('touchstart', fuori);
    return () => { document.removeEventListener('mousedown', fuori); document.removeEventListener('touchstart', fuori); };
  }, []);

  const parole = norm(testo).split(/\s+/).filter(Boolean);
  const filtrate = useMemo(() => opzioni.filter((o) => {
    const t = norm(o.label);
    return parole.every((p) => t.includes(p));
  }), [opzioni, testo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setAttivo(0); }, [testo]);
  useEffect(() => {
    const el = lista.current?.querySelector('[data-attivo="1"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [attivo]);

  function scegli(o) { onChange(o.value); setTesto(''); setAperto(false); }
  function tasti(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAperto(true); setAttivo((a) => Math.min(a + 1, filtrate.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAttivo((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { if (aperto && filtrate[attivo]) { e.preventDefault(); scegli(filtrate[attivo]); } }
    else if (e.key === 'Escape') { setAperto(false); setTesto(''); }
  }

  let gruppo = null;
  return (
    <div className="campo-cerca" ref={box}>
      <div className={`cc-riga${aperto ? ' aperta' : ''}`}>
        <input id={id} value={aperto ? testo : (scelta?.label || '')} placeholder={scelta ? scelta.label : placeholder}
               onFocus={() => { setAperto(true); setTesto(''); }} onChange={(e) => { setTesto(e.target.value); setAperto(true); }}
               onKeyDown={tasti} autoComplete="off" role="combobox" aria-expanded={aperto} aria-controls={`${id}-lista`} />
        {scelta && !aperto && <button type="button" className="cc-x" aria-label="Togli la scelta" onClick={() => onChange('')}>×</button>}
        <button type="button" className="cc-apri" aria-label="Mostra tutto l'elenco" tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { setAperto(!aperto); setTesto(''); if (!aperto) document.getElementById(id)?.focus(); }}>▾</button>
      </div>
      {aperto && (
        <ul className="cc-lista" id={`${id}-lista`} role="listbox" ref={lista}>
          {filtrate.length === 0 && <li className="cc-vuoto">{vuoto}</li>}
          {filtrate.map((o, i) => {
            const testa = o.gruppo && o.gruppo !== gruppo ? o.gruppo : null;
            gruppo = o.gruppo || gruppo;
            return [
              testa && <li key={`g-${o.gruppo}-${i}`} className="cc-gruppo">{testa}</li>,
              <li key={o.value} role="option" aria-selected={o.value === valore} data-attivo={i === attivo ? '1' : '0'}
                  className={`cc-voce${i === attivo ? ' attiva' : ''}${o.value === valore ? ' scelta' : ''}`}
                  onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setAttivo(i)} onClick={() => scegli(o)}>
                <span>{o.label}</span>{o.extra && <span className="cc-extra">{o.extra}</span>}
              </li>,
            ];
          })}
        </ul>
      )}
    </div>
  );
}
