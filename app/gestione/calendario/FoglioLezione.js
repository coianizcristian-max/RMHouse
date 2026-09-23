'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { ora, giornoLungo } from '@/lib/formato';

const COLORI = ['#f40000', '#000000', '#b3001b', '#8a0303', '#d64545', '#5c5c5c', '#2b2b2b', '#7a7a7a'];

// Pannello che si apre dal basso toccando una lezione
export default function FoglioLezione({ lezione, colore, gestione, onClose }) {
  const router = useRouter();
  const [tavolozza, setTavolozza] = useState(false);
  const [daOggi, setDaOggi] = useState(false);
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);

  async function azione(cosa, valore) {
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().rpc('modifica_lezione', {
      p_lezione: lezione.lezione_id, p_cosa: cosa, p_valore: valore == null ? '' : String(valore), p_da_oggi: daOggi,
    });
    setInvio(false);
    if (error) { setErrore('Operazione non riuscita.'); return; }
    onClose(); router.refresh();
  }

  async function cambiaColore(c) {
    setInvio(true);
    const { error } = await supabaseBrowser().rpc('colore_corso', { p_corso: lezione.corso_id, p_colore: c });
    setInvio(false);
    if (error) { setErrore('Colore non salvato.'); return; }
    onClose(); router.refresh();
  }

  return (
    <div role="dialog" aria-label="Lezione"
         style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 50, display: 'flex', alignItems: 'flex-end' }}
         onClick={onClose}>
      <div className="compare" onClick={(e) => e.stopPropagation()}
           style={{ background: 'var(--bianco)', borderRadius: '16px 16px 0 0', padding: 20, width: '100%',
                    maxWidth: 560, margin: '0 auto', maxHeight: '86vh', overflowY: 'auto',
                    paddingBottom: 'calc(20px + env(safe-area-inset-bottom,0px))' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 2 }}>
          <span style={{ width: 14, height: 14, borderRadius: 4, background: colore, flex: 'none' }} />
          <h2 style={{ margin: 0 }}>{lezione.corso_nome}</h2>
        </div>
        <p className="muto" style={{ textTransform: 'capitalize' }}>
          {giornoLungo(lezione.inizio)}, {ora(lezione.inizio)}–{ora(lezione.fine)}
        </p>
        {errore && <div className="errore" role="alert">{errore}</div>}

        <ul className="elenco" style={{ marginBottom: 14 }}>
          <li className="persona"><span>Iscritti</span><strong>{lezione.iscritti}{lezione.capienza ? ` su ${lezione.capienza}` : ''}</strong></li>
          {lezione.prove > 0 && <li className="persona"><span>In prova</span><strong>{lezione.prove}</strong></li>}
          {lezione.capienza > 0 && <li className="persona"><span>Posti liberi</span><strong>{Math.max(lezione.capienza - lezione.iscritti - lezione.prove, 0)}</strong></li>}
          {lezione.presenti > 0 && <li className="persona"><span>Presenti</span><strong>{lezione.presenti}</strong></li>}
        </ul>

        <div className="azioni" style={{ marginBottom: 14 }}>
          <Link className="btn btn-primario" href={`/gestione/appello/${lezione.lezione_id}`}>Appello e prenotati</Link>
          <Link className="btn" href={`/gestione/corsi/${lezione.corso_id}`}>Scheda del corso</Link>
        </div>

        {gestione && (
          <>
            <label className="spunta">
              <input type="checkbox" checked={daOggi} onChange={(e) => setDaOggi(e.target.checked)} />
              <span>Applica a tutte le lezioni future di questo orario</span>
            </label>

            <div className="da-fare">
              <a href="#" onClick={(e) => { e.preventDefault(); setTavolozza(!tavolozza); }}>
                <span>Cambia colore del corso</span><span className="conta">›</span>
              </a>
              {tavolozza && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '4px 2px 8px' }}>
                  {COLORI.map((c) => (
                    <button key={c} type="button" disabled={invio} onClick={() => cambiaColore(c)} aria-label={`Colore ${c}`}
                            style={{ width: 36, height: 36, borderRadius: 8, background: c, cursor: 'pointer', border: '1px solid var(--linea)' }} />
                  ))}
                </div>
              )}
              <a href="#" onClick={(e) => {
                e.preventDefault();
                const v = prompt('Quanti posti per questa lezione? (vuoto = come il corso)', lezione.capienza ?? '');
                if (v !== null) azione('posti', v.trim());
              }}>
                <span>Modifica i posti disponibili</span><span className="conta">{lezione.capienza ?? '–'}</span>
              </a>
              <a href="#" onClick={(e) => { e.preventDefault(); azione('prenotabile', lezione.prenotabile === false); }}>
                <span>{lezione.prenotabile === false ? 'Riapri le prenotazioni' : 'Blocca le prenotazioni'}</span>
                <span className="conta">{lezione.prenotabile === false ? 'chiuso' : 'aperto'}</span>
              </a>
              {lezione.stato === 'annullata' ? (
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

        <p style={{ marginTop: 14 }}><button className="link-btn" onClick={onClose}>Chiudi</button></p>
      </div>
    </div>
  );
}
