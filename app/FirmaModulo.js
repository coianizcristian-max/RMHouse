'use client';
import { useEffect, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';

// Un modulo da leggere e firmare col dito (o col mouse).
// La firma si salva come disegno vettoriale, insieme al testo firmato.
export default function FirmaModulo({ modulo, allievo, minore, nomeSuggerito = '', onFatto }) {
  const tela = useRef(null);
  const tratti = useRef([]);
  const [disegnato, setDisegnato] = useState(false);
  const [f, setF] = useState({ firmatario: minore ? '' : nomeSuggerito, cf: '', letto: false });
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);

  useEffect(() => {
    const c = tela.current;
    const ctx = c.getContext('2d');
    const scala = window.devicePixelRatio || 1;
    const r = c.getBoundingClientRect();
    c.width = r.width * scala; c.height = r.height * scala;
    ctx.scale(scala, scala);
    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
    let attivo = false;
    const punto = (e) => { const b = c.getBoundingClientRect(); return [Math.round((e.clientX - b.left) * 10) / 10, Math.round((e.clientY - b.top) * 10) / 10]; };
    const giu = (e) => { e.preventDefault(); c.setPointerCapture(e.pointerId); attivo = true; const p = punto(e); tratti.current.push([p]); ctx.beginPath(); ctx.moveTo(...p); };
    const muovi = (e) => { if (!attivo) return; e.preventDefault(); const p = punto(e); tratti.current[tratti.current.length - 1].push(p); ctx.lineTo(...p); ctx.stroke(); setDisegnato(true); };
    const su = () => { attivo = false; };
    c.addEventListener('pointerdown', giu); c.addEventListener('pointermove', muovi);
    c.addEventListener('pointerup', su); c.addEventListener('pointercancel', su);
    return () => { c.removeEventListener('pointerdown', giu); c.removeEventListener('pointermove', muovi); c.removeEventListener('pointerup', su); c.removeEventListener('pointercancel', su); };
  }, []);

  function cancella() {
    const c = tela.current;
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
    tratti.current = []; setDisegnato(false);
  }

  function svg() {
    const b = tela.current.getBoundingClientRect();
    const d = tratti.current.filter((t) => t.length > 0)
      .map((t) => `M${t[0][0]} ${t[0][1]}` + (t.length === 1 ? 'l0.1 0' : t.slice(1).map(([x, y]) => `L${x} ${y}`).join(''))).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.round(b.width)} ${Math.round(b.height)}"><path d="${d}" fill="none" stroke="#111" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  async function firma(e) {
    e.preventDefault();
    if (!f.letto) { setErrore('Spunta "Ho letto e accetto".'); return; }
    if (!f.firmatario.trim()) { setErrore(minore ? 'Scrivi nome e cognome del genitore o tutore.' : 'Scrivi nome e cognome.'); return; }
    if (!disegnato) { setErrore('Firma nel riquadro.'); return; }
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().rpc('firma_modulo', { p: {
      allievo_id: allievo.id, modulo_id: modulo.id, firmatario: f.firmatario, firmatario_cf: f.cf || null,
      per_conto: !!minore, firma_svg: svg(), user_agent: navigator.userAgent,
    } });
    setInvio(false);
    if (error) { setErrore('Firma non salvata. Riprova.'); return; }
    onFatto?.();
  }

  return (
    <form className="firma-modulo" onSubmit={firma}>
      <h2>{modulo.titolo}</h2>
      <div className="firma-testo">{modulo.testo}</div>
      {errore && <div className="errore" role="alert">{errore}</div>}
      <label className="spunta"><input type="checkbox" checked={f.letto} onChange={(e) => setF({ ...f, letto: e.target.checked })} />
        <span>Ho letto e accetto{minore ? ` anche per conto di ${allievo.nome}` : ''}</span></label>
      <div className="griglia-soglie">
        <div className="campo"><label htmlFor={`fn-${modulo.id}`}>{minore ? 'Nome e cognome del genitore o tutore' : 'Nome e cognome'}</label>
          <input id={`fn-${modulo.id}`} value={f.firmatario} onChange={(e) => setF({ ...f, firmatario: e.target.value })} autoComplete="name" /></div>
        {minore && (
          <div className="campo"><label htmlFor={`fc-${modulo.id}`}>Codice fiscale del genitore</label>
            <input id={`fc-${modulo.id}`} value={f.cf} onChange={(e) => setF({ ...f, cf: e.target.value.toUpperCase() })} maxLength={16} /></div>
        )}
      </div>
      <div className="firma-riquadro">
        <canvas ref={tela} aria-label="Firma qui col dito" />
        {!disegnato && <span className="firma-segnaposto">Firma qui col dito</span>}
      </div>
      <div className="azioni" style={{ marginTop: 10 }}>
        <button className="btn btn-primario" disabled={invio}>{invio ? 'Salvo…' : 'Firma'}</button>
        <button type="button" className="btn" onClick={cancella}>Cancella la firma</button>
      </div>
    </form>
  );
}
