'use client';
import Sostituzione from '../Sostituzione';
import { useState } from 'react';
import SceltaColore from '../SceltaColore';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { ora, giornoLungo } from '@/lib/formato';


// Pannello che si apre dal basso toccando una lezione
const TIPI = { recupero: 'recupero', ingresso: 'ingresso', prova: 'in prova' };

export default function FoglioLezione({ lezione, colore, gestione, onClose, aggiungiSubito = false, persone = [], coda = [] }) {
  const router = useRouter();
  const [elenco, setElenco] = useState(false);
  const [vediCoda, setVediCoda] = useState(true);   // gli iscritti si vedono toccando "Iscritti" (sono già caricati col palinsesto)
  const ordinati = [...persone].sort((a, b) => `${a.cognome} ${a.nome}`.localeCompare(`${b.cognome} ${b.nome}`, 'it'));
  const [aggiungi, setAggiungi] = useState(aggiungiSubito);
  const [testoCerca, setTestoCerca] = useState('');
  const [candidati, setCandidati] = useState(null);

  async function cerca(testo) {
    setCandidati(null);
    const { data } = await supabaseBrowser().rpc('candidati_lezione', { p_lezione: lezione.lezione_id, p_cerca: testo });
    setCandidati(data || []);
  }

  async function aggiungiPersona(c) {
    let forza = false;
    if (!c.certificato_ok || c.abbonamento === 'nessun abbonamento') {
      forza = confirm(`${c.nome} ${c.cognome}: ${!c.certificato_ok ? 'certificato non valido' : 'nessun abbonamento attivo'}. Aggiungere lo stesso?`);
      if (!forza) return;
    }
    const tipo = confirm('È un recupero? Premi Annulla per un ingresso normale.') ? 'recupero' : 'ingresso';
    const { error } = await supabaseBrowser().rpc('aggiungi_partecipante', {
      p_lezione: lezione.lezione_id, p_allievo: c.allievo_id, p_tipo: tipo, p_forza: forza, p_note: null,
    });
    if (error) {
      setErrore(error.message?.includes('lezione_al_completo')
        ? 'Lezione al completo: alza i posti qui sotto, oppure forza.'
        : 'Aggiunta non riuscita: controlla abbonamento e certificato.');
      return;
    }
    onClose(); router.refresh();
  }
  const [tavolozza, setTavolozza] = useState(false);
  const [daOggi, setDaOggi] = useState(false);
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);

  async function azione(cosa, valore, recupero = true) {
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().rpc('modifica_lezione', {
      p_lezione: lezione.lezione_id, p_cosa: cosa, p_valore: valore == null ? '' : String(valore), p_da_oggi: daOggi,
      ...(cosa === 'annulla' ? { p_recupero: recupero } : {}),
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
          <li className="persona fl-iscritti">
            <button type="button" className="fl-espandi" aria-expanded={elenco} disabled={!ordinati.length} onClick={() => setElenco(!elenco)}>
              <span>Iscritti {ordinati.length > 0 && <span className="fl-freccia" aria-hidden="true">{elenco ? '▾' : '▸'}</span>}
                {ordinati.length > 0 && <span className="piccolo muto"> {elenco ? 'nascondi' : 'vedi chi sono'}</span>}</span>
              <strong>{lezione.iscritti}{lezione.capienza ? ` su ${lezione.capienza}` : ''}</strong>
            </button>
            {elenco && (
              <ul className="fl-persone">
                {ordinati.map((p) => (
                  <li key={p.allievo_id}>
                    {p.foto_url
                      ? <img src={p.foto_url} alt="" className={p.tipo === 'prova' ? 'pal-faccia prova' : 'pal-faccia'} />
                      : <span className={p.tipo === 'prova' ? 'pal-faccia prova' : 'pal-faccia'}>{((p.nome?.[0] || '') + (p.cognome?.[0] || '')).toUpperCase()}</span>}
                    {gestione
                      ? <Link prefetch={false} href={`/gestione/persone/${p.allievo_id}`}>{p.cognome} {p.nome}</Link>
                      : <span>{p.cognome} {p.nome}</span>}
                    {TIPI[p.tipo] && <span className={`tag ${p.tipo === 'prova' ? 'tag-tenue' : 'tag-neutro'}`}>{TIPI[p.tipo]}</span>}
                  </li>
                ))}
              </ul>
            )}
          </li>
          {coda.length > 0 && (
            <li className="persona fl-iscritti">
              <button type="button" className="fl-espandi" aria-expanded={vediCoda} onClick={() => setVediCoda(!vediCoda)}>
                <span>In coda <span className="fl-freccia" aria-hidden="true">{vediCoda ? '▾' : '▸'}</span>
                  <span className="piccolo muto"> lezione piena: entrano se si libera un posto</span></span>
                <strong className="fl-coda-n">{coda.length}</strong>
              </button>
              {vediCoda && (
                <ol className="fl-persone fl-coda">
                  {coda.map((c) => (
                    <li key={c.allievo_id}>
                      <span className="pal-faccia">{((c.allievi?.nome?.[0] || '') + (c.allievi?.cognome?.[0] || '')).toUpperCase()}</span>
                      {gestione
                        ? <Link prefetch={false} href={`/gestione/persone/${c.allievo_id}`}>{c.allievi?.cognome} {c.allievi?.nome}</Link>
                        : <span>{c.allievi?.cognome} {c.allievi?.nome}</span>}
                      <span className={`tag ${c.stato === 'avvisato' ? 'tag-ok' : 'tag-attenzione'}`}>{c.stato === 'avvisato' ? 'avvisato' : 'in coda'}</span>
                    </li>
                  ))}
                </ol>
              )}
              {gestione && <p className="piccolo muto" style={{ margin: '0 6px 8px' }}>Per farne entrare uno: "Aggiungi qualcuno" (o alza i posti qui sotto). Tutte le code: Persone → Liste d'attesa.</p>}
            </li>
          )}
          {lezione.prove > 0 && <li className="persona"><span>In prova</span><strong>{lezione.prove}</strong></li>}
          {lezione.capienza > 0 && <li className="persona"><span>Posti liberi</span><strong>{Math.max(lezione.capienza - lezione.iscritti - lezione.prove, 0)}</strong></li>}
          {lezione.presenti > 0 && <li className="persona"><span>Presenti</span><strong>{lezione.presenti}</strong></li>}
        </ul>

        <Sostituzione lezioneId={lezione.lezione_id} gestione={gestione} onFatto={() => { onClose(); router.refresh(); }} />

        <div className="azioni" style={{ marginBottom: 14 }}>
          <Link prefetch={false} className="btn btn-primario" href={`/gestione/appello/${lezione.lezione_id}`}>Appello e prenotati</Link>
          {gestione && (
            <button className="btn" onClick={() => { setAggiungi(!aggiungi); if (!aggiungi) cerca(''); }}>
              Aggiungi qualcuno
            </button>
          )}
          <Link prefetch={false} className="btn" href={`/gestione/corsi/${lezione.corso_id}`}>Scheda del corso</Link>
        </div>

        {aggiungi && (
          <div className="scheda" style={{ marginBottom: 14 }}>
            <div className="campo" style={{ marginBottom: 8 }}>
              <label htmlFor="cerca-veloce">Chi aggiungi a questa lezione?</label>
              <input id="cerca-veloce" autoFocus value={testoCerca} placeholder="Cognome o nome"
                     onChange={(e) => { setTestoCerca(e.target.value); cerca(e.target.value); }} />
            </div>
            {candidati === null && <p className="piccolo muto">Cerco…</p>}
            {candidati?.length === 0 && <p className="piccolo muto">Nessuno da aggiungere.</p>}
            <ul className="elenco">
              {(candidati || []).slice(0, 8).map((c) => (
                <li key={c.allievo_id} className="persona">
                  <span>
                    {c.cognome} {c.nome}
                    <span className="piccolo muto" style={{ display: 'block' }}>
                      {c.abbonamento}{!c.certificato_ok && ' · certificato scaduto'}
                    </span>
                  </span>
                  <button className="link-btn piccolo" onClick={() => aggiungiPersona(c)}>Aggiungi</button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {gestione && (
          <>
            <label className="spunta">
              <input type="checkbox" checked={daOggi} onChange={(e) => setDaOggi(e.target.checked)} />
              <span>Posti, prenotazioni e annullamento qui sotto: valgono anche per le prossime lezioni di questo orario</span>
            </label>

            <div className="da-fare">
              <a href="#" onClick={(e) => { e.preventDefault(); setTavolozza(!tavolozza); }}>
                <span>Cambia colore del corso</span><span className="conta">›</span>
              </a>
              {tavolozza && (
                <div style={{ padding: '4px 2px 10px' }}>
                  <SceltaColore valore={colore} onChange={cambiaColore} applica="Usa questo colore" disabilitato={invio} />
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
                  if (m === null) return;
                  const rec = confirm('Chi era iscritto riceve in automatico un recupero.\n\nOK = sì, recupero automatico\nAnnulla = no, il recupero lo fissa la scuola');
                  azione('annulla', m, rec);
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
