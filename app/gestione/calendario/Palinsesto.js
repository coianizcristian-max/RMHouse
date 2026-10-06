'use client';
import { useState, useRef, useEffect } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import FoglioLezione from './FoglioLezione';
import AzioniGruppo from './AzioniGruppo';
import { ora } from '@/lib/formato';
import { testoSu } from '@/lib/colori';

const GIORNI = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
const MAX_FACCE = 6; // al massimo 6 cerchietti e poi "…"; se la scheda è stretta sfumano verso destra

// Icone piccole e grigie: insegnante, sala, prove
const IconaPersona = () => (
  <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" /><circle cx="17" cy="9" r="2.5" /><path d="M16 14.5c3 .3 5.5 2.6 5.5 5.5" />
  </svg>
);
const IconaSala = () => (
  <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
    <path d="M4 21V9l8-5 8 5v12" /><path d="M9 21v-7h6v7" />
  </svg>
);
const IconaProva = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
    <path d="M3 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H3zM21 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z" />
  </svg>
);

// Palinsesto a schede, una colonna per giorno, con la grafica della vecchia app:
// bordo e banda nel colore del corso con l'orario, nome del corso, insegnante e sala con l'icona, i cerchietti dei prenotati
// (o "Nessun prenotato"), i numeri (verde = prenotati, blu = posti liberi), il "+" per aggiungere qualcuno, la barra di riempimento
// e in basso il cerchietto per selezionare più lezioni insieme (insegnante, sala, posti, prenotazioni, nota, annulla).
export default function Palinsesto({ giorniVisti = 7, inizio, lezioni, corsi = [], note = [], facce = [], coda = [], sale = [], insegnanti = [], palestraId, gestione = true }) {
  const [aggiorno, setAggiorno] = useState(false); // mentre la pagina si ricarica dopo un'azione di gruppo
  const [scelta, setScelta] = useState(null);
  const [apriAggiungi, setApriAggiungi] = useState(false);
  const [giorno, setGiorno] = useState(null);
  const [dati, setDati] = useState(null);
  const [menu, setMenu] = useState(null);
  const [selezione, setSelezione] = useState([]);
  const [giornoVisto, setGiornoVisto] = useState(0); // sul telefono: la colonna (giorno) che si sta guardando
  const scorrevole = useRef(null);

  const corsoDi = (id) => corsi.find((c) => c.id === id);
  const colore = (id) => corsoDi(id)?.colore || 'var(--rosso)';
  const noteDi = (g) => note.filter((n) => n.data === g);
  const facceDi = (id) => facce.filter((f) => f.lezione_id === id);
  const codaDi = (id) => coda.filter((c) => c.lezione_id === id);
  // nome e cognome dell'insegnante (nella vista c'è solo il nome)
  const nomeInsegnante = (l) => {
    const s = insegnanti.find((x) => x.id === l.insegnante_id);
    return s ? `${s.nome || ''} ${s.cognome || ''}`.trim() : l.insegnante_nome;
  };
  const iniziali = (f) => ((f.nome?.[0] || '') + (f.cognome?.[0] || '')).toUpperCase();
  // l'elenco dei prenotati per il riquadro che compare passandoci sopra: i nomi sono già nella pagina, nessuna richiesta in più
  const elencoNomi = (fl, titolo) => {
    const nomi = [...fl].sort((a, b) => `${a.nome} ${a.cognome}`.localeCompare(`${b.nome} ${b.cognome}`, 'it'))
      .map((f) => `${f.nome || ''} ${f.cognome || ''}`.trim() + (f.tipo === 'prova' ? ' (prova)' : ''));
    const max = 20;
    return [titolo, ...nomi.slice(0, max), ...(nomi.length > max ? [`… e altri ${nomi.length - max}`] : [])].join('\n');
  };
  const oggi = new Date().toLocaleDateString('sv-SE');
  const giorni = Array.from({ length: giorniVisti }, (_, i) => {
    const d = new Date(inizio + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
  // il nome del giorno dalla data (con 1, 3 o 5 giorni il primo non è per forza lunedì)
  const nomeGiorno = (g) => GIORNI[(new Date(g + 'T12:00:00Z').getUTCDay() + 6) % 7];
  // computer, 3, 5 o 7 giorni: un giorno senza lezioni (di solito la domenica) diventa una colonna stretta che si intravede,
  // così gli altri giorni hanno più spazio; se c'è anche una sola lezione torna larga come le altre
  const vuoti = giorni.map((g) => !lezioni.some((l) => l.data === g) && !note.some((n) => n.data === g));
  const colonne = giorni.length >= 3 && vuoti.some(Boolean) && !vuoti.every(Boolean)
    ? vuoti.map((v) => (v ? 'minmax(92px, .42fr)' : 'minmax(0, 1fr)')).join(' ') : null;

  // Sul telefono si vede un giorno alla volta: all'apertura va su oggi (se è in questa settimana), le linguette portano agli altri
  useEffect(() => {
    const el = scorrevole.current;
    if (!el || window.innerWidth >= 900) return;
    const i = Math.max(0, giorni.indexOf(oggi));
    el.scrollTo({ left: el.clientWidth * i + i * 16, behavior: 'instant' });
    setGiornoVisto(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inizio]);
  const vaiAlGiorno = (i) => {
    const el = scorrevole.current; if (!el) return;
    el.scrollTo({ left: el.clientWidth * i + i * 16, behavior: 'smooth' }); setGiornoVisto(i);
  };
  const scorso = () => {
    const el = scorrevole.current; if (!el || window.innerWidth >= 900) return;
    const i = Math.round(el.scrollLeft / (el.clientWidth + 16));
    if (i !== giornoVisto) setGiornoVisto(Math.min(giorni.length - 1, Math.max(0, i)));
  };
  const lunga = (g) => `${g.slice(8, 10)}-${g.slice(5, 7)}-${g.slice(0, 4)}`;

  async function apriGiorno(g) {
    setMenu(null); setGiorno(g); setDati(null);
    const { data } = await supabaseBrowser().rpc('giornata', { p_palestra: palestraId, p_data: g });
    setDati(data || null);
  }

  async function aggiungiNota(g) {
    setMenu(null);
    const testo = prompt('Nota per questo giorno (la vede lo staff):');
    if (!testo?.trim()) return;
    await supabaseBrowser().from('note_giorno').insert({ palestra_id: palestraId, data: g, testo: testo.trim() });
    apriGiorno(g);
  }

  const apri = (l) => { setScelta(l); setApriAggiungi(false); };
  const aggiungi = (e, l) => { e.stopPropagation(); setScelta(l); setApriAggiungi(true); };
  const seleziona = (e, id) => {
    e.stopPropagation();
    setSelezione((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };
  const selezionaGiorno = (g) => {
    setMenu(null);
    const ids = lezioni.filter((l) => l.data === g).map((l) => l.lezione_id);
    setSelezione((s) => Array.from(new Set([...s, ...ids])));
  };
  const selezionate = lezioni.filter((l) => selezione.includes(l.lezione_id));

  return (
    <>
      {menu && <div className="pal-velo" onClick={() => setMenu(null)} />}
      <div className={selezionate.length ? 'pal-layout con-azioni' : 'pal-layout'}>
        {gestione && selezionate.length > 0 && (
          <AzioniGruppo lezioni={selezionate} sale={sale} insegnanti={insegnanti} occupato={aggiorno}
                        onDeseleziona={() => setSelezione([])}
                        onFatto={() => {
                          // ricarico la pagina per intero: dopo un'azione su più lezioni l'aggiornamento "morbido" a volte mostrava ancora i dati vecchi
                          setSelezione([]); setAggiorno(true); window.location.reload();
                        }} />
        )}
        <div className="pal-settimana">
        {aggiorno && <div className="pal-aggiorno" role="status">Aggiorno il palinsesto…</div>}
        {giorni.length > 1 && <div className="pal-linguette solo-mobile" role="tablist" aria-label="Giorni">
          {giorni.map((g, i) => (
            <button key={g} type="button" role="tab" aria-selected={giornoVisto === i} className={`pal-linguetta${giornoVisto === i ? ' attiva' : ''}${g === oggi ? ' oggi' : ''}`}
                    onClick={() => vaiAlGiorno(i)}>
              <span>{nomeGiorno(g).slice(0, 3)}</span><strong>{Number(g.slice(8, 10))}</strong>
            </button>
          ))}
        </div>}
        <div className={`colonne-giorni palinsesto giorni-${giorni.length}`} ref={scorrevole} onScroll={scorso}
             style={colonne ? { '--pal-colonne': colonne } : undefined}>
          {giorni.map((g) => {
            const delGiorno = lezioni.filter((l) => l.data === g);
            const prove = delGiorno.reduce((s, l) => s + (l.prove || 0), 0);
            const nNote = noteDi(g).length;
            const dataBreve = `${Number(g.slice(8, 10))}/${Number(g.slice(5, 7))}`;
            return (
              <section key={g} className={`colonna-giorno${delGiorno.length === 0 ? ' vuota' : ''}`}>
                <header className={g === oggi ? 'pal-testa oggi' : 'pal-testa'}>
                  <span className="pal-giorno">
                    <span className="pal-nome-giorno">{nomeGiorno(g)}</span>
                    <span className="pal-data">{dataBreve}</span>
                    <span className="pal-data-lunga">{nomeGiorno(g)} {lunga(g)}</span>
                  </span>
                  <span className="pal-destra">
                    <button type="button" className={prove > 0 ? 'pal-badge pieno' : 'pal-badge'} title={`${prove} in prova`}
                            aria-label={`${prove} in prova ${nomeGiorno(g)} ${dataBreve}`} onClick={() => apriGiorno(g)}>
                      <IconaProva /> {prove}
                    </button>
                    <button type="button" className="pal-menu-btn" aria-label={`Menu di ${nomeGiorno(g)} ${dataBreve}`}
                            aria-expanded={menu === g} onClick={() => setMenu(menu === g ? null : g)}>⋮</button>
                  </span>
                  {menu === g && (
                    <div className="pal-tendina" role="menu">
                      <button type="button" role="menuitem" onClick={() => apriGiorno(g)}>Chi arriva: prove, recuperi, affitti</button>
                      {gestione && <button type="button" role="menuitem" onClick={() => aggiungiNota(g)}>Aggiungi una nota al giorno</button>}
                      {gestione && delGiorno.length > 0 && <button type="button" role="menuitem" onClick={() => selezionaGiorno(g)}>Seleziona le {delGiorno.length} lezioni</button>}
                      {nNote > 0 && <button type="button" role="menuitem" onClick={() => apriGiorno(g)}>{nNote} {nNote === 1 ? 'nota' : 'note'} del giorno</button>}
                    </div>
                  )}
                </header>

                {noteDi(g).map((n) => (
                  <div key={n.id} className="nota-giorno">{n.testo}</div>
                ))}

                {delGiorno.length === 0 && <div className="pal-vuoto">Nessuna lezione</div>}

                <div className="pal-carte">
                {delGiorno.map((l) => {
                  const c = colore(l.corso_id);
                  const corso = corsoDi(l.corso_id);
                  const pieno = l.capienza ? Math.min(100, Math.round(((l.iscritti + l.prove) / l.capienza) * 100)) : 0;
                  const annullata = l.stato === 'annullata';
                  const nonVisibile = corso && (corso.visibilita !== 'pubblico' || corso.attivo === false);
                  const posti = l.capienza ? Math.max(l.capienza - l.iscritti - l.prove, 0) : null;
                  const fl = facceDi(l.lezione_id);
                  const altri = fl.slice(MAX_FACCE);
                  const scelto = selezione.includes(l.lezione_id);
                  const etichetta = annullata ? ['Lezione annullata', 'grigia']
                    : l.prenotabile === false ? ['Corso non prenotabile', '']
                    : nonVisibile ? ['Corso non visibile', ''] : null;
                  return (
                    <div key={l.lezione_id} role="button" tabIndex={0}
                         className={`pal-carta${annullata ? ' annullata' : ''}${scelto ? ' selezionata' : ''}`}
                         style={{ borderColor: c }}
                         onClick={() => apri(l)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); apri(l); } }}
                         aria-label={`${l.corso_nome}, ${ora(l.inizio)}`}>
                      <div className="pal-banda" style={{ background: c, color: testoSu(c) }}>
                        {ora(l.inizio)} - {ora(l.fine)}
                        {l.note && !annullata && <span className="pal-angolo" data-tip={l.note} tabIndex={0} aria-label={`Nota: ${l.note}`} />}
                      </div>
                      <div className="pal-corpo">
                        <div className="pal-nome">{l.corso_nome}</div>
                        <div className="pal-riga" title={nomeInsegnante(l) || undefined}><IconaPersona />{nomeInsegnante(l) || 'insegnante da assegnare'}</div>
                        <div className="pal-riga" title={l.sala_nome || undefined}><IconaSala />{l.sala_nome || 'sala da assegnare'}</div>

                        <div className="pal-piede">
                          {fl.length === 0
                            ? <span className="pal-nessuno">{l.presenti > 0 ? `${l.presenti} presenti` : 'Nessun prenotato'}</span>
                            : (
                              <span className="pal-facce-box" tabIndex={0} data-tip={elencoNomi(fl, `${fl.length} ${fl.length === 1 ? 'Prenotato' : 'Prenotati'}:`)}>
                              <span className="pal-facce">
                                {fl.slice(0, MAX_FACCE).map((f) => (
                                  f.foto_url
                                    ? <img key={f.allievo_id} src={f.foto_url} alt="" className={f.tipo === 'prova' ? 'pal-faccia prova' : 'pal-faccia'} />
                                    : <span key={f.allievo_id} className={f.tipo === 'prova' ? 'pal-faccia prova' : 'pal-faccia'}>{iniziali(f)}</span>
                                ))}
                                {altri.length > 0 && <span className="pal-altri" aria-label={`e altri ${altri.length}`}>…</span>}
                              </span>
                              </span>
                            )}
                          <span className="pal-numeri" onClick={(e) => { if (e.target.closest('.pal-cerchio')) { e.stopPropagation(); e.target.closest('.pal-cerchio').focus(); } }}>
                            <span className="pal-cerchio verde" tabIndex={0} data-tip={fl.length ? elencoNomi(fl, `${l.iscritti} ${l.iscritti === 1 ? 'Prenotato' : 'Prenotati'}:`) : `${l.iscritti} ${l.iscritti === 1 ? 'Prenotato' : 'Prenotati'}`} aria-label={`${l.iscritti} prenotati`}>{l.iscritti}</span>
                            <span className="pal-cerchio blu" tabIndex={0} data-tip={posti === null ? 'Posti senza limite' : `${posti} ${posti === 1 ? 'Posto disponibile' : 'Posti disponibili'}`} aria-label={posti === null ? 'posti senza limite' : `${posti} posti disponibili`}>{posti === null ? '∞' : posti}</span>
                            {l.prove > 0 && <span className="pal-cerchio rosso" tabIndex={0} data-tip={`${l.prove} in prova`} aria-label={`${l.prove} in prova`}>{l.prove}</span>}
                            {codaDi(l.lezione_id).length > 0 && (
                              <span className="pal-cerchio coda" tabIndex={0}
                                    data-tip={[`${codaDi(l.lezione_id).length} in coda:`, ...codaDi(l.lezione_id).map((c, i) => `${i + 1}. ${`${c.allievi?.nome || ''} ${c.allievi?.cognome || ''}`.trim()}`)].join('\n')}
                                    aria-label={`${codaDi(l.lezione_id).length} in coda`}>{codaDi(l.lezione_id).length}</span>
                            )}
                            {gestione && !annullata && (
                              <button type="button" className="pal-piu" data-tip="Aggiungi qualcuno alla lezione" aria-label="Aggiungi qualcuno alla lezione"
                                      onClick={(e) => aggiungi(e, l)}>+</button>
                            )}
                          </span>
                        </div>

                        <div className="pal-fondo">
                          {etichetta
                            ? <div className="pal-centro"><span className={`pal-etichetta ${etichetta[1]}`} title={etichetta[0]}>{etichetta[0]}</span></div>
                            : <div className={`pal-barra${posti === 0 ? ' piena' : ''}`}><span style={{ width: `${pieno}%` }} /></div>}
                        </div>
                      </div>
                      {gestione && (
                        <button type="button" className={scelto ? 'pal-check scelto' : 'pal-check'} aria-pressed={scelto}
                                aria-label={scelto ? 'Togli dalla selezione' : 'Seleziona questa lezione'}
                                onClick={(e) => seleziona(e, l.lezione_id)} onKeyDown={(e) => e.stopPropagation()}>
                          {scelto && <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>}
                        </button>
                      )}
                    </div>
                  );
                })}
                </div>
              </section>
            );
          })}
        </div>
        </div>
      </div>

      {scelta && (
        <FoglioLezione lezione={scelta} colore={colore(scelta.corso_id)} gestione={gestione} persone={facceDi(scelta.lezione_id)} coda={codaDi(scelta.lezione_id)}
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
            {dati && !dati.prove?.length && <p className="muto piccolo">Nessuno in prova.</p>}
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
              {gestione && <button className="btn" onClick={() => aggiungiNota(giorno)}>Aggiungi nota</button>}
              <button className="btn" onClick={() => setGiorno(null)}>Chiudi</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
