'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { ora, giornoLungo } from '@/lib/formato';

const GIORNI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const MINUTI = (iso) => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes(); };
const COLORI = ['#f40000', '#000000', '#b3001b', '#8a0303', '#d64545', '#5c5c5c', '#2b2b2b', '#7a7a7a'];

export default function Settimana({ inizio, lezioni, corsi = [], palestraId, gestione = true }) {
  const router = useRouter();
  const [scelta, setScelta] = useState(null);
  const [giorno, setGiorno] = useState(null);        // pannello del giorno
  const [dati, setDati] = useState(null);
  const [tavolozza, setTavolozza] = useState(false);
  const [daOggi, setDaOggi] = useState(false);
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);

  const coloreCorso = (id) => corsi.find((c) => c.id === id)?.colore || 'var(--rosso)';

  const giorni = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(inizio + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });

  async function apriGiorno(g) {
    setGiorno(g); setDati(null); setErrore('');
    const { data, error } = await supabaseBrowser().rpc('giornata', { p_palestra: palestraId, p_data: g });
    if (error) { setErrore('Impossibile leggere la giornata.'); return; }
    setDati(data);
  }

  async function azione(cosa, valore) {
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().rpc('modifica_lezione', {
      p_lezione: scelta.lezione_id, p_cosa: cosa, p_valore: valore == null ? '' : String(valore), p_da_oggi: daOggi,
    });
    setInvio(false);
    if (error) { setErrore('Operazione non riuscita.'); return; }
    setScelta(null); router.refresh();
  }

  async function cambiaColore(c) {
    setInvio(true);
    const { error } = await supabaseBrowser().rpc('colore_corso', { p_corso: scelta.corso_id, p_colore: c });
    setInvio(false);
    if (error) { setErrore('Colore non salvato.'); return; }
    setTavolozza(false); setScelta(null); router.refresh();
  }

  async function aggiungiNota() {
    const testo = prompt('Nota per questo giorno (la vede lo staff):');
    if (!testo?.trim()) return;
    const { error } = await supabaseBrowser().from('note_giorno')
      .insert({ palestra_id: palestraId, data: giorno, testo: testo.trim() });
    if (error) { setErrore('Nota non salvata.'); return; }
    apriGiorno(giorno);
  }

  if (!lezioni.length) return <div className="vuoto">Nessuna lezione in questa settimana.</div>;

  const inizi = lezioni.map((l) => MINUTI(l.inizio));
  const fini = lezioni.map((l) => MINUTI(l.fine));
  const dalle = Math.floor(Math.min(...inizi) / 60) * 60;
  const alle = Math.ceil(Math.max(...fini) / 60) * 60;
  const px = 1.1;
  const altezza = (alle - dalle) * px;
  const oggi = new Date().toLocaleDateString('sv-SE');
  const proveGiorno = (g) => lezioni.filter((l) => l.data === g).reduce((s, l) => s + (l.prove || 0), 0);

  const stile = (l) => {
    const c = coloreCorso(l.corso_id);
    if (l.stato === 'annullata') {
      return { background: 'repeating-linear-gradient(45deg,var(--carta),var(--carta)6px,#fff 6px,#fff 12px)',
               color: 'var(--testo-2)', border: '1px solid var(--linea)', borderLeft: `4px solid ${c}` };
    }
    const pct = l.capienza ? (l.iscritti + l.prove) / l.capienza : 0;
    if (!l.capienza) return { background: 'var(--bianco)', color: 'var(--testo)', border: '1px solid var(--linea)', borderLeft: `4px solid ${c}` };
    if (pct >= 0.9) return { background: c, color: '#fff', border: `1px solid ${c}` };
    if (pct >= 0.5) return { background: 'var(--rosso-tenue)', color: 'var(--rosso-scuro)', border: '1px solid var(--linea)', borderLeft: `4px solid ${c}` };
    return { background: 'var(--bianco)', color: 'var(--testo-2)', border: '1px solid var(--linea)', borderLeft: `4px solid ${c}` };
  };

  return (
    <>
      {errore && <div className="errore" role="alert">{errore}</div>}

      <div style={{ overflowX: 'auto', paddingBottom: 8, WebkitOverflowScrolling: 'touch' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '42px repeat(7, minmax(96px, 1fr))', minWidth: 720 }}>
          <div />
          {giorni.map((g, i) => (
            <button key={g} type="button" onClick={() => apriGiorno(g)}
                    style={{
                      background: 'none', border: 0, cursor: 'pointer', font: 'inherit',
                      padding: '6px 2px', fontSize: 13, fontWeight: 700,
                      color: g === oggi ? 'var(--rosso)' : 'var(--nero)',
                      borderBottom: g === oggi ? '2px solid var(--rosso)' : '1px solid var(--linea)',
                    }}>
              {GIORNI[i]} <span className="muto" style={{ fontWeight: 400 }}>{g.slice(8, 10)}</span>
              {proveGiorno(g) > 0 && (
                <span className="tag tag-rosso" style={{ marginLeft: 4, fontSize: 11 }}>{proveGiorno(g)}</span>
              )}
            </button>
          ))}

          <div style={{ position: 'relative', height: altezza }}>
            {Array.from({ length: (alle - dalle) / 60 + 1 }, (_, i) => (
              <div key={i} className="piccolo muto" style={{ position: 'absolute', top: i * 60 * px - 6, fontSize: 11 }}>
                {String(dalle / 60 + i).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {giorni.map((g) => (
            <div key={g} style={{ position: 'relative', height: altezza, borderLeft: '1px solid var(--linea)' }}>
              {Array.from({ length: (alle - dalle) / 60 + 1 }, (_, i) => (
                <div key={i} style={{ position: 'absolute', top: i * 60 * px, left: 0, right: 0, borderTop: '1px solid var(--linea)', opacity: .6 }} />
              ))}
              {lezioni.filter((l) => l.data === g).map((l) => {
                const top = (MINUTI(l.inizio) - dalle) * px;
                const h = Math.max((MINUTI(l.fine) - MINUTI(l.inizio)) * px, 34);
                return (
                  <button key={l.lezione_id} type="button" onClick={() => { setScelta(l); setDaOggi(false); setTavolozza(false); }}
                          style={{
                            position: 'absolute', top, left: 2, right: 2, height: h - 2,
                            borderRadius: 6, padding: '4px 5px', textAlign: 'left', cursor: 'pointer',
                            font: 'inherit', fontSize: 11, lineHeight: 1.15, overflow: 'hidden', ...stile(l),
                          }}>
                    <strong style={{ display: 'block', fontSize: 12 }}>{ora(l.inizio)}</strong>
                    <span style={{ display: 'block', fontWeight: 600 }}>{l.corso_nome}</span>
                    <span>
                      {l.iscritti}{l.capienza ? `/${l.capienza}` : ''}{l.prove > 0 ? ` +${l.prove}p` : ''}
                      {l.prenotabile === false ? ' · chiuso' : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <p className="piccolo muto" style={{ marginTop: 6 }}>
        Ogni corso ha il suo colore; il riempimento dice quanto è piena la lezione. Il numero rosso sul giorno sono le
        prove in arrivo: tocca il giorno per vedere chi. Tocca una lezione per appello e azioni rapide.
      </p>

      {/* ---------- Azioni sulla lezione ---------- */}
      {scelta && (
        <div role="dialog" aria-label="Lezione"
             style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 40, display: 'flex', alignItems: 'flex-end' }}
             onClick={() => setScelta(null)}>
          <div className="compare" onClick={(e) => e.stopPropagation()}
               style={{ background: 'var(--bianco)', borderRadius: '16px 16px 0 0', padding: 20, width: '100%',
                        maxWidth: 560, margin: '0 auto', maxHeight: '86vh', overflowY: 'auto',
                        paddingBottom: 'calc(20px + env(safe-area-inset-bottom,0px))' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 2 }}>
              <span style={{ width: 14, height: 14, borderRadius: 4, background: coloreCorso(scelta.corso_id), flex: 'none' }} />
              <h2 style={{ margin: 0 }}>{scelta.corso_nome}</h2>
            </div>
            <p className="muto" style={{ textTransform: 'capitalize' }}>
              {giornoLungo(scelta.inizio)}, {ora(scelta.inizio)}–{ora(scelta.fine)}
            </p>

            <ul className="elenco" style={{ marginBottom: 14 }}>
              <li className="persona"><span>Iscritti</span><strong>{scelta.iscritti}{scelta.capienza ? ` su ${scelta.capienza}` : ''}</strong></li>
              {scelta.prove > 0 && <li className="persona"><span>In prova</span><strong>{scelta.prove}</strong></li>}
              {scelta.capienza > 0 && <li className="persona"><span>Posti liberi</span><strong>{Math.max(scelta.capienza - scelta.iscritti - scelta.prove, 0)}</strong></li>}
              {scelta.presenti > 0 && <li className="persona"><span>Presenti</span><strong>{scelta.presenti}</strong></li>}
            </ul>

            <div className="azioni" style={{ marginBottom: 14 }}>
              <Link className="btn btn-primario" href={`/gestione/appello/${scelta.lezione_id}`}>Fai l'appello</Link>
              <Link className="btn" href={`/gestione/corsi/${scelta.corso_id}`}>Vedi il corso</Link>
            </div>

            {gestione && (
              <>
                <label className="spunta">
                  <input type="checkbox" checked={daOggi} onChange={(e) => setDaOggi(e.target.checked)} />
                  <span>Applica a tutte le lezioni future di questo orario, non solo a questa</span>
                </label>

                <div className="da-fare">
                  <a href="#" onClick={(e) => { e.preventDefault(); setTavolozza(!tavolozza); }}>
                    <span>Cambia colore del corso</span><span className="conta">›</span>
                  </a>
                  {tavolozza && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '4px 2px 8px' }}>
                      {COLORI.map((c) => (
                        <button key={c} type="button" disabled={invio} onClick={() => cambiaColore(c)}
                                aria-label={`Colore ${c}`}
                                style={{ width: 36, height: 36, borderRadius: 8, background: c, cursor: 'pointer',
                                         border: '1px solid var(--linea)' }} />
                      ))}
                    </div>
                  )}
                  <a href="#" onClick={(e) => {
                    e.preventDefault();
                    const v = prompt('Quanti posti per questa lezione? (vuoto = come il corso)', scelta.capienza ?? '');
                    if (v !== null) azione('posti', v.trim());
                  }}>
                    <span>Modifica i posti disponibili</span><span className="conta">{scelta.capienza ?? '–'}</span>
                  </a>
                  <a href="#" onClick={(e) => { e.preventDefault(); azione('prenotabile', scelta.prenotabile === false); }}>
                    <span>{scelta.prenotabile === false ? 'Riapri le prenotazioni' : 'Blocca le prenotazioni'}</span>
                    <span className="conta">{scelta.prenotabile === false ? 'chiuso' : 'aperto'}</span>
                  </a>
                  {scelta.stato === 'annullata' ? (
                    <a href="#" onClick={(e) => { e.preventDefault(); azione('ripristina', ''); }}>
                      <span>Ripristina la lezione</span><span className="conta">↺</span>
                    </a>
                  ) : (
                    <a href="#" className="urgente" onClick={(e) => {
                      e.preventDefault();
                      const m = prompt('Motivo (lo vede lo staff in agenda):', 'Lezione annullata');
                      if (m !== null) azione('annulla', m);
                    }}>
                      <span>Annulla la lezione</span><span className="conta">×</span>
                    </a>
                  )}
                </div>
              </>
            )}

            <p style={{ marginTop: 14 }}><button className="link-btn" onClick={() => setScelta(null)}>Chiudi</button></p>
          </div>
        </div>
      )}

      {/* ---------- Pannello del giorno ---------- */}
      {giorno && (
        <div role="dialog" aria-label="Giornata"
             style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 40, display: 'flex', alignItems: 'flex-end' }}
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
                      <span>
                        <strong style={{ color: 'var(--nero)' }}>{p.ora}</strong> {p.nome}
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
                      <span><strong>{s.ora}</strong> {s.titolo}
                        <span className="piccolo muto" style={{ display: 'block' }}>{s.sala} · {s.contatto}</span>
                      </span>
                      <span className="tag tag-neutro">{s.stato}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <h3 className="giorno-titolo">Note</h3>
            {dati?.note?.length ? (
              <ul className="elenco">
                {dati.note.map((n) => <li key={n.id} className="persona"><span>{n.testo}</span></li>)}
              </ul>
            ) : <p className="muto piccolo">Nessuna nota per questo giorno.</p>}

            {dati && dati.prove.length === 0 && dati.recuperi.length === 0 && dati.spazi.length === 0 && dati.note.length === 0 && (
              <div className="vuoto">Giornata tranquilla: nessuna prova, nessun affitto, nessuna nota.</div>
            )}

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
