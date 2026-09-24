'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import FoglioLezione from './FoglioLezione';
import { ora } from '@/lib/formato';
import { testoSu } from '@/lib/colori';

const GIORNI = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];

export default function Palinsesto({ inizio, lezioni, corsi = [], note = [], facce = [], palestraId, gestione = true }) {
  const [scelta, setScelta] = useState(null);
  const [apriAggiungi, setApriAggiungi] = useState(false);
  const [giorno, setGiorno] = useState(null);
  const [dati, setDati] = useState(null);

  const colore = (id) => corsi.find((c) => c.id === id)?.colore || 'var(--rosso)';
  const noteDi = (g) => note.filter((n) => n.data === g);
  const facceDi = (id) => facce.filter((f) => f.lezione_id === id);
  const iniziali = (f) => ((f.nome?.[0] || '') + (f.cognome?.[0] || '')).toUpperCase();
  const oggi = new Date().toLocaleDateString('sv-SE');
  const giorni = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(inizio + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });

  async function apriGiorno(g) {
    setGiorno(g); setDati(null);
    const { data } = await supabaseBrowser().rpc('giornata', { p_palestra: palestraId, p_data: g });
    setDati(data || null);
  }

  async function aggiungiNota() {
    const testo = prompt('Nota per questo giorno (la vede lo staff):');
    if (!testo?.trim()) return;
    await supabaseBrowser().from('note_giorno').insert({ palestra_id: palestraId, data: giorno, testo: testo.trim() });
    apriGiorno(giorno);
  }

  return (
    <>
      <div className="colonne-giorni">
        {giorni.map((g, i) => {
          const delGiorno = lezioni.filter((l) => l.data === g);
          const prove = delGiorno.reduce((s, l) => s + (l.prove || 0), 0);
          return (
            <section key={g} className="colonna-giorno">
              <header className={g === oggi ? 'testa-giorno oggi' : 'testa-giorno'}>
                <div>
                  <div className="piccolo muto">{GIORNI[i]}</div>
                  <strong>{g.slice(8, 10)}/{g.slice(5, 7)}</strong>
                </div>
                <button className="link-btn piccolo" onClick={() => apriGiorno(g)}
                        style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {prove > 0 && <span className="tag tag-rosso">{prove} prove</span>}
                  {noteDi(g).length > 0 && <span className="tag tag-neutro">{noteDi(g).length} note</span>}
                  {prove === 0 && noteDi(g).length === 0 && 'giornata'}
                </button>
              </header>

              {noteDi(g).map((n) => (
                <div key={n.id} className="nota-giorno">{n.testo}</div>
              ))}

              {delGiorno.length === 0 && <div className="vuoto" style={{ padding: 16, fontSize: 13 }}>Nessuna lezione</div>}

              {delGiorno.map((l) => {
                const c = colore(l.corso_id);
                const pieno = l.capienza ? Math.min(100, Math.round(((l.iscritti + l.prove) / l.capienza) * 100)) : 0;
                const annullata = l.stato === 'annullata';
                return (
                  <button key={l.lezione_id} type="button" className="carta-lezione"
                          onClick={() => setScelta(l)} style={{ borderColor: c, opacity: annullata ? .6 : 1 }}>
                    <span className="testa" style={{ background: c, color: testoSu(c) }}>
                      {ora(l.inizio)} – {ora(l.fine)}
                      {gestione && (
                        <span className="piu" role="button" tabIndex={0}
                              title="Aggiungi qualcuno a questa lezione"
                              onClick={(e) => { e.stopPropagation(); setScelta(l); setApriAggiungi(true); }}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setScelta(l); setApriAggiungi(true); } }}>+</span>
                      )}
                    </span>
                    <span className="corpo">
                      <span className="nome">{l.corso_nome}</span>
                      <span className="riga riga-insegnante">
                        {l.insegnante_foto
                          ? <img src={l.insegnante_foto} alt="" className="faccia faccia-ins" />
                          : <span className="faccia faccia-ins segnaposto">{(l.insegnante_nome || '?').slice(0, 1)}</span>}
                        <span>
                          {l.insegnante_nome || 'insegnante da assegnare'}
                          {l.sala_nome ? ` · ${l.sala_nome}` : ''}
                        </span>
                      </span>

                      {facceDi(l.lezione_id).length > 0 && (
                        <span className="facce">
                          {facceDi(l.lezione_id).slice(0, 5).map((f) => (
                            f.foto_url
                              ? <img key={f.allievo_id} src={f.foto_url} alt="" title={`${f.nome} ${f.cognome}`}
                                     className={f.tipo === 'prova' ? 'faccia prova' : 'faccia'} />
                              : <span key={f.allievo_id} title={`${f.nome} ${f.cognome}`}
                                      className={f.tipo === 'prova' ? 'faccia prova segnaposto' : 'faccia segnaposto'}>{iniziali(f)}</span>
                          ))}
                          {facceDi(l.lezione_id).length > 5 && (
                            <span className="faccia segnaposto piu-facce">+{facceDi(l.lezione_id).length - 5}</span>
                          )}
                        </span>
                      )}
                      <span className="numeri">
                        <span className="pallino verde">{l.iscritti}</span>
                        <span className="pallino azzurro">{l.capienza ? Math.max(l.capienza - l.iscritti - l.prove, 0) : '∞'}</span>
                        {l.prove > 0 && <span className="pallino rosso">{l.prove}p</span>}
                        {l.presenti > 0 && <span className="piccolo muto">{l.presenti} presenti</span>}
                      </span>
                      {l.capienza > 0 && <span className="riempimento"><span style={{ width: `${pieno}%`, background: c }} /></span>}
                      {annullata && <span className="tag tag-neutro">Annullata</span>}
                      {!annullata && l.prenotabile === false && <span className="tag tag-attenzione">Prenotazioni chiuse</span>}
                    </span>
                  </button>
                );
              })}
            </section>
          );
        })}
      </div>

      <p className="piccolo muto" style={{ marginTop: 10 }}>
        I tre pallini sono iscritti, posti liberi e persone in prova. Tocca una lezione per appello e azioni rapide,
        oppure il giorno per vedere chi arriva in prova.
      </p>

      {scelta && (
        <FoglioLezione lezione={scelta} colore={colore(scelta.corso_id)} gestione={gestione}
                       aggiungiSubito={apriAggiungi}
                       onClose={() => { setScelta(null); setApriAggiungi(false); }} />
      )}

      {giorno && (
        <div role="dialog" aria-label="Giornata"
             style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 50, display: 'flex', alignItems: 'flex-end' }}
             onClick={() => setGiorno(null)}>
          <div className="compare" onClick={(e) => e.stopPropagation()}
               style={{ background: 'var(--bianco)', borderRadius: '16px 16px 0 0', padding: 20, width: '100%',
                        maxWidth: 560, margin: '0 auto', maxHeight: '86vh', overflowY: 'auto',
                        paddingBottom: 'calc(20px + env(safe-area-inset-bottom,0px))' }}>
            <h2 style={{ textTransform: 'capitalize' }}>
              {new Date(giorno + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h2>
            {!dati && <p className="muto">Carico…</p>}

            {dati?.prove?.length > 0 && (
              <>
                <h3 className="giorno-titolo">In prova</h3>
                <ul className="elenco">
                  {dati.prove.map((p, i) => (
                    <li key={i} className="persona">
                      <span><strong style={{ color: 'var(--nero)' }}>{p.ora}</strong> {p.nome}
                        <span className="piccolo muto" style={{ display: 'block' }}>{p.corso}{p.telefono ? ` · ${p.telefono}` : ''}</span>
                      </span>
                      <span className={`tag ${p.stato === 'presente' ? 'tag-ok' : p.stato === 'assente' ? 'tag-neutro' : 'tag-rosso'}`}>
                        {p.stato === 'in_attesa_pagamento' ? 'da pagare' : p.stato}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {dati?.recuperi?.length > 0 && (
              <>
                <h3 className="giorno-titolo">Recuperi</h3>
                <ul className="elenco">
                  {dati.recuperi.map((r, i) => (
                    <li key={i} className="persona"><span><strong>{r.ora}</strong> {r.nome}</span><span className="piccolo muto">{r.corso}</span></li>
                  ))}
                </ul>
              </>
            )}
            {dati?.spazi?.length > 0 && (
              <>
                <h3 className="giorno-titolo">Sale affittate</h3>
                <ul className="elenco">
                  {dati.spazi.map((s, i) => (
                    <li key={i} className="persona">
                      <span><strong>{s.ora}</strong> {s.titolo}<span className="piccolo muto" style={{ display: 'block' }}>{s.sala} · {s.contatto}</span></span>
                      <span className="tag tag-neutro">{s.stato}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <h3 className="giorno-titolo">Note</h3>
            {dati?.note?.length
              ? <ul className="elenco">{dati.note.map((n) => <li key={n.id} className="persona"><span>{n.testo}</span></li>)}</ul>
              : <p className="muto piccolo">Nessuna nota.</p>}

            <div className="azioni" style={{ marginTop: 14 }}>
              {gestione && <button className="btn" onClick={aggiungiNota}>Aggiungi nota</button>}
              <button className="btn" onClick={() => setGiorno(null)}>Chiudi</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
