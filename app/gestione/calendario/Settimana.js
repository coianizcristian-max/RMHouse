'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ora, giornoLungo } from '@/lib/formato';

const GIORNI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const MINUTI = (iso) => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes(); };

export default function Settimana({ inizio, lezioni }) {
  const [scelta, setScelta] = useState(null);

  const giorni = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(inizio + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });

  if (!lezioni.length) return <div className="vuoto">Nessuna lezione in questa settimana.</div>;

  // finestra oraria mostrata: dalla prima all'ultima lezione della settimana
  const inizi = lezioni.map((l) => MINUTI(l.inizio));
  const fini = lezioni.map((l) => MINUTI(l.fine));
  const dalle = Math.floor(Math.min(...inizi) / 60) * 60;
  const alle = Math.ceil(Math.max(...fini) / 60) * 60;
  const px = 1.1;                                  // minuti → pixel
  const altezza = (alle - dalle) * px;
  const oggi = new Date().toLocaleDateString('sv-SE');

  const colore = (l) => {
    if (l.stato === 'annullata') return { background: 'repeating-linear-gradient(45deg,var(--carta),var(--carta)6px,#fff 6px,#fff 12px)', color: 'var(--testo-2)', border: '1px solid var(--linea)' };
    const pct = l.capienza ? (l.iscritti + l.prove) / l.capienza : 0;
    if (!l.capienza) return { background: 'var(--carta)', color: 'var(--testo)', border: '1px solid var(--linea)' };
    if (pct >= 0.9) return { background: 'var(--rosso)', color: '#fff', border: '1px solid var(--rosso)' };
    if (pct >= 0.5) return { background: 'var(--rosso-tenue)', color: 'var(--rosso-scuro)', border: '1px solid var(--rosso)' };
    return { background: 'var(--carta)', color: 'var(--testo-2)', border: '1px solid var(--linea)' };
  };

  return (
    <>
      <div style={{ overflowX: 'auto', paddingBottom: 8, WebkitOverflowScrolling: 'touch' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `42px repeat(7, minmax(92px, 1fr))`, minWidth: 700 }}>
          <div />
          {giorni.map((g, i) => (
            <div key={g} style={{
              textAlign: 'center', padding: '6px 2px', fontWeight: 700, fontSize: 13,
              color: g === oggi ? 'var(--rosso)' : 'var(--nero)',
              borderBottom: g === oggi ? '2px solid var(--rosso)' : '1px solid var(--linea)',
            }}>
              {GIORNI[i]} <span className="muto" style={{ fontWeight: 400 }}>{g.slice(8, 10)}</span>
            </div>
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
                <div key={i} style={{ position: 'absolute', top: i * 60 * px, left: 0, right: 0, borderTop: '1px solid var(--linea)', opacity: 0.6 }} />
              ))}
              {lezioni.filter((l) => l.data === g).map((l) => {
                const top = (MINUTI(l.inizio) - dalle) * px;
                const h = Math.max((MINUTI(l.fine) - MINUTI(l.inizio)) * px, 34);
                return (
                  <button key={l.lezione_id} type="button" onClick={() => setScelta(l)}
                          style={{
                            position: 'absolute', top, left: 2, right: 2, height: h - 2,
                            borderRadius: 6, padding: '4px 5px', textAlign: 'left', cursor: 'pointer',
                            font: 'inherit', fontSize: 11, lineHeight: 1.15, overflow: 'hidden', ...colore(l),
                          }}>
                    <strong style={{ display: 'block', fontSize: 12 }}>{ora(l.inizio)}</strong>
                    <span style={{ display: 'block', fontWeight: 600 }}>{l.corso_nome}</span>
                    <span>{l.iscritti}{l.capienza ? `/${l.capienza}` : ''}{l.prove > 0 ? ` +${l.prove}p` : ''}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <p className="piccolo muto" style={{ marginTop: 6 }}>
        Il colore indica quanto è piena la lezione: pieno = quasi al completo, chiaro = mezza, grigio = vuota.
        Il <strong>+2p</strong> sono le persone in prova. Tocca una lezione per i dettagli.
      </p>

      {scelta && (
        <div role="dialog" aria-label="Dettagli lezione"
             style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 40, display: 'flex', alignItems: 'flex-end' }}
             onClick={() => setScelta(null)}>
          <div className="compare" onClick={(e) => e.stopPropagation()}
               style={{ background: 'var(--bianco)', borderRadius: '16px 16px 0 0', padding: 20, width: '100%',
                        maxWidth: 560, margin: '0 auto', paddingBottom: 'calc(20px + env(safe-area-inset-bottom,0px))' }}>
            <h2 style={{ marginBottom: 2 }}>{scelta.corso_nome}</h2>
            <p className="muto" style={{ textTransform: 'capitalize' }}>
              {giornoLungo(scelta.inizio)}, {ora(scelta.inizio)}–{ora(scelta.fine)}
            </p>
            <ul className="elenco" style={{ marginBottom: 16 }}>
              <li className="persona"><span>Iscritti</span><strong>{scelta.iscritti}{scelta.capienza ? ` su ${scelta.capienza}` : ''}</strong></li>
              {scelta.prove > 0 && <li className="persona"><span>In prova</span><strong>{scelta.prove}</strong></li>}
              {scelta.capienza > 0 && <li className="persona"><span>Posti liberi</span><strong>{Math.max(scelta.capienza - scelta.iscritti - scelta.prove, 0)}</strong></li>}
              {scelta.presenti > 0 && <li className="persona"><span>Presenti</span><strong>{scelta.presenti}</strong></li>}
            </ul>
            <div className="azioni">
              <Link className="btn btn-primario" href={`/gestione/appello/${scelta.lezione_id}`}>Fai l'appello</Link>
              <Link className="btn" href={`/gestione/corsi/${scelta.corso_id}`}>Vedi il corso</Link>
            </div>
            <p style={{ marginTop: 12 }}><button className="link-btn" onClick={() => setScelta(null)}>Chiudi</button></p>
          </div>
        </div>
      )}
    </>
  );
}
