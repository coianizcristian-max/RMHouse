'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase/browser';

const SPUNTE = [
  ['attivo', 'Attivo', 'Il corso è nel palinsesto'],
  ['prova_abilitata', 'Prova dal sito', 'Si può prenotare la lezione di prova dal sito'],
  ['prenotabile', 'Prenotabile', 'I clienti prenotano le lezioni dall\'app (togli per i corsi a numero chiuso)'],
];
const euroTesto = (cent) => (cent == null ? '' : (cent / 100).toFixed(2).replace('.', ',').replace(',00', ''));
const leggiEuro = (t) => { const n = parseFloat(String(t).replace(',', '.')); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null; };
const leggiIntero = (t) => (String(t).trim() === '' ? null : (Number.isInteger(Number(t)) && Number(t) >= 0 ? Number(t) : undefined));
const normalizza = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// un campo numerico: si salva quando si esce dal campo (o con Invio), solo se è cambiato
function Numero({ c, campo, euro = false, vuotoOk = false, segnaposto, onSalva, onErrore }) {
  const valore = euro ? euroTesto(c[campo]) : (c[campo] ?? '');
  const [t, setT] = useState(String(valore));
  const esci = () => {
    const nuovo = euro ? leggiEuro(t === '' ? '0' : t) : leggiIntero(t);
    if (nuovo === undefined || (nuovo === null && !vuotoOk)) { setT(String(valore)); onErrore(c.id); return; }
    if (nuovo === c[campo]) return;
    onSalva([c.id], { [campo]: nuovo });
  };
  return (
    <input className="mv-num" inputMode={euro ? 'decimal' : 'numeric'} value={t} placeholder={segnaposto}
           aria-label={`${campo} ${c.nome}`} onChange={(e) => setT(e.target.value)} onBlur={esci}
           onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
  );
}

export default function ModificaVeloce({ corsi: iniziali }) {
  const [corsi, setCorsi] = useState(iniziali);
  const [cerca, setCerca] = useState('');
  const [soloAttivi, setSoloAttivi] = useState(true);
  const [stato, setStato] = useState({});             // id → 'salvo' | 'ok' | 'errore'
  const [scelti, setScelti] = useState(new Set());
  const [massa, setMassa] = useState({ capienza: '', prezzo: '', prove: '' });
  const [avviso, setAvviso] = useState('');

  const visibili = useMemo(() => {
    const q = normalizza(cerca).split(/\s+/).filter(Boolean);
    return corsi.filter((c) => (!soloAttivi || c.attivo) && q.every((p) => normalizza(`${c.nome} ${c.discipline?.nome || ''}`).includes(p)));
  }, [corsi, cerca, soloAttivi]);

  async function salva(ids, cambi) {
    setStato((s) => ({ ...s, ...Object.fromEntries(ids.map((id) => [id, 'salvo'])) }));
    const { error } = await supabaseBrowser().from('corsi').update(cambi).in('id', ids);
    setStato((s) => ({ ...s, ...Object.fromEntries(ids.map((id) => [id, error ? 'errore' : 'ok'])) }));
    if (!error) setCorsi((v) => v.map((c) => (ids.includes(c.id) ? { ...c, ...cambi } : c)));
    return !error;
  }

  const errore = (id) => setStato((st) => ({ ...st, [id]: 'errore' }));
  const tutti = visibili.length > 0 && visibili.every((c) => scelti.has(c.id));
  const cambia = (id) => { const s = new Set(scelti); s.has(id) ? s.delete(id) : s.add(id); setScelti(s); };
  const mostra = (t) => { setAvviso(t); setTimeout(() => setAvviso(''), 3000); };

  async function applica(cambi, testo) {
    const ids = [...scelti];
    if (await salva(ids, cambi)) mostra(`${testo}: ${ids.length} ${ids.length === 1 ? 'corso' : 'corsi'}`);
  }
  function applicaNumeri() {
    const cambi = {};
    if (massa.capienza !== '') { const v = leggiIntero(massa.capienza); if (v === undefined) return mostra('Posti: scrivi un numero'); cambi.capienza = v; }
    if (massa.prezzo !== '') { const v = leggiEuro(massa.prezzo); if (v === null) return mostra('Prezzo: scrivi un importo'); cambi.prezzo_prova_cent = v; }
    if (massa.prove !== '') { const v = leggiIntero(massa.prove); if (v == null) return mostra('Prove: scrivi un numero'); cambi.max_prove_per_lezione = v; }
    if (!Object.keys(cambi).length) return mostra('Scrivi almeno un valore');
    applica(cambi, 'Aggiornati').then(() => setMassa({ capienza: '', prezzo: '', prove: '' }));
  }

  const senzaPosti = corsi.filter((c) => c.attivo && c.capienza == null).length;

  return (
    <>
      <div className="filtri-persone">
        <input type="search" placeholder="Cerca un corso o una disciplina" value={cerca} onChange={(e) => setCerca(e.target.value)} aria-label="Cerca" />
        <label className="spunta" style={{ margin: 0 }}><input type="checkbox" checked={soloAttivi} onChange={(e) => setSoloAttivi(e.target.checked)} /><span>Solo attivi</span></label>
        <Link prefetch={false} className="link-btn piccolo" href="/gestione/corsi">← elenco dei corsi</Link>
      </div>
      {senzaPosti > 0 && (
        <p className="piccolo" style={{ color: 'var(--attenzione)', marginTop: 0 }}>
          {senzaPosti} {senzaPosti === 1 ? 'corso attivo non ha' : 'corsi attivi non hanno'} i posti: vale la capienza della sala.
        </p>
      )}

      <div className="tabella-scorre mv-tabella">
        <table>
          <thead>
            <tr>
              <th className="mv-sel"><input type="checkbox" aria-label="Seleziona tutti" checked={tutti}
                onChange={() => setScelti(tutti ? new Set() : new Set(visibili.map((c) => c.id)))} /></th>
              <th className="mv-nome">Corso</th>
              <th title="Vuoto = come la sala">Posti</th>
              <th>Prova €</th>
              <th title="Quante persone in prova al massimo in una lezione">Prove / lezione</th>
              {SPUNTE.map(([k, t, d]) => <th key={k} title={d} className="mv-spunta">{t}</th>)}
              <th aria-label="Stato" />
            </tr>
          </thead>
          <tbody>
            {visibili.map((c) => (
              <tr key={c.id} className={`${scelti.has(c.id) ? 'selezionata' : ''}${c.attivo ? '' : ' mv-spento'}`}>
                <td className="mv-sel"><input type="checkbox" aria-label={`Seleziona ${c.nome}`} checked={scelti.has(c.id)} onChange={() => cambia(c.id)} /></td>
                <td className="mv-nome">
                  <span className="mv-colore" style={{ background: c.colore || 'var(--rosso)' }} />
                  <Link prefetch={false} href={`/gestione/corsi/${c.id}`}>{c.nome}</Link>
                  {c.discipline?.nome && <span className="piccolo muto"> · {c.discipline.nome}</span>}
                </td>
                <td><Numero key={`p${c.capienza}`} c={c} campo="capienza" vuotoOk segnaposto="sala" onSalva={salva} onErrore={errore} /></td>
                <td><Numero key={`e${c.prezzo_prova_cent}`} c={c} campo="prezzo_prova_cent" euro onSalva={salva} onErrore={errore} /></td>
                <td><Numero key={`m${c.max_prove_per_lezione}`} c={c} campo="max_prove_per_lezione" onSalva={salva} onErrore={errore} /></td>
                {SPUNTE.map(([k, t]) => (
                  <td key={k} className="mv-spunta">
                    <input type="checkbox" aria-label={`${t} ${c.nome}`} checked={!!c[k]} onChange={(e) => salva([c.id], { [k]: e.target.checked })} />
                  </td>
                ))}
                <td className="mv-stato piccolo" aria-live="polite">
                  {stato[c.id] === 'salvo' ? '…' : stato[c.id] === 'ok' ? <span className="mv-ok">salvato ✓</span> : stato[c.id] === 'errore' ? <span className="mv-ko">non salvato</span> : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visibili.length === 0 && <div className="vuoto">Nessun corso.</div>}

      {scelti.size > 0 && (
        <div className="barra-selezione" role="region" aria-label="Modifica dei corsi selezionati">
          <strong>{scelti.size} {scelti.size === 1 ? 'corso selezionato' : 'corsi selezionati'}</strong>
          <div className="azioni mv-massa">
            <input className="nota-breve" placeholder="Posti" inputMode="numeric" value={massa.capienza} onChange={(e) => setMassa({ ...massa, capienza: e.target.value })} />
            <input className="nota-breve" placeholder="Prova €" inputMode="decimal" value={massa.prezzo} onChange={(e) => setMassa({ ...massa, prezzo: e.target.value })} />
            <input className="nota-breve" placeholder="Prove / lezione" inputMode="numeric" value={massa.prove} onChange={(e) => setMassa({ ...massa, prove: e.target.value })} />
            <button className="btn btn-primario" onClick={applicaNumeri}>Applica</button>
          </div>
          <div className="azioni">
            {SPUNTE.map(([k, t]) => (
              <span key={k} className="mv-coppia">
                <button className="btn" onClick={() => applica({ [k]: true }, `${t}: sì`)}>{t}: sì</button>
                <button className="btn" onClick={() => applica({ [k]: false }, `${t}: no`)}>no</button>
              </span>
            ))}
            <button className="link-btn" onClick={() => setScelti(new Set())}>Annulla</button>
          </div>
        </div>
      )}
      {avviso && <div className="avviso-volante" role="status">{avviso}</div>}
    </>
  );
}
