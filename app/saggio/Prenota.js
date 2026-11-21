'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { euro } from '@/lib/formato';
import { quandoSpettacolo, oraSpettacolo, totaleBiglietti, quandoScade, testoExtra, MODIFICHE_SEGRETERIA } from '@/lib/biglietteria';
import Promemoria from '../biglietti/Promemoria';
import { stampaSolo } from '../biglietti/[token]/Azioni';

const OFFERTE = [0, 500, 1000, 2000];
// un colore per evento (barra laterale, titolo, riepilogo): si distinguono a colpo d'occhio
const COLORI = ['#e50914', '#1565c0', '#7b1fa2', '#ef6c00', '#00897b', '#c2185b', '#5d4037', '#3949ab'];
const coloreDi = (s) => COLORI[((s.ordine ?? s.indice ?? 1) - 1 + COLORI.length) % COLORI.length];
const dataBreve = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('it-IT', { day: 'numeric', month: 'numeric' }) : '');
const normale = (x) => `${x.nome} ${x.cognome}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]+/g, ' ').trim();

function Contatore({ id, valore, min = 0, max, onChange }) {
  return (
    <div className="bg-contatore">
      <button type="button" aria-label="Meno" disabled={valore <= min} onClick={() => onChange(Math.max(min, valore - 1))}>−</button>
      <output id={id} aria-live="polite">{valore}</output>
      <button type="button" aria-label="Più" disabled={max != null && valore >= max} onClick={() => onChange(max != null ? Math.min(max, valore + 1) : valore + 1)}>+</button>
    </div>
  );
}

const prezzoSpettacolo = (s) => {
  const parti = [];
  if (s.contributo_cent) parti.push(`contributo ${euro(s.contributo_cent)}${s.contributo_per_posto ? ' a persona' : ''}`);
  else parti.push('ingresso libero');
  (s.extra || []).filter((o) => o.aperta !== false).forEach((o) => parti.push(`${o.nome.toLowerCase()} ${euro(o.prezzo_cent)}${o.entro ? ` (entro il ${dataBreve(o.entro)})` : ''}`));
  return parti.join(' · ');
};

// fasi di un evento con allievi: prima posti riservati (N per allievo), dal giorno «liberi_dal» aperti a tutti
const giornoPrima = (d) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() - 1); return x.toLocaleDateString('it-IT', { day: 'numeric', month: 'numeric', timeZone: 'UTC' }); };
function testoFase(s) {
  if (s.fase === 'riservata') return { tipo: 'riservata', testo: `Posti riservati: ogni allievo/a ha ${s.posti_per_allievo} posti per il suo pubblico${s.liberi_dal ? ` fino al ${giornoPrima(s.liberi_dal)}. Dal ${dataBreve(s.liberi_dal)} i posti rimasti si aprono a tutti` : ''}.` };
  if (s.fase === 'libera') return { tipo: 'libera', testo: `Posti aperti a tutti fino a esaurimento, senza posti riservati${s.liberi_dal ? ` (i posti riservati agli allievi si sono chiusi il ${giornoPrima(s.liberi_dal)})` : ''}.` };
  return null;
}
function testoEsaurito(s) {
  return s.fase === 'libera' && s.liberi_dal
    ? `Il periodo di prenotazione dei posti riservati si è chiuso il ${giornoPrima(s.liberi_dal)} e i posti disponibili in sala sono esauriti. Prova a sentire la segreteria.`
    : 'I posti disponibili in sala sono esauriti. Prova a sentire la segreteria.';
}
const testoPostiSala = (s) => (s.posti_liberi == null ? '' : s.posti_liberi === 1 ? 'Ultimo posto disponibile in sala' : `Posti ancora disponibili in sala: ${s.posti_liberi}`);

// ------------------------------------------------------------------ un evento scelto: allievo, posti, extra, nominativi
// Resta montato anche quando lo si toglie (solo nascosto): riscegliendolo, i dati inseriti ci sono ancora.
function SceltaEvento({ s, visibile, dati, onChange, onTogli, onModifica }) {
  const opzioni = (s.extra || []).filter((o) => o.aperta !== false);
  const fase = testoFase(s);
  const blocchi = [...(s.con_allievi ? ['allievo'] : []), 'posti', ...(opzioni.length ? ['extra'] : []), 'nomi'];
  const [livello, setLivello] = useState(0);         // fin dove si è arrivati (i blocchi si aprono uno sotto l'altro)
  const [chiuso, setChiuso] = useState(false);       // finito: si vede solo il riassunto
  const [avviso, setAvviso] = useState('');
  const [gruppi, setGruppi] = useState(null);
  const [gruppo, setGruppo] = useState('');
  const [elenco, setElenco] = useState(null);
  const [allievoId, setAllievoId] = useState('');
  const [nascita, setNascita] = useState('');
  const [allievo, setAllievo] = useState(null);
  const [verifica, setVerifica] = useState({ invio: false, errore: '' });
  const [posti, setPosti] = useState(1);
  const [extra, setExtra] = useState({});             // id opzione → quantità
  const [zeroOk, setZeroOk] = useState({});           // opzioni lasciate a 0 di proposito (confermate)
  const [segnaZero, setSegnaZero] = useState(false);  // dopo «Continua»: le opzioni a 0 non confermate diventano rosse
  const [offerta, setOfferta] = useState(0);
  const [altra, setAltra] = useState('');
  const [persone, setPersone] = useState([{ nome: '', cognome: '' }]);
  const ultimo = useRef('');
  const perNome = s.scelta_allievo === 'nome';         // l'allievo si cerca scrivendo il nome (query 177)
  const [testo, setTesto] = useState('');
  const [trovati, setTrovati] = useState(null);
  useEffect(() => {
    if (!perNome) return undefined;
    const q = testo.trim();
    if (q.length < 2) { setTrovati(null); return undefined; }
    const chiave = `${s.id}|q|${q}`; ultimo.current = chiave;
    const t = setTimeout(() => {
      fetch(`/api/biglietteria/elenco?s=${s.id}&q=${encodeURIComponent(q)}`).then((r) => (r.ok ? r.json() : []))
        .then((d) => { if (ultimo.current === chiave) setTrovati(d); }).catch(() => setTrovati([]));
    }, 250);
    return () => clearTimeout(t);
  }, [testo, perNome, s.id]);

  useEffect(() => {
    if (!s.con_allievi || s.scelta_allievo === 'nome') return;
    fetch(`/api/biglietteria/elenco?s=${s.id}`).then((r) => (r.ok ? r.json() : [])).then(setGruppi).catch(() => setGruppi([]));
  }, [s.id, s.con_allievi]);
  useEffect(() => {
    setElenco(null); setAllievoId(''); setAllievo(null); setNascita(''); setVerifica({ invio: false, errore: '' });
    if (!s.con_allievi || !gruppo) return;
    const chiave = `${s.id}|${gruppo}`; ultimo.current = chiave;
    fetch(`/api/biglietteria/elenco?s=${s.id}&g=${encodeURIComponent(gruppo)}`).then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (ultimo.current === chiave) setElenco(d); }).catch(() => setElenco([]));
  }, [gruppo]); // eslint-disable-line react-hooks/exhaustive-deps

  const chiedi = s.chiedi_nascita !== false;
  async function conferma(id = allievoId) {
    if (!id || (chiedi && !/^\d{4}-\d{2}-\d{2}$/.test(nascita))) { setVerifica({ invio: false, errore: 'Scegli l\'allievo/a e scrivi la sua data di nascita.' }); return; }
    setVerifica({ invio: true, errore: '' });
    const r = await fetch('/api/biglietteria/verifica', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allievo_id: id, nascita: chiedi ? nascita : null }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok || !d.ok) {
      const scelto = (elenco || trovati || []).find((a) => a.id === id);
      const doppio = scelto && /\(\d+\)$/.test(scelto.cognome || '');
      setVerifica({ invio: false, errore: (d.errore || 'Controllo non riuscito. Riprova.') + (doppio && r?.status === 409 ? ' Nel gruppo ci sono due allievi con lo stesso nome: prova a scegliere l\'altro.' : '') });
      return;
    }
    setVerifica({ invio: false, errore: '' }); setAllievo({ id, ...d }); setPosti(1);
  }

  const maxPosti = useMemo(() => {
    let m = s.max_per_prenotazione || 10;
    if (s.limite_allievo) m = Math.min(m, allievo?.rimasti ?? 0);
    if (s.posti_liberi != null) m = Math.min(m, s.posti_liberi);
    return m;
  }, [s, allievo]);
  useEffect(() => { if (posti > Math.max(maxPosti, 1)) setPosti(Math.max(maxPosti, 1)); }, [maxPosti]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPersone((v) => Array.from({ length: posti }, (_, k) => v[k] || { nome: '', cognome: '' })); }, [posti]);
  const setPersona = (k, campo) => (e) => setPersone((v) => v.map((x, i) => (i === k ? { ...x, [campo]: e.target.value } : x)));

  const offertaCent = altra !== '' ? Math.max(0, Math.round(Number(altra.replace(',', '.')) * 100) || 0) : offerta;
  const senzaContributo = !!allievo?.contributo_gia;
  const totale = totaleBiglietti(s, { posti, extra, offerta: offertaCent, senzaContributo });
  const scelteExtra = opzioni.map((o) => ({ id: o.id, nome: o.nome, quantita: extra[o.id] || 0, prezzo_cent: o.prezzo_cent }));
  const zeroDaConfermare = opzioni.filter((o) => !(extra[o.id] > 0) && !zeroOk[o.id]);
  const pizze = scelteExtra.reduce((n, o) => n + o.quantita, 0);
  const ripetuto = persone.find((x, k) => normale(x) && persone.findIndex((y) => normale(y) === normale(x)) !== k);
  const mancaBlocco = {
    allievo: s.limite_allievo && allievo && allievo.rimasti < 1 ? `Attenzione: tutti i posti disponibili per ${allievo.nome} sono già stati usati.`
      : s.limite_allievo && !allievo ? (chiedi ? 'Scegli gruppo e allievo/a e conferma con la data di nascita.' : 'Scegli gruppo e allievo/a.')
      : allievoId && !allievo ? (chiedi ? 'Conferma l\'allievo/a con la data di nascita (o togli la scelta).' : 'Attendi il controllo dell\'allievo/a.') : '',
    posti: maxPosti < 1 ? (s.posti_liberi === 0 ? testoEsaurito(s) : 'Non ci sono più posti disponibili.') : '',
    extra: zeroDaConfermare.length ? `Hai lasciato a 0: ${zeroDaConfermare.map((o) => o.nome).join(', ')}. Se non le vuoi conferma qui sopra, altrimenti scegli quante.` : '',
    nomi: persone.some((x) => !x.nome.trim() || !x.cognome.trim()) ? 'Scrivi nome e cognome di ogni persona.'
      : ripetuto ? `Hai scritto due volte ${ripetuto.nome.trim()} ${ripetuto.cognome.trim()}.` : '',
  };
  const manca = blocchi.map((k) => mancaBlocco[k]).find(Boolean) || '';
  function continua() {
    const m = mancaBlocco[blocchi[livello]];
    if (blocchi[livello] === 'extra' && m) setSegnaZero(true);
    if (blocchi[livello] === 'allievo' && s.limite_allievo && allievo && allievo.rimasti < 1) return; // c'è già l'avviso rosso
    if (m) { setAvviso(m); return; }
    setAvviso('');
    if (livello < blocchi.length - 1) setLivello(livello + 1); else setChiuso(true);
  }
  useEffect(() => { if (avviso && !mancaBlocco[blocchi[livello]]) setAvviso(''); }); // eslint-disable-line react-hooks/exhaustive-deps
  const vedi = (k) => blocchi.indexOf(k) <= livello;

  // al genitore: quello che serve per riepilogo e invio
  useEffect(() => {
    onChange(s.id, { manca, fatto: chiuso && !manca, totale, posti, pizze, extra: scelteExtra.filter((o) => o.quantita > 0), offerta_cent: s.offerta_libera ? offertaCent : 0,
      allievo_id: allievo?.id || null, nascita: allievo && chiedi ? nascita : null, allievo_nome: allievo?.nome || null,
      partecipanti: persone, contributo_cent: (s.contributo_cent || 0) * (s.contributo_per_posto ? posti : 1) });
  }, [manca, chiuso, totale, posti, extra, offertaCent, allievo, nascita, persone]); // eslint-disable-line react-hooks/exhaustive-deps

  const primo = dati?.prenotante;
  if (chiuso) {
    return (
      <section className="bg-evento-scelto bg-evento-chiuso" hidden={!visibile} aria-label={s.titolo} style={{ '--colore-evento': coloreDi(s) }}>
        <div className="bg-evento-titolo"><strong><span className="bg-ok" aria-hidden="true">✓ </span>{s.titolo}</strong><span className="piccolo">{quandoSpettacolo(s.inizio)}</span></div>
        <p className="bg-evento-sintesi">
          {posti} {posti === 1 ? 'posto' : 'posti'}{allievo ? ` · per ${allievo.nome}` : ''}{pizze ? ` · ${testoExtra(scelteExtra)}` : ''}
          {s.offerta_libera && offertaCent ? ` · offerta ${euro(offertaCent)}` : ''} · <strong>{totale ? euro(totale) : 'gratis'}</strong>
          <br /><span className="piccolo muto">{persone.map((x) => `${x.nome.trim()} ${x.cognome.trim()}`).join(', ')}</span>
        </p>
        <div className="azioni">
          <button type="button" className="link-btn piccolo" onClick={() => { setChiuso(false); onModifica?.(); }}>modifica</button>
          <button type="button" className="link-btn piccolo pericolo" onClick={() => onTogli?.(s.id)}>togli questo evento</button>
        </div>
      </section>
    );
  }
  const bottone = (k) => blocchi[livello] === k && (
    <div className="bg-continua">
      {avviso && <div className="errore" role="alert">{avviso}</div>}
      <button type="button" className="btn btn-primario" onClick={continua}>{livello < blocchi.length - 1 ? 'Continua' : 'Fatto, continua'}</button>
    </div>
  );
  return (
    <section className="bg-evento-scelto" hidden={!visibile} aria-label={s.titolo} style={{ '--colore-evento': coloreDi(s) }}>
      <div className="bg-evento-titolo"><strong>{s.titolo}</strong><span className="piccolo">{quandoSpettacolo(s.inizio)}</span>
        <button type="button" className="link-btn piccolo pericolo bg-evento-togli" onClick={() => onTogli?.(s.id)}>togli</button></div>
      {s.descrizione && <p className="bg-evento-descr">{s.descrizione}</p>}
      {fase && <p className={`bg-fase bg-fase-${fase.tipo}`}>{fase.testo}{testoPostiSala(s) ? <><br /><strong>{testoPostiSala(s)}</strong></> : null}</p>}
      {!fase && testoPostiSala(s) && <p className="bg-fase"><strong>{testoPostiSala(s)}</strong></p>}

      {s.con_allievi && vedi('allievo') && (
        <div className="bg-blocco">
          <h3 className="bg-sotto">Chi vieni a vedere?{!s.limite_allievo && <span className="muto piccolo"> (facoltativo)</span>}</h3>
          {s.limite_allievo && chiedi && <p className="piccolo muto">Per prenotare i suoi posti conferma con la data di nascita dell&apos;allievo/a.</p>}
          {!s.limite_allievo && <p className="piccolo muto">Se vieni per un allievo/a sceglilo: i posti si aggiungono a quelli già prenotati per lui/lei.</p>}
          {allievo ? (
            <div className="bg-allievo-scelto">
              <span>Vieni a vedere <strong>{allievo.nome}</strong>{allievo.gruppo ? ` · ${allievo.gruppo}` : ''} ✓
                {s.limite_allievo && allievo.rimasti > 0 && <span className="piccolo muto"> · {allievo.rimasti === 1 ? '1 posto disponibile' : `${allievo.rimasti} posti disponibili`}</span>}</span>
              <button type="button" className="link-btn piccolo" onClick={() => { setAllievo(null); setAllievoId(''); setNascita(''); }}>cambia</button>
            </div>
          ) : (
            <div className="bg-scelta-allievo">
              {perNome ? (
                <div className="campo bg-cerca-allievo">
                  <label htmlFor={`bg-cerca-${s.id}`}>Allievo/a: scrivi nome e cognome (o cognome e nome)</label>
                  {allievoId ? (
                    <div className="bg-allievo-trovato">
                      <span><strong>{(trovati || []).find((a) => a.id === allievoId)?.nome} {(trovati || []).find((a) => a.id === allievoId)?.cognome}</strong>
                        {' · '}{(trovati || []).find((a) => a.id === allievoId)?.gruppo}</span>
                      <button type="button" className="link-btn piccolo" onClick={() => { setAllievoId(''); setNascita(''); setVerifica({ invio: false, errore: '' }); }}>cambia</button>
                    </div>
                  ) : (
                    <>
                      <input id={`bg-cerca-${s.id}`} className="bg-input" value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="es. Sofia Rossi" autoComplete="off" />
                      {testo.trim().length >= 2 && (
                        <ul className="bg-trovati" role="listbox" aria-label="Allievi trovati">
                          {trovati == null ? <li className="piccolo muto">cerco…</li>
                            : trovati.length === 0 ? <li className="piccolo muto">Nessun allievo/a con questo nome. Controlla come l&apos;hai scritto.</li>
                              : trovati.map((a) => (
                                <li key={a.id}><button type="button" role="option" aria-selected="false" onClick={() => {
                                  setAllievoId(a.id); setVerifica({ invio: false, errore: '' }); if (!chiedi) conferma(a.id);
                                }}><strong>{a.nome} {a.cognome}</strong><span className="piccolo muto"> · {a.gruppo}</span></button></li>
                              ))}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              ) : <>
              <div className="campo">
                <label htmlFor={`bg-gruppo-${s.id}`}>Gruppo</label>
                <select id={`bg-gruppo-${s.id}`} value={gruppo} onChange={(e) => setGruppo(e.target.value)} disabled={!gruppi}>
                  <option value="">{gruppi ? (gruppi.length ? '— scegli il gruppo —' : 'nessun gruppo in elenco') : 'carico…'}</option>
                  {(gruppi || []).map((g) => <option key={g.gruppo} value={g.gruppo}>{g.gruppo}</option>)}
                </select>
              </div>
              {gruppo && (
                <div className="campo">
                  <label htmlFor={`bg-allievo-${s.id}`}>Allievo/a</label>
                  <select id={`bg-allievo-${s.id}`} value={allievoId} onChange={(e) => { const id = e.target.value; setAllievoId(id); setVerifica({ invio: false, errore: '' }); if (id && !chiedi) conferma(id); }} disabled={!elenco}>
                    <option value="">{elenco ? '— scegli —' : 'carico…'}</option>
                    {(elenco || []).map((a) => <option key={a.id} value={a.id}>{a.nome} {a.cognome}</option>)}
                  </select>
                </div>
              )}
              </>}
              {allievoId && !chiedi && verifica.invio && <p className="piccolo muto">Un attimo…</p>}
              {allievoId && chiedi && (
                <div className="campo">
                  <label htmlFor={`bg-nascita-${s.id}`}>Data di nascita dell&apos;allievo/a (per confermare che sei un parente)</label>
                  <div className="bg-conferma">
                    <input id={`bg-nascita-${s.id}`} type="date" value={nascita} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setNascita(e.target.value)} />
                    <button type="button" className="btn btn-primario" disabled={verifica.invio || !nascita} onClick={() => conferma()}>{verifica.invio ? 'Controllo…' : 'Conferma'}</button>
                  </div>
                </div>
              )}
              {verifica.errore && <div className="errore" role="alert">{verifica.errore}</div>}
            </div>
          )}
          {allievo && s.limite_allievo && allievo.rimasti < 1 && (
            <div className="bg-avviso-rosso" role="alert">Attenzione: tutti i posti disponibili per <strong>{allievo.nome}</strong> sono già stati usati
              ({allievo.gia_prenotati} su {s.posti_per_allievo}).{s.liberi_dal ? ` Dal ${dataBreve(s.liberi_dal)} potrai prenotare altri posti, se in sala ne restano.` : ''}</div>
          )}
          {allievo && s.limite_allievo && allievo.rimasti > 0 && allievo.gia_prenotati > 0 && (
            <p className="bg-avviso-info">Per {allievo.nome} sono già prenotati {allievo.gia_prenotati} {allievo.gia_prenotati === 1 ? 'posto' : 'posti'}: ne {allievo.rimasti === 1 ? 'resta 1' : `restano ${allievo.rimasti}`}.
              {allievo.contributo_gia ? ` Il contributo di ${euro(s.contributo_cent)} è già stato conteggiato nella prima prenotazione: non lo paghi di nuovo.` : ''}</p>
          )}
          {allievo && !s.limite_allievo && allievo.gia_prenotati > 0 && (
            <p className="bg-avviso-info">Per {allievo.nome} ci sono già {allievo.gia_prenotati} {allievo.gia_prenotati === 1 ? 'posto prenotato' : 'posti prenotati'}: quelli che scegli ora si aggiungono.
              {allievo.contributo_gia ? ` Il contributo di ${euro(s.contributo_cent)} è già stato conteggiato nella prima prenotazione: paghi solo quello che aggiungi ora.` : ''}</p>
          )}
          {bottone('allievo')}
        </div>
      )}

      {vedi('posti') && <div className="bg-blocco">
        <h3 className="bg-sotto">Quanti siete?</h3>
        <div className="bg-righe">
          <div className="bg-riga"><label htmlFor={`bg-posti-${s.id}`}>Posti</label>
            <Contatore id={`bg-posti-${s.id}`} valore={posti} min={1} max={Math.max(maxPosti, 1)} onChange={setPosti} /></div>
          {s.offerta_libera && (
            <div className="bg-riga bg-offerta"><span>Contribuisci alla nostra raccolta fondi <span className="piccolo muto">(facoltativo)</span></span>
              <div className="bg-chips">
                {OFFERTE.map((o) => (
                  <button key={o} type="button" aria-pressed={altra === '' && offerta === o} onClick={() => { setOfferta(o); setAltra(''); }}>{o ? euro(o) : 'No'}</button>
                ))}
                <input aria-label="Altro importo in euro" inputMode="decimal" placeholder="altro €" value={altra} onChange={(e) => setAltra(e.target.value.replace(/[^0-9.,]/g, ''))} />
              </div>
            </div>
          )}
          {!s.offerta_libera && s.frase_offerta && <p className="bg-frase-offerta">{s.frase_offerta}</p>}
        </div>
        {bottone('posti')}
      </div>}

      {opzioni.length > 0 && vedi('extra') && (
        <div className="bg-blocco">
          <h3 className="bg-sotto">Vuoi aggiungere qualcosa?</h3>
          <p className="piccolo muto">Scegli quante ne vuoi per ogni voce. Se non ti interessa lasciala a 0 e conferma.</p>
          <div className="bg-extra">
            {opzioni.map((o) => {
              const q = extra[o.id] || 0;
              const rosso = segnaZero && !q && !zeroOk[o.id];
              return (
                <div key={o.id} className={`bg-extra-voce${q ? ' scelta' : ''}${rosso ? ' da-confermare' : ''}`}>
                  <div className="bg-extra-testo">
                    <strong className="bg-extra-nome">{o.nome}</strong>
                    <span className="bg-extra-prezzo">{euro(o.prezzo_cent)} l&apos;una</span>
                    {o.descrizione && <span className="bg-extra-descr">{o.descrizione}</span>}
                    {o.entro && <span className="piccolo muto">si ordina entro il {dataBreve(o.entro)}</span>}
                  </div>
                  <Contatore id={`bg-extra-${s.id}-${o.id}`} valore={q} max={30}
                             onChange={(v) => { setExtra((x) => ({ ...x, [o.id]: v })); if (v > 0) setZeroOk((z) => ({ ...z, [o.id]: false })); }} />
                  {rosso && (
                    <div className="bg-extra-zero" role="alert">
                      <span>Hai lasciato 0 {o.nome.toLowerCase()}: è giusto?</span>
                      <button type="button" className="btn btn-piccolo" onClick={() => setZeroOk((z) => ({ ...z, [o.id]: true }))}>Sì, non la voglio</button>
                    </div>
                  )}
                  {!q && zeroOk[o.id] && <span className="piccolo muto bg-extra-ok">✓ nessuna, confermato</span>}
                </div>
              );
            })}
          </div>
          {bottone('extra')}
        </div>
      )}

      {vedi('nomi') && <div className="bg-blocco">
        <h3 className="bg-sotto">Chi viene? <span className="muto piccolo">(un nome per biglietto)</span></h3>
        <div className="bg-persone">
          {persone.map((x, k) => (
            <div key={k} className="bg-persona">
              <span className="bg-num">{k + 1}</span>
              <input className="bg-input" aria-label={`${s.titolo}: nome persona ${k + 1}`} placeholder="Nome" value={x.nome} onChange={setPersona(k, 'nome')} autoComplete="off" />
              <input className="bg-input" aria-label={`${s.titolo}: cognome persona ${k + 1}`} placeholder="Cognome" value={x.cognome} onChange={setPersona(k, 'cognome')} autoComplete="off" />
              {k === 0 && !x.nome && !x.cognome && (primo?.nome || primo?.cognome) && (
                <button type="button" className="link-btn piccolo" onClick={() => setPersone((v) => v.map((y, i) => (i === 0 ? { nome: primo.nome, cognome: primo.cognome } : y)))}>sono io</button>
              )}
            </div>
          ))}
        </div>
        {ripetuto && !avviso && <div className="errore" role="alert">Hai scritto due volte {ripetuto.nome.trim()} {ripetuto.cognome.trim()}.</div>}
        {bottone('nomi')}
      </div>}
    </section>
  );
}

// ------------------------------------------------------------------ la pagina: un passo alla volta, un solo pagamento
// 1) scegli un evento → i suoi passi si aprono uno sotto l'altro con "Continua"; 2) "Vuoi prenotare anche un altro evento?"
// (si vedono solo quelli che mancano); 3) i tuoi dati; 4) riepilogo e conferma (qui si salva); 5) promemoria e pagamento.
export default function Prenota({ b, carta }) {
  const unico = b.spettacoli.length === 1 && !b.spettacoli[0].chiuso ? [b.spettacoli[0].id] : [];
  const [elenco, setElenco] = useState(unico);            // eventi nella prenotazione, in ordine di scelta
  const [aperti, setAperti] = useState(unico);            // eventi toccati (restano montati: togliendoli e rimettendoli i dati restano)
  const [scegli, setScegli] = useState(!unico.length);    // si vede la scelta dell'evento
  const [fase, setFase] = useState('eventi');             // eventi → dati → riepilogo
  const [righe, setRighe] = useState({});
  const [dati, setDati] = useState({ nome: '', cognome: '', email: '', telefono: '' });
  const [privacy, setPrivacy] = useState(false);
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState('');
  const [fatto, setFatto] = useState(null);
  const perId = Object.fromEntries(b.spettacoli.map((s, k) => [s.id, Object.assign(s, { indice: k + 1 })]));
  const scelti = elenco.map((id) => perId[id]).filter(Boolean);
  const disponibili = b.spettacoli.filter((x) => !elenco.includes(x.id) && !x.chiuso && x.posti_liberi !== 0);
  const tuttiFatti = scelti.length > 0 && scelti.every((x) => righe[x.id]?.fatto);
  const conclusi = scelti.filter((x) => righe[x.id]?.fatto);
  const totale = conclusi.reduce((n, x) => n + (righe[x.id]?.totale || 0), 0);
  const gratuiti = conclusi.filter((x) => !righe[x.id]?.totale);
  const giu = (sel) => setTimeout(() => { try { document.querySelector(sel)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch { /* niente */ } }, 60);

  function aggiungi(id) {
    setErrore(''); setScegli(false); setFase('eventi');
    setElenco((v) => [...v, id]); setAperti((v) => (v.includes(id) ? v : [...v, id]));
    giu(`[data-evento="${id}"]`);
  }
  function togli(id) { setElenco((v) => v.filter((x) => x !== id)); setFase('eventi'); if (elenco.length <= 1) setScegli(true); }
  const aggiorna = (id, d) => setRighe((v) => ({ ...v, [id]: d }));

  // la scadenza del pagamento: X giorni lavorativi (dal server), mai dopo l'inizio del primo evento scelto
  const primoInizio = scelti.map((x) => new Date(x.inizio)).sort((x, y) => x - y)[0];
  const scadenza = b.scadenza_pagamento ? new Date(Math.min(new Date(b.scadenza_pagamento), primoInizio || Infinity)) : null;

  const mancaDati = !dati.nome.trim() || !dati.cognome.trim() ? 'Scrivi il tuo nome e cognome.'
    : !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(dati.email.trim()) ? 'Scrivi la tua email: lì arrivano promemoria e biglietti.'
      : !privacy ? 'Serve il consenso al trattamento dei dati.' : '';

  async function invia(conCarta) {
    const m = scelti.map((x) => (righe[x.id]?.manca ? `${x.titolo}: ${righe[x.id].manca}` : '')).find(Boolean) || mancaDati;
    if (m) { setErrore(m); return; }
    setInvio(true); setErrore('');
    const r = await fetch('/api/biglietteria/prenota', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...dati, privacy, carta: conCarta, righe: scelti.map((x) => {
        const y = righe[x.id] || {};
        return { spettacolo_id: x.id, allievo_id: y.allievo_id, nascita: y.nascita, posti: y.posti, extra: (y.extra || []).map((o) => ({ id: o.id, quantita: o.quantita })), offerta_cent: y.offerta_cent, partecipanti: y.partecipanti };
      }) }),
    }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) { setInvio(false); setErrore(d.errore || 'Prenotazione non riuscita. Controlla la connessione e riprova.'); return; }
    if (d.url) { window.location.href = d.url; return; }
    setInvio(false);
    setFatto({ ...d, email: dati.email.trim(), eventi: scelti.map((x) => ({ spettacolo: x.titolo, inizio: x.inizio, posti: righe[x.id].posti,
      pizze: righe[x.id].pizze, extra_testo: testoExtra(righe[x.id].extra), allievo: righe[x.id].allievo_nome, totale_cent: righe[x.id].totale })) });
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch { /* niente */ }
  }

  if (fatto) {
    // messaggio scritto dalla segreteria (Email e biglietto), con {nome} e {codice}
    const personale = (t) => t.replaceAll('{nome}', dati.nome.trim()).replaceAll('{codice}', fatto.codice || '');
    if (fatto.stato === 'gratis') {
      return (
        <section className="scheda bg-fatto" role="status">
          <h2>Prenotato ✓</h2>
          {b.testo_conferma && <p className="bg-messaggio-conferma">{personale(b.testo_conferma)}</p>}
          <p>Ti abbiamo mandato i biglietti a <strong>{fatto.email}</strong>: uno per persona, con il codice QR da mostrare all&apos;ingresso.</p>
          <Link href={`/biglietti/${fatto.token}`} className="btn btn-primario btn-pieno btn-grande">Apri i biglietti</Link>
          <p className="piccolo">{MODIFICHE_SEGRETERIA}</p>
        </section>
      );
    }
    return (
      <section className="bg-fatto bg-fatto-largo" role="status">
        <div className="bg-non-stampa">
          <h2>Prenotazione salvata ✓ Ora il pagamento</h2>
          {b.testo_conferma && <p className="bg-messaggio-conferma">{personale(b.testo_conferma)}</p>}
          {fatto.scade_at ? <p>I posti sono tenuti per te fino a <strong>{quandoScade(fatto.scade_at)}</strong>. Se il pagamento non arriva entro
            quel momento la prenotazione scade e i posti tornano liberi.</p>
            : <p>I posti sono tenuti per te: la prenotazione è confermata quando la segreteria vede il pagamento.</p>}
          {fatto.gratuiti > 0 && <p><strong>{fatto.gratuiti === 1 ? 'L\'evento gratuito è già confermato' : 'Gli eventi gratuiti sono già confermati'}</strong>: i biglietti ti arrivano subito per email.</p>}
        </div>
        <Promemoria p={{ ...fatto, nome: dati.nome.trim(), cognome: dati.cognome.trim(), evento: b.titolo, link_pagamento: b.link_pagamento,
          istruzioni_pagamento: b.istruzioni_pagamento, paga_in_segreteria: b.paga_in_segreteria, giorni_per_pagare: b.giorni_per_pagare }} />
        <div className="bg-non-stampa bg-passi-pagamento">
          <button type="button" className="btn btn-pieno btn-grande" onClick={() => stampaSolo(true)}>1 · Scarica o stampa il promemoria</button>
          {b.link_pagamento && (
            <a href={b.link_pagamento} target="_blank" rel="noopener noreferrer" className="btn btn-primario btn-pieno btn-grande">2 · Vai al pagamento ({euro(fatto.totale_cent)})</a>
          )}
          {carta && <button type="button" className="btn btn-pieno" onClick={async () => {
            const r = await fetch('/api/biglietteria/paga', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: fatto.token }) });
            const d = await r.json().catch(() => ({})); if (d.url) window.location.href = d.url; else setErrore(d.errore || 'Pagamento con carta non disponibile.');
          }}>Oppure paga con carta</button>}
          <p className="piccolo">Il promemoria ti arriva anche per email a <strong>{fatto.email}</strong>. Sul telefono «Scarica» apre la stampa: scegli «Salva come PDF».</p>
          <p className="piccolo"><strong>{MODIFICHE_SEGRETERIA}</strong></p>
          <Link href={`/biglietti/${fatto.token}`} className="piccolo">Controlla qui lo stato della prenotazione</Link>
          {errore && <div className="errore" role="alert">{errore}</div>}
        </div>
      </section>
    );
  }

  return (
    <div className="bg-prenota">
      <div className="bg-layout">
        <div className="bg-passi">
          <h2 className="bg-passo">1 · {scelti.length ? 'I tuoi eventi' : 'A quale evento vieni?'}</h2>
          {aperti.map((id) => perId[id] && (
            <div key={id} data-evento={id} hidden={!elenco.includes(id)}>
              <SceltaEvento s={perId[id]} visibile={elenco.includes(id)} dati={{ prenotante: dati }} onChange={aggiorna}
                            onTogli={togli} onModifica={() => setFase('eventi')} />
            </div>
          ))}

          {scegli && (
            <div className="bg-blocco-scelta">
              {scelti.length > 0 && <p className="bg-sotto">Scegli l&apos;evento da aggiungere</p>}
              <div className="bg-spettacoli" role="group" aria-label="Eventi">
                {b.spettacoli.filter((x) => !elenco.includes(x.id)).map((x) => {
                  const pieno = x.posti_liberi === 0;
                  return (
                    <button key={x.id} type="button" disabled={x.chiuso || pieno} className="bg-spettacolo bg-spettacolo-colore" style={{ '--colore-evento': coloreDi(x) }} onClick={() => aggiungi(x.id)}>
                      <strong>{x.titolo}</strong>
                      <span>{quandoSpettacolo(x.inizio)}</span>
                      {x.descrizione && <span className="bg-spettacolo-descr">{x.descrizione}</span>}
                      <span className="piccolo">{prezzoSpettacolo(x)}</span>
                      {!x.chiuso && !pieno && x.fase === 'libera' && <span className="bg-fase-chip bg-fase-libera">Posti aperti a tutti fino a esaurimento</span>}
                      {!x.chiuso && !pieno && x.fase === 'riservata' && <span className="bg-fase-chip bg-fase-riservata">Posti riservati agli allievi{x.liberi_dal ? ` fino al ${giornoPrima(x.liberi_dal)}` : ''}</span>}
                      {!x.chiuso && !pieno && testoPostiSala(x) && <span className={`piccolo${x.posti_liberi <= 20 ? ' bg-pochi' : ''}`}>{testoPostiSala(x)}</span>}
                      {x.chiuso ? <span className="tag tag-neutro">chiuso</span> : pieno ? <span className="bg-esaurito">{testoEsaurito(x)}</span> : null}
                    </button>
                  );
                })}
              </div>
              {scelti.length > 0 && <button type="button" className="link-btn piccolo" onClick={() => setScegli(false)}>non aggiungo altro</button>}
            </div>
          )}

          {tuttiFatti && !scegli && fase === 'eventi' && (
            <div className="bg-domanda">
              {disponibili.length > 0 ? (
                <>
                  <p><strong>Vuoi prenotare anche {disponibili.length === 1 ? `«${disponibili[0].titolo}»` : 'un altro evento'}?</strong></p>
                  <div className="azioni">
                    <button type="button" className="btn" onClick={() => setScegli(true)}>Sì, aggiungi</button>
                    <button type="button" className="btn btn-primario" onClick={() => { setFase('dati'); giu('#bg-tuoi-dati'); }}>No, continua</button>
                  </div>
                </>
              ) : <button type="button" className="btn btn-primario" onClick={() => { setFase('dati'); giu('#bg-tuoi-dati'); }}>Continua</button>}
            </div>
          )}

          {tuttiFatti && fase !== 'eventi' && (
            <>
              <h2 className="bg-passo" id="bg-tuoi-dati">2 · I tuoi dati</h2>
              <div className="bg-dati">
                <div className="campo"><label htmlFor="bg-nome">Nome</label><input id="bg-nome" value={dati.nome} onChange={(e) => setDati({ ...dati, nome: e.target.value })} autoComplete="given-name" /></div>
                <div className="campo"><label htmlFor="bg-cognome">Cognome</label><input id="bg-cognome" value={dati.cognome} onChange={(e) => setDati({ ...dati, cognome: e.target.value })} autoComplete="family-name" /></div>
                <div className="campo"><label htmlFor="bg-email">Email (qui arrivano promemoria e biglietti)</label><input id="bg-email" type="email" value={dati.email} onChange={(e) => setDati({ ...dati, email: e.target.value })} autoComplete="email" /></div>
                <div className="campo"><label htmlFor="bg-tel">Telefono <span className="muto">(facoltativo)</span></label><input id="bg-tel" type="tel" value={dati.telefono} onChange={(e) => setDati({ ...dati, telefono: e.target.value })} autoComplete="tel" /></div>
              </div>
              <label className="spunta"><input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} />
                <span>Ho letto l&apos;<Link href="/privacy" target="_blank">informativa privacy</Link> e acconsento al trattamento dei dati per la prenotazione.</span></label>
              {fase === 'dati' && (
                <div className="bg-continua">
                  {errore && <div className="errore" role="alert">{errore}</div>}
                  <button type="button" className="btn btn-primario" onClick={() => { if (mancaDati) { setErrore(mancaDati); return; } setErrore(''); setFase('riepilogo'); giu('#bg-riepilogo-finale'); }}>Continua</button>
                </div>
              )}
            </>
          )}

          {tuttiFatti && fase === 'riepilogo' && (
            <section className="bg-riepilogo-finale" id="bg-riepilogo-finale" aria-label="Riepilogo">
              <h2 className="bg-passo">3 · Riepilogo</h2>
              <div className="isc-totale bg-totale">
                {scelti.map((x) => <RigaRiepilogo key={x.id} s={x} r={righe[x.id]} />)}
                <div className="somma"><strong>Totale</strong><strong>{totale ? euro(totale) : 'gratis'}</strong></div>
              </div>
              <p className="piccolo">A nome di <strong>{dati.nome.trim()} {dati.cognome.trim()}</strong> · {dati.email.trim()}</p>
              {totale > 0 ? (
                <p className="bg-nota">Confermando <strong>salvi la prenotazione</strong> e i posti restano tenuti per te.
                  {b.scadenza_attiva !== false ? <> Va pagata entro <strong>{scadenza ? quandoScade(scadenza) : `${b.giorni_per_pagare} giorni lavorativi`}</strong>{b.link_pagamento ? ' con il link che trovi nel passo successivo' : ''}:
                    dopo, la prenotazione scade e i posti tornano liberi.{b.paga_in_segreteria ? ' Puoi anche passare in segreteria a saldare entro la stessa data.' : ''}</>
                    : <> Va pagata{b.link_pagamento ? ' con il link che trovi nel passo successivo' : ''}{b.paga_in_segreteria ? ' oppure in segreteria' : ''}.</>}
                  {gratuiti.length > 0 && <> {gratuiti.length === 1 ? `«${gratuiti[0].titolo}» è gratuito ed è confermato subito` : 'Gli eventi gratuiti sono confermati subito'}: i loro biglietti ti arrivano subito per email.</>}
                  {' '}Ti mostriamo subito il <strong>promemoria di pagamento</strong> (importo, causale, link) da scaricare, e te lo mandiamo anche per email.</p>
              ) : <p className="bg-nota">Confermando ti mandiamo subito i biglietti per email.</p>}
              {errore && <div className="errore" role="alert">{errore}</div>}
              <div className="bg-bottoni">
                <button type="button" className="btn btn-primario btn-pieno btn-grande" disabled={invio} onClick={() => invia(false)}>
                  {invio ? 'Un attimo…' : 'Confermi la prenotazione?  Sì, conferma'}</button>
                {totale > 0 && carta && <button type="button" className="btn btn-pieno" disabled={invio} onClick={() => invia(true)}>Conferma e paga subito con carta</button>}
              </div>
            </section>
          )}
        </div>

        <aside className="bg-riepilogo" aria-label="La tua prenotazione">
          <div className="isc-totale bg-totale">
            {!scelti.length && <p className="piccolo muto">Scegli un evento per iniziare.</p>}
            {scelti.map((x) => <RigaRiepilogo key={x.id} s={x} r={righe[x.id]} />)}
            {conclusi.length > 0 && <div className="somma"><strong>Totale</strong><strong>{totale ? euro(totale) : 'gratis'}</strong></div>}
          </div>
          <p className="piccolo muto">Un solo pagamento per tutto. I biglietti (un QR per persona) arrivano in una email nei prossimi giorni, quando il pagamento è stato verificato e confermato dalla segreteria.</p>
        </aside>
      </div>
    </div>
  );
}

// una riga del riepilogo: l'importo compare solo quando l'evento è completato (persone comprese)
function RigaRiepilogo({ s, r }) {
  const x = r || {};
  return (
    <div className="bg-riep-evento bg-riep-colore" style={{ '--colore-evento': coloreDi(s) }}>
      <span><strong>{oraSpettacolo(s.inizio)} {s.titolo}</strong>
        {x.fatto ? <span className="piccolo muto"> · {x.posti} {x.posti === 1 ? 'posto' : 'posti'}{x.pizze ? ` · ${testoExtra(x.extra)}` : ''}{x.allievo_nome ? ` · per ${x.allievo_nome}` : ''}</span>
          : <span className="piccolo muto"> · da completare</span>}
        {x.fatto && (x.partecipanti || []).length > 0 && (
          <span className="bg-riep-persone">{x.partecipanti.map((y) => `${y.nome.trim()} ${y.cognome.trim()}`).join(' · ')}</span>
        )}</span>
      <span>{x.fatto ? (x.totale ? euro(x.totale) : 'gratis') : '—'}</span>
    </div>
  );
}
