'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { dataBreve } from '@/lib/formato';

const TIPI = [['stelle', 'Stelle da 1 a 5'], ['nps', 'Voto da 0 a 10 (lo consiglieresti?)'], ['scelta', 'Una scelta fra più risposte'], ['testo', 'Risposta libera']];
const nuovaDomanda = (tipo = 'stelle') => ({ id: Math.random().toString(36).slice(2, 8), tipo, testo: '', opzioni: tipo === 'scelta' ? ['', ''] : [] });
const MODELLO = {
  titolo: 'Come sta andando?', intro: 'Due minuti per aiutarci a migliorare. Grazie!', anonimo: false,
  domande: [
    { id: 'gen', tipo: 'stelle', testo: 'Quanto ti trovi bene nel tuo corso?', opzioni: [] },
    { id: 'nps', tipo: 'nps', testo: 'Quanto consiglieresti la scuola a un amico?', opzioni: [] },
    { id: 'ora', tipo: 'scelta', testo: 'Quale fascia oraria preferiresti per un nuovo corso?', opzioni: ['Mattina', 'Pausa pranzo', 'Pomeriggio', 'Sera'] },
    { id: 'sug', tipo: 'testo', testo: 'Cosa possiamo migliorare?', opzioni: [] },
  ],
};

export default function Sondaggi({ palestraId, sondaggi }) {
  const router = useRouter();
  const [s, setS] = useState(null);
  const [errore, setErrore] = useState('');
  const cambia = (i, dati) => setS({ ...s, domande: s.domande.map((d, j) => (j === i ? { ...d, ...dati } : d)) });
  const sposta = (i, di) => { const d = [...s.domande]; [d[i], d[i + di]] = [d[i + di], d[i]]; setS({ ...s, domande: d }); };

  async function salva(e) {
    e.preventDefault();
    const domande = s.domande.filter((d) => d.testo.trim())
      .map((d) => ({ ...d, testo: d.testo.trim(), opzioni: d.tipo === 'scelta' ? d.opzioni.map((o) => o.trim()).filter(Boolean) : [] }));
    if (!s.titolo.trim() || domande.length === 0) { setErrore('Servono un titolo e almeno una domanda.'); return; }
    if (domande.some((d) => d.tipo === 'scelta' && d.opzioni.length < 2)) { setErrore('Le domande a scelta vogliono almeno due risposte.'); return; }
    const dati = { titolo: s.titolo.trim(), intro: s.intro || null, anonimo: s.anonimo, domande };
    const db = supabaseBrowser();
    const { error } = s.id ? await db.from('sondaggi').update(dati).eq('id', s.id)
      : await db.from('sondaggi').insert({ ...dati, palestra_id: palestraId });
    if (error) { setErrore('Salvataggio non riuscito.'); return; }
    setS(null); setErrore(''); router.refresh();
  }

  async function archivia(x) {
    await supabaseBrowser().from('sondaggi').update({ attivo: !x.attivo }).eq('id', x.id);
    router.refresh();
  }

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Persone</div>
        <h1>Sondaggi</h1>
        <p>Prepari le domande qui, poi li mandi con una Campagna: ognuno riceve il suo link e può rispondere una volta sola.</p>
      </div>
      {errore && <div className="errore" role="alert">{errore}</div>}

      {!s && (
        <div className="azioni" style={{ marginBottom: 16 }}>
          <button className="btn btn-primario" onClick={() => setS({ ...MODELLO, domande: MODELLO.domande.map((d) => ({ ...d })) })}>Nuovo sondaggio (con un esempio)</button>
          <button className="btn" onClick={() => setS({ titolo: '', intro: '', anonimo: false, domande: [nuovaDomanda()] })}>Nuovo sondaggio vuoto</button>
        </div>
      )}

      {s && (
        <form className="pannello" onSubmit={salva} style={{ marginBottom: 20 }}>
          <div className="campo"><label htmlFor="st">Titolo</label><input id="st" value={s.titolo} onChange={(e) => setS({ ...s, titolo: e.target.value })} /></div>
          <div className="campo"><label htmlFor="si">Due righe di presentazione</label>
            <textarea id="si" rows={2} value={s.intro || ''} onChange={(e) => setS({ ...s, intro: e.target.value })} /></div>
          <label className="spunta"><input type="checkbox" checked={s.anonimo} onChange={(e) => setS({ ...s, anonimo: e.target.checked })} />
            <span>Anonimo: nei risultati non si vede chi ha scritto cosa</span></label>

          <h3 style={{ marginTop: 14 }}>Domande</h3>
          {s.domande.map((d, i) => (
            <div key={d.id} className="domanda">
              <div className="griglia-soglie">
                <div className="campo" style={{ gridColumn: '1 / -1' }}><label htmlFor={`q${d.id}`}>Domanda {i + 1}</label>
                  <input id={`q${d.id}`} value={d.testo} onChange={(e) => cambia(i, { testo: e.target.value })} /></div>
                <div className="campo"><label htmlFor={`t${d.id}`}>Tipo</label>
                  <select id={`t${d.id}`} value={d.tipo} onChange={(e) => cambia(i, { tipo: e.target.value, opzioni: e.target.value === 'scelta' ? (d.opzioni.length ? d.opzioni : ['', '']) : [] })}>
                    {TIPI.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select></div>
              </div>
              {d.tipo === 'scelta' && (
                <div className="opzioni">
                  {d.opzioni.map((o, k) => (
                    <input key={k} value={o} placeholder={`Risposta ${k + 1}`} aria-label={`Risposta ${k + 1}`}
                           onChange={(e) => cambia(i, { opzioni: d.opzioni.map((x, j) => (j === k ? e.target.value : x)) })} />
                  ))}
                  <button type="button" className="link-btn piccolo" onClick={() => cambia(i, { opzioni: [...d.opzioni, ''] })}>+ risposta</button>
                </div>
              )}
              <div className="azioni">
                {i > 0 && <button type="button" className="link-btn piccolo" onClick={() => sposta(i, -1)}>↑ su</button>}
                {i < s.domande.length - 1 && <button type="button" className="link-btn piccolo" onClick={() => sposta(i, 1)}>↓ giù</button>}
                <button type="button" className="link-btn piccolo pericolo" onClick={() => setS({ ...s, domande: s.domande.filter((_, j) => j !== i) })}>togli</button>
              </div>
            </div>
          ))}
          <button type="button" className="btn btn-piccolo" onClick={() => setS({ ...s, domande: [...s.domande, nuovaDomanda()] })}>+ Aggiungi una domanda</button>
          <div className="azioni" style={{ marginTop: 14 }}>
            <button className="btn btn-primario">Salva il sondaggio</button>
            <button type="button" className="btn" onClick={() => setS(null)}>Annulla</button>
          </div>
        </form>
      )}

      {sondaggi.length === 0 && !s && <div className="vuoto">Nessun sondaggio ancora.</div>}
      <ul className="mini-lista">
        {sondaggi.map((x) => (
          <li key={x.id}>
            <span className="ml-riga">
              <span className="ml-testo">
                <strong>{x.titolo}</strong>{!x.attivo && <span className="tag tag-neutro"> archiviato</span>}
                <span className="piccolo muto">
                  {x.domande.length} domande · creato il {dataBreve(x.created_at)} · {x.risposte} risposte su {x.inviti} inviti{x.anonimo ? ' · anonimo' : ''}
                </span>
              </span>
              <Link className="btn btn-piccolo" href={`/gestione/crm/sondaggi/${x.id}`}>Risultati</Link>
              {x.risposte === 0 && <button className="link-btn piccolo" onClick={() => setS({ ...x })}>modifica</button>}
              <button className="link-btn piccolo" onClick={() => archivia(x)}>{x.attivo ? 'archivia' : 'riattiva'}</button>
            </span>
          </li>
        ))}
      </ul>
      <p className="piccolo muto" style={{ marginTop: 14 }}>
        Per mandarlo: Persone → Campagne → Nuova campagna, scegli il sondaggio e scrivi {'{sondaggio}'} dove vuoi il link.
        Un sondaggio con risposte non si modifica più, per non mescolare i risultati.
      </p>
    </>
  );
}
