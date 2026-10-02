'use client';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { dataBreve } from '@/lib/formato';

// Il riquadro dove si firma col dito (o col mouse). La firma si salva come disegno vettoriale.
const Tela = forwardRef(function Tela({ etichetta = 'Firma qui col dito', onDisegna }, ref) {
  const tela = useRef(null);
  const tratti = useRef([]);
  const [disegnato, setDisegnato] = useState(false);

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
    const muovi = (e) => { if (!attivo) return; e.preventDefault(); const p = punto(e); tratti.current[tratti.current.length - 1].push(p); ctx.lineTo(...p); ctx.stroke(); setDisegnato(true); onDisegna?.(true); };
    const su = () => { attivo = false; };
    c.addEventListener('pointerdown', giu); c.addEventListener('pointermove', muovi);
    c.addEventListener('pointerup', su); c.addEventListener('pointercancel', su);
    return () => { c.removeEventListener('pointerdown', giu); c.removeEventListener('pointermove', muovi); c.removeEventListener('pointerup', su); c.removeEventListener('pointercancel', su); };
  }, [onDisegna]);

  useImperativeHandle(ref, () => ({
    vuota: () => !disegnato,
    cancella: () => {
      const c = tela.current;
      c.getContext('2d').clearRect(0, 0, c.width, c.height);
      tratti.current = []; setDisegnato(false); onDisegna?.(false);
    },
    svg: () => {
      const b = tela.current.getBoundingClientRect();
      const d = tratti.current.filter((t) => t.length > 0)
        .map((t) => `M${t[0][0]} ${t[0][1]}` + (t.length === 1 ? 'l0.1 0' : t.slice(1).map(([x, y]) => `L${x} ${y}`).join(''))).join('');
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.round(b.width)} ${Math.round(b.height)}"><path d="${d}" fill="none" stroke="#111" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    },
  }), [disegnato, onDisegna]);

  return (
    <div className="firma-riquadro">
      <canvas ref={tela} aria-label={etichetta} />
      {!disegnato && <span className="firma-segnaposto">{etichetta}</span>}
    </div>
  );
});

const ERRORI = {
  codice_fiscale_non_valido: 'Il codice fiscale non è valido: controllalo.',
  data_nascita_non_valida: 'La data di nascita non è valida.',
  telefono_non_valido: 'Il cellulare non è valido.',
  dati_mancanti: 'Mancano dei dati dell\'iscritto: completali qui sopra.',
  scelte_mancanti: 'Rispondi a tutte le scelte: Acconsento o Non acconsento.',
  secondo_genitore: 'Serve la firma del secondo genitore, oppure spunta la dichiarazione.',
  firma2_mancante: 'La firma del secondo genitore non è valida: rifalla.',
  nome2_mancante: 'Scrivi nome e cognome del secondo genitore.',
};

// Un modulo da leggere e firmare. Può avere:
// · i dati dell'iscritto in cima (con_dati), che restano nella firma
// · delle scelte Acconsento / Non acconsento (scelte)
// · per i minorenni la firma del secondo genitore o la dichiarazione di chi firma (secondo_genitore)
export default function FirmaModulo({ modulo, allievo, minore, nomeSuggerito = '', onFatto, titolo = true, staff = false }) {
  const tela1 = useRef(null);
  const tela2 = useRef(null);
  const [f, setF] = useState({ firmatario: nomeSuggerito, cf: '', letto: false, nome2: '', modo2: 'firma' });
  const [risposte, setRisposte] = useState({});
  const [dati, setDati] = useState(null);
  const [d, setDati2] = useState(null);           // i dati da completare o correggere, come caselle
  const [correggi, setCorreggi] = useState(false);
  const setD = (k) => (e) => setDati2({ ...d, [k]: e.target.value });
  // una casella è aperta se quel dato manca o se si è scelto "Correggi i dati"
  const MANCA = { nato_il: 'data di nascita', nato_a: 'luogo di nascita', cf: 'codice fiscale', residenza: 'residenza', cellulare: 'cellulare' };
  const apri = (k) => !!d && (correggi || (dati?.manca || []).includes(MANCA[k]));
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const scelte = modulo.scelte || [];
  const dueGenitori = !!(minore && modulo.secondo_genitore);

  useEffect(() => {
    if (!modulo.con_dati) return;
    supabaseBrowser().rpc('dati_modulo', { p_allievo: allievo.id }).then(({ data }) => {
      setDati(data || null);
      if (data) setDati2({
        data_nascita: data.nato_il || '', luogo_nascita: data.nato_a || '', codice_fiscale: data.cf || '',
        via: data.via || '', cap: data.cap || '', citta: data.citta || '', provincia: data.provincia || '',
        telefono: (data.genitore ? data.genitore.cellulare : data.cellulare) || '',
      });
    });
  }, [modulo.con_dati, allievo.id]);

  async function firma(e) {
    e.preventDefault();
    if (scelte.some((s) => typeof risposte[s.k] !== 'boolean')) { setErrore(ERRORI.scelte_mancanti); return; }
    if (!f.letto) { setErrore('Spunta "Ho letto e accetto".'); return; }
    if (!f.firmatario.trim()) { setErrore(minore ? 'Scrivi nome e cognome del genitore o tutore.' : 'Scrivi nome e cognome.'); return; }
    if (tela1.current.vuota()) { setErrore('Firma nel riquadro.'); return; }
    if (dueGenitori && f.modo2 === 'firma') {
      if (!f.nome2.trim()) { setErrore(ERRORI.nome2_mancante); return; }
      if (tela2.current.vuota()) { setErrore('Manca la firma del secondo genitore.'); return; }
    }
    setInvio(true); setErrore('');
    if (modulo.con_dati && d) {
      // le caselle aperte vanno riempite tutte; poi i dati si salvano nell'anagrafica
      const vuote = [];
      if (apri('nato_il') && !d.data_nascita) vuote.push('data di nascita');
      if (apri('nato_a') && !d.luogo_nascita.trim()) vuote.push('luogo di nascita');
      if (apri('cf') && d.codice_fiscale.replace(/\s/g, '').length !== 16) vuote.push('codice fiscale (16 caratteri)');
      if (apri('residenza') && (!d.via.trim() || !d.cap.trim() || !d.citta.trim())) vuote.push('residenza (via, CAP e città)');
      if (apri('cellulare') && d.telefono.replace(/\D/g, '').length < 6) vuote.push('cellulare');
      if (vuote.length) { setInvio(false); setErrore(`Completa i dati: ${vuote.join(', ')}.`); return; }
      const campi = {};
      if (apri('nato_il')) campi.data_nascita = d.data_nascita;
      if (apri('nato_a')) campi.luogo_nascita = d.luogo_nascita;
      if (apri('cf')) campi.codice_fiscale = d.codice_fiscale;
      if (apri('residenza')) Object.assign(campi, { via: d.via, cap: d.cap, citta: d.citta, provincia: d.provincia });
      if (apri('cellulare')) campi.telefono = d.telefono;
      if (Object.keys(campi).length) {
        const r = await supabaseBrowser().rpc('completa_dati_modulo', { p_allievo: allievo.id, p: campi });
        if (r.error) { setInvio(false); setErrore(ERRORI[Object.keys(ERRORI).find((x) => r.error.message?.includes(x))] || 'Dati non salvati. Controllali e riprova.'); return; }
        setDati(r.data); setCorreggi(false);
      }
    }
    const { error } = await supabaseBrowser().rpc('firma_modulo', { p: {
      allievo_id: allievo.id, modulo_id: modulo.id, firmatario: f.firmatario, firmatario_cf: f.cf || null,
      per_conto: !!minore, firma_svg: tela1.current.svg(), user_agent: navigator.userAgent,
      risposte,
      ...(dueGenitori && f.modo2 === 'firma' ? { firma2_nome: f.nome2, firma2_svg: tela2.current.svg() } : {}),
      ...(dueGenitori && f.modo2 === 'dichiaro' ? { dichiarazione: true } : {}),
    } });
    setInvio(false);
    if (error) { const k = Object.keys(ERRORI).find((x) => error.message?.includes(x)); setErrore(ERRORI[k] || 'Firma non salvata. Riprova.'); return; }
    onFatto?.();
  }

  const riga = (etichetta, valore) => (
    <><dt>{etichetta}</dt><dd>{valore || <span className="fm-manca">da completare</span>}</dd></>
  );

  return (
    <form className="firma-modulo" onSubmit={firma}>
      {titolo && <h2>{modulo.titolo}</h2>}

      {modulo.con_dati && dati && (
        <div className="fm-dati">
          <div className="fm-dati-testa">
            <strong>Dati dell&apos;iscritto</strong>
            {!correggi && <button type="button" className="link-btn piccolo" onClick={() => setCorreggi(true)}>Correggi i dati</button>}
          </div>
          {dati.manca?.length > 0 && (
            <p className="fm-avviso">Per firmare completa: {dati.manca.join(', ')}. Vengono salvati anche nella {staff ? 'scheda' : 'tua anagrafica'}.</p>
          )}
          <dl>
            <dt>Nome</dt><dd>{dati.nome}</dd>
            {apri('nato_il') ? <>
              <dt><label htmlFor="fd-nascita">Nato/a il</label></dt>
              <dd><input id="fd-nascita" type="date" value={d.data_nascita} onChange={setD('data_nascita')} /></dd>
            </> : <><dt>Nato/a il</dt><dd>{dataBreve(dati.nato_il)}</dd></>}
            {apri('nato_a') ? <>
              <dt><label htmlFor="fd-luogo">Nato/a a</label></dt>
              <dd><input id="fd-luogo" value={d.luogo_nascita} onChange={setD('luogo_nascita')} placeholder="Comune" /></dd>
            </> : <><dt>Nato/a a</dt><dd>{dati.nato_a}</dd></>}
            {apri('cf') ? <>
              <dt><label htmlFor="fd-cf">Codice fiscale</label></dt>
              <dd><input id="fd-cf" value={d.codice_fiscale} onChange={(e) => setDati2({ ...d, codice_fiscale: e.target.value.toUpperCase() })} maxLength={16} autoCapitalize="characters" /></dd>
            </> : <><dt>Codice fiscale</dt><dd>{dati.cf}</dd></>}
            {apri('residenza') ? <>
              <dt><label htmlFor="fd-via">Residenza</label></dt>
              <dd className="fm-residenza">
                <input id="fd-via" value={d.via} onChange={setD('via')} placeholder="Via e numero" />
                <input value={d.cap} onChange={setD('cap')} placeholder="CAP" inputMode="numeric" maxLength={5} aria-label="CAP" />
                <input value={d.citta} onChange={setD('citta')} placeholder="Città" aria-label="Città" />
                <input value={d.provincia} onChange={(e) => setDati2({ ...d, provincia: e.target.value.toUpperCase() })} placeholder="Prov." maxLength={2} aria-label="Provincia" />
              </dd>
            </> : <><dt>Residenza</dt><dd>{dati.residenza}</dd></>}
            {apri('cellulare') ? <>
              <dt><label htmlFor="fd-tel">{dati.genitore ? 'Cellulare del genitore' : 'Cellulare'}</label></dt>
              <dd><input id="fd-tel" type="tel" inputMode="tel" value={d.telefono} onChange={setD('telefono')} /></dd>
            </> : !dati.genitore && <><dt>Cellulare</dt><dd>{dati.cellulare}</dd></>}
            {!dati.genitore && dati.email && <><dt>Email</dt><dd>{dati.email}</dd></>}
            {dati.genitore && <><dt>Genitore</dt><dd>{[dati.genitore.nome, !apri('cellulare') && dati.genitore.cellulare, dati.genitore.email].filter(Boolean).join(' · ')}</dd></>}
            {dati.corsi && <><dt>Corso</dt><dd>{dati.corsi}</dd></>}
            {(dati.data_prova || dati.data_iscrizione || dati.tessera) && <><dt>Altro</dt><dd>{[
              dati.data_prova && `prova il ${dataBreve(dati.data_prova)}`,
              dati.data_iscrizione && `iscrizione dal ${dataBreve(dati.data_iscrizione)}`,
              dati.tessera && `tessera ${dati.tessera}`,
            ].filter(Boolean).join(' · ')}</dd></>}
          </dl>
        </div>
      )}

      <div className="firma-testo">{modulo.testo}</div>

      {scelte.length > 0 && (
        <div className="fm-scelte">
          {scelte.map((s) => (
            <fieldset key={s.k} className="fm-scelta">
              <legend>{s.titolo}</legend>
              {s.testo && <p>{s.testo}</p>}
              <div className="fm-sino" role="radiogroup" aria-label={s.titolo}>
                <button type="button" role="radio" aria-checked={risposte[s.k] === true} className={risposte[s.k] === true ? 'si' : ''}
                        onClick={() => { setRisposte({ ...risposte, [s.k]: true }); setErrore(''); }}>Acconsento</button>
                <button type="button" role="radio" aria-checked={risposte[s.k] === false} className={risposte[s.k] === false ? 'no' : ''}
                        onClick={() => { setRisposte({ ...risposte, [s.k]: false }); setErrore(''); }}>Non acconsento</button>
              </div>
            </fieldset>
          ))}
        </div>
      )}

      {errore && <div className="errore" role="alert">{errore}</div>}
      <label className="spunta"><input type="checkbox" checked={f.letto} onChange={(e) => setF({ ...f, letto: e.target.checked })} />
        <span>Ho letto e accetto{minore ? ` anche per conto di ${allievo.nome}` : ''}</span></label>

      <div className="fm-firmatario">
        {dueGenitori && <h3>Primo genitore</h3>}
        <div className="griglia-soglie">
          <div className="campo"><label htmlFor={`fn-${modulo.id}`}>{minore ? 'Nome e cognome del genitore o tutore' : 'Nome e cognome'}</label>
            <input id={`fn-${modulo.id}`} value={f.firmatario} onChange={(e) => setF({ ...f, firmatario: e.target.value })} autoComplete="name" /></div>
          {minore && (
            <div className="campo"><label htmlFor={`fc-${modulo.id}`}>Codice fiscale del genitore</label>
              <input id={`fc-${modulo.id}`} value={f.cf} onChange={(e) => setF({ ...f, cf: e.target.value.toUpperCase() })} maxLength={16} /></div>
          )}
        </div>
        <Tela ref={tela1} />
        <button type="button" className="link-btn piccolo" onClick={() => tela1.current.cancella()}>Cancella la firma</button>
      </div>

      {dueGenitori && (
        <div className="fm-firmatario">
          <h3>Secondo genitore</h3>
          <div className="fm-modo" role="radiogroup" aria-label="Secondo genitore">
            <button type="button" role="radio" aria-checked={f.modo2 === 'firma'} onClick={() => setF({ ...f, modo2: 'firma' })}>Firma anche lui o lei</button>
            <button type="button" role="radio" aria-checked={f.modo2 === 'dichiaro'} onClick={() => setF({ ...f, modo2: 'dichiaro' })}>Non è qui adesso</button>
          </div>
          {f.modo2 === 'firma' ? (
            <>
              <div className="campo"><label htmlFor={`fn2-${modulo.id}`}>Nome e cognome del secondo genitore</label>
                <input id={`fn2-${modulo.id}`} value={f.nome2} onChange={(e) => setF({ ...f, nome2: e.target.value })} /></div>
              <Tela ref={tela2} etichetta="Firma del secondo genitore" />
              <button type="button" className="link-btn piccolo" onClick={() => tela2.current?.cancella()}>Cancella la firma</button>
            </>
          ) : (
            <p className="fm-dichiaro">Firmando dichiari di farlo anche con il consenso dell&apos;altro genitore,
              o di essere l&apos;unico esercente la responsabilità genitoriale.</p>
          )}
        </div>
      )}

      <div className="azioni" style={{ marginTop: 12 }}>
        <button className="btn btn-primario" disabled={invio}>{invio ? 'Salvo…' : 'Firma'}</button>
      </div>
    </form>
  );
}
