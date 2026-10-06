'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { dataBreve, euro } from '@/lib/formato';
import CaricaCertificato from '../../CaricaCertificato';
import AggiungiFiglio from '../io/AggiungiFiglio';

const GIORNI = ['', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const GIORNI_LUNGHI = ['', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];
const oggi = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
const eta = (iso) => {
  if (!iso) return null;
  const n = new Date(iso), o = new Date();
  return o.getFullYear() - n.getFullYear() - (o < new Date(o.getFullYear(), n.getMonth(), n.getDate()) ? 1 : 0);
};
const mesi = (t) => (t.modalita === 'ingressi' ? null : t.durata_mesi || Math.max(1, Math.round((t.durata_giorni || 30) / 30)));
const durata = (t) => {
  if (t.modalita === 'ingressi') return t.num_ingressi ? `pacchetto da ${t.num_ingressi} lezioni` : 'a ingressi';
  if (t.durata_giorni === 1) return '1 lezione';
  if (t.durata_giorni && t.durata_giorni < 28) return `${t.durata_giorni} giorni`;
  const m = mesi(t);
  return m === 1 ? 'mensile' : m === 3 ? 'trimestrale' : m >= 9 ? 'annuale' : `${m} mesi`;
};
const prezzoDi = (t) => t.prezzo_web_cent || t.prezzo_cent || 0;
const aMese = (t) => !!t && t.scadenza_fine_mese !== false && t.modalita !== 'ingressi' && (!t.durata_giorni || t.durata_giorni >= 28);
const primiDelMese = () => {
  const o = oggi(); const [y, m] = o.split('-').map(Number); const out = [];
  if (o.endsWith('-01')) out.push(o);
  for (let k = 1; out.length < 3; k++) out.push(new Date(Date.UTC(y, m - 1 + k, 1)).toISOString().slice(0, 10));
  return out;
};
const nomeMese = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('it-IT', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const giornoDopo = (d) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };
const ERRORI = {
  richiesta_gia_inviata: 'L\'hai già chiesto: la segreteria lo attiva appena arriva il bonifico.',
  scegli_i_giorni: 'Scegli i giorni in cui verrai.',
  abbonamento_non_disponibile: 'Questo abbonamento non è più disponibile.',
  corso_non_aperto: 'Le iscrizioni a questo corso non sono aperte.',
  orario_non_attivo: 'Uno dei giorni scelti non c\'è più: torna indietro e scegline un altro.',
  orario_pieno: 'Uno dei giorni scelti è al completo: scegline un altro o mettiti in coda.',
  troppi_giorni: 'Hai scelto più giorni di quelli compresi nell\'abbonamento.',
  eta_non_adatta: 'Questo corso è per un\'altra età: torna indietro e scegline un altro.',
  inizio_meta_mese: 'Dall\'app si parte il 1° del mese. Per iniziare adesso passa dalla segreteria.',
  annuale_in_segreteria: 'L\'annuale iniziato a stagione avviata si fa in segreteria (ti scalano i mesi passati).',
};
const PASSI = [['chi', 'Per chi'], ['corso', 'Corso'], ['abbonamento', 'Abbonamento'], ['giorni', 'Giorni'], ['paga', 'Riepilogo']];

export default function Iscriviti({ persone, corsi, tipi, orari, coperti, pieni, attivi, quotaCent, carta, rinnovo, bonifico, corsoIniziale, perIniziale, annullato }) {
  const unaPersona = persone.length === 1;
  const [passo, setPasso] = useState(unaPersona ? 'corso' : 'chi');
  const [chi, setChi] = useState(persone.find((p) => p.id === perIniziale)?.id || (unaPersona ? persone[0].id : ''));
  const [corsoId, setCorsoId] = useState('');
  const [tipoId, setTipoId] = useState('');
  const [scelti, setScelti] = useState([]);
  const [inizio, setInizio] = useState('');
  const [fine, setFine] = useState(null);
  const [ricorrente, setRicorrente] = useState(false);
  const [errore, setErrore] = useState(annullato ? 'Pagamento non completato: non ti abbiamo addebitato nulla. Puoi riprovare.' : '');
  const [invio, setInvio] = useState(false);
  const [richiesta, setRichiesta] = useState(null);
  const [certCaricato, setCertCaricato] = useState(false);
  const [inCoda, setInCoda] = useState([]);
  // filtri dei corsi
  const [tutteEta, setTutteEta] = useState(false);
  const [categoria, setCategoria] = useState('');
  const [giorniFiltro, setGiorniFiltro] = useState([]);
  const [sede, setSede] = useState('');
  const [cerca, setCerca] = useState('');
  const [livello, setLivello] = useState('');
  const [volte, setVolte] = useState(0);

  const persona = persone.find((p) => p.id === chi);
  const anni = eta(persona?.nascita);
  const corso = corsi.find((c) => c.id === corsoId);
  const tipo = tipi.find((t) => t.id === tipoId);
  const fissi = tipo?.modalita === 'orari_fissi';
  const passi = PASSI.filter(([k]) => !(k === 'chi' && unaPersona) && !(k === 'giorni' && tipo && !fissi));
  const indice = passi.findIndex(([k]) => k === passo);
  const vai = (k) => { setErrore(''); setPasso(k); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const indietro = () => { if (indice > 0) vai(passi[indice - 1][0]); };

  // dal sito o dall'orario con un corso già scelto: si parte da lì
  useEffect(() => {
    if (corsoIniziale && corsi.some((c) => c.id === corsoIniziale) && chi) { setCorsoId(corsoIniziale); setPasso('abbonamento'); }
  }, []); // eslint-disable-line

  // ------------------------------------------------ corsi: età, cosa, giorni, sede
  const adatto = (c) => anni == null || ((c.eta_min == null || anni >= c.eta_min) && (c.eta_max == null || anni <= c.eta_max));
  const perEta = corsi.filter((c) => tutteEta || adatto(c));
  const categorie = [...new Set(perEta.map((c) => c.categoria).filter(Boolean))].sort();
  const sedi = [...new Set(corsi.map((c) => c.sede).filter(Boolean))].sort();
  const livelli = [...new Set(perEta.filter((c) => !categoria || c.categoria === categoria).map((c) => c.livello).filter(Boolean))];
  const testo = cerca.trim().toLowerCase();
  const corsiVisti = perEta.filter((c) => (!categoria || c.categoria === categoria)
    && (!sede || c.sede === sede) && (!livello || c.livello === livello)
    && (!giorniFiltro.length || (c.orari || []).some((o) => giorniFiltro.includes(o.giorno)))
    && (!testo || `${c.nome} ${c.disciplina} ${c.insegnanti || ''}`.toLowerCase().includes(testo)))
    .sort((a, b) => (a.iscrizioni_app === 'aperte' ? 0 : 1) - (b.iscrizioni_app === 'aperte' ? 0 : 1) || a.nome.localeCompare(b.nome));

  // ------------------------------------------------ abbonamenti del corso scelto
  // Pochissime scelte: prima quelli fatti apposta per questo corso (i più specifici, a giorni fissi);
  // gli abbonamenti generici (senza corsi indicati) si vedono solo se il corso non ne ha di suoi;
  // il resto (open, altre durate per adulti…) sta sotto "Altre formule".
  const [tipiCorso, altreFormule] = useMemo(() => {
    if (!corsoId) return [[], []];
    const nCorsi = (t) => coperti.filter((c) => c.tipo_abbonamento_id === t.id).length;
    const ordina = (l) => l.sort((a, b) => (a.lezioni_settimanali || 0) - (b.lezioni_settimanali || 0) || (mesi(a) || 0) - (mesi(b) || 0) || prezzoDi(a) - prezzoDi(b));
    const espliciti = tipi.filter((t) => coperti.some((c) => c.tipo_abbonamento_id === t.id && c.corso_id === corsoId));
    if (!espliciti.length) return [ordina(tipi.filter((t) => nCorsi(t) === 0)), []];
    const fissi = espliciti.filter((t) => t.modalita === 'orari_fissi');
    const minimo = fissi.length ? Math.min(...fissi.map(nCorsi)) : null;
    const principali = fissi.filter((t) => nCorsi(t) === minimo);
    return [ordina(principali.length ? principali : espliciti), ordina(espliciti.filter((t) => !principali.includes(t)))];
  }, [corsoId, tipi, coperti]);
  const [vediAltre, setVediAltre] = useState(false);
  const volteDisponibili = [...new Set(tipiCorso.map((t) => t.lezioni_settimanali).filter(Boolean))].sort();
  const tipiVisti = tipiCorso.filter((t) => !volte || t.lezioni_settimanali === volte);

  // ------------------------------------------------ giorni, inizio, fine
  const orariCorso = orari.filter((o) => o.corso_id === corsoId)
    .sort((a, b) => a.giorno_settimana - b.giorno_settimana || String(a.ora_inizio).localeCompare(String(b.ora_inizio)));
  const max = tipo?.lezioni_settimanali || 7;
  const inCorso = attivi.filter((a) => a.allievo_id === chi && a.corso_id === corsoId && a.data_fine >= (inizio || oggi()))
    .sort((a, b) => b.data_fine.localeCompare(a.data_fine))[0];
  const inizioVero = inCorso ? giornoDopo(inCorso.data_fine) : inizio;
  const metaMese = aMese(tipo) && !!inizioVero && !inizioVero.endsWith('-01');
  useEffect(() => {
    if (!tipo || !inizioVero) { setFine(null); return; }
    supabaseBrowser().rpc('scadenza_abbonamento', { p_tipo: tipo.id, p_inizio: inizioVero }).then(({ data }) => setFine(data || null));
  }, [tipo, inizioVero]);

  const prezzo = tipo ? prezzoDi(tipo) : 0;
  const quota = persona?.quota ? quotaCent : 0;

  function scegliCorso(c) {
    if (c.iscrizioni_app !== 'aperte') return;
    setCorsoId(c.id); setTipoId(''); setScelti([]); setVolte(0); setVediAltre(false);
    vai('abbonamento');
  }
  function scegliTipo(t) {
    setTipoId(t.id); setScelti([]); setInizio(aMese(t) ? primiDelMese()[0] : oggi()); setRicorrente(false); setRichiesta(null);
    vai(t.modalita === 'orari_fissi' ? 'giorni' : 'paga');
  }
  function alterna(o) {
    setScelti((v) => (v.includes(o.id) ? v.filter((x) => x !== o.id) : max === 1 ? [o.id] : v.length >= max ? v : [...v, o.id]));
  }
  async function inCodaPer(o) {
    const { error } = await supabaseBrowser().rpc('mettimi_in_coda_orario', { p_allievo: chi, p_orario: o.id });
    if (error) { setErrore('Non riuscito. Riprova.'); return; }
    setInCoda((v) => [...v, o.id]);
  }
  function controlla() {
    if (fissi && !scelti.length) { setErrore('Scegli i giorni in cui verrai.'); return false; }
    if (metaMese) { setErrore(ERRORI.inizio_meta_mese); return false; }
    setErrore(''); return true;
  }
  async function conCarta() {
    if (!controlla()) return;
    setInvio(true);
    const r = await fetch('/api/stripe/acquisto', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allievo_id: chi, tipo_abbonamento_id: tipo.id, corso_id: corsoId, orari: scelti, data_inizio: inizio, ricorrente, ritorno: 'iscriviti' }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.url) { setInvio(false); setErrore(d.errore || 'Non riusciamo ad aprire il pagamento. Riprova.'); return; }
    window.location.href = d.url;
  }
  async function conBonifico() {
    if (!controlla()) return;
    setInvio(true);
    const { data, error } = await supabaseBrowser().rpc('richiedi_abbonamento', { p_allievo: chi, p_tipo: tipo.id, p_corso: corsoId, p_orari: scelti, p_data_inizio: inizio });
    setInvio(false);
    if (error) { const k = Object.keys(ERRORI).find((x) => error.message?.includes(x)); setErrore(ERRORI[k] || 'Richiesta non inviata. Riprova.'); return; }
    setRichiesta(data);
  }
  const copia = (t) => { try { navigator.clipboard.writeText(t); } catch { /* niente */ } };
  const giorniTesto = (lista) => lista.map((id) => orari.find((o) => o.id === id)).filter(Boolean)
    .map((o) => `${GIORNI[o.giorno_settimana]} ${String(o.ora_inizio).slice(0, 5)}`).join(' · ');

  return (
    <div className="area-casa isc">
      <div className="isc-testa">
        {indice > 0 ? <button type="button" className="isc-indietro" onClick={indietro} aria-label="Indietro">←</button> : <span />}
        <div className="isc-titolo">
          <h1>Iscriviti</h1>
          <span>{indice + 1} di {passi.length} · {passi[indice]?.[1]}</span>
        </div>
      </div>
      <div className="isc-barra" aria-hidden="true"><span style={{ width: `${((indice + 1) / passi.length) * 100}%` }} /></div>
      {/* le scelte fatte, toccabili per cambiarle */}
      {(persona && !unaPersona && passo !== 'chi') || corso ? (
        <div className="isc-scelte">
          {persona && !unaPersona && passo !== 'chi' && <button type="button" onClick={() => vai('chi')}>{persona.nome}</button>}
          {corso && passo !== 'corso' && <button type="button" onClick={() => vai('corso')}><span className="punto-colore" style={{ background: corso.colore }} />{corso.nome}</button>}
          {tipo && (passo === 'giorni' || passo === 'paga') && <button type="button" onClick={() => vai('abbonamento')}>{durata(tipo)}{tipo.lezioni_settimanali ? ` · ${tipo.lezioni_settimanali}×` : ''}</button>}
          {scelti.length > 0 && passo === 'paga' && <button type="button" onClick={() => vai('giorni')}>{giorniTesto(scelti)}</button>}
        </div>
      ) : null}
      {errore && <div className="errore" role="alert">{errore}</div>}

      {/* ---------------------------------------------- 1 · per chi */}
      {passo === 'chi' && (
        <section>
          <h2 className="isc-domanda">Chi si iscrive?</h2>
          <div className="isc-carte">
            {persone.map((p) => (
              <button key={p.id} type="button" className={`isc-carta${chi === p.id ? ' scelta' : ''}`} onClick={() => { setChi(p.id); setTipoId(''); if (corsoIniziale && corsi.some((c) => c.id === corsoIniziale)) { setCorsoId(corsoIniziale); vai('abbonamento'); } else { setCorsoId(''); vai('corso'); } }}>
                <strong>{p.nome}</strong><span>{eta(p.nascita) != null ? `${eta(p.nascita)} anni` : ''}</span>
              </button>
            ))}
          </div>
          <AggiungiFiglio cognome="" />
        </section>
      )}

      {/* ---------------------------------------------- 2 · corso */}
      {passo === 'corso' && (
        <section>
          <h2 className="isc-domanda">Che corso{persona && !unaPersona ? ` per ${persona.nome}` : ''}?</h2>
          {anni != null && (
            <p className="isc-nota">{tutteEta ? 'Stai vedendo i corsi di tutte le età.' : `Ti mostriamo solo i corsi adatti a ${anni} anni.`}{' '}
              <button type="button" className="link-btn" onClick={() => setTutteEta(!tutteEta)}>{tutteEta ? 'solo quelli adatti' : 'vedi tutte le età'}</button></p>
          )}
          {categorie.length > 1 && (
            <div className="isc-chips" role="group" aria-label="Cosa ti piace">
              <button type="button" aria-pressed={!categoria} onClick={() => { setCategoria(''); setLivello(''); }}>Tutto</button>
              {categorie.map((k) => <button key={k} type="button" aria-pressed={categoria === k} onClick={() => { setCategoria(categoria === k ? '' : k); setLivello(''); }}>{k}</button>)}
            </div>
          )}
          <div className="isc-chips piccoli" role="group" aria-label="Che giorni puoi">
            <span>Giorni:</span>
            {[1, 2, 3, 4, 5, 6].map((g) => (
              <button key={g} type="button" aria-pressed={giorniFiltro.includes(g)} onClick={() => setGiorniFiltro((v) => (v.includes(g) ? v.filter((x) => x !== g) : [...v, g]))}>{GIORNI[g]}</button>
            ))}
          </div>
          {(sedi.length > 1 || livelli.length > 1) && (
            <div className="isc-chips piccoli">
              {sedi.length > 1 && <>
                <span>Sede:</span>
                {sedi.map((s) => <button key={s} type="button" aria-pressed={sede === s} onClick={() => setSede(sede === s ? '' : s)}>{s}</button>)}
              </>}
              {livelli.length > 1 && <>
                <span>Livello:</span>
                {livelli.map((l) => <button key={l} type="button" aria-pressed={livello === l} onClick={() => setLivello(livello === l ? '' : l)}>{l}</button>)}
              </>}
            </div>
          )}
          <input className="isc-cerca" type="search" value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca per nome (es. hip hop, pole)" aria-label="Cerca un corso" />
          <p className="isc-conta">{corsiVisti.length === 1 ? '1 corso' : `${corsiVisti.length} corsi`}</p>
          {corsiVisti.length === 0 && (
            <div className="vuoto">Nessun corso con queste scelte.{' '}
              <button type="button" className="link-btn" onClick={() => { setCategoria(''); setGiorniFiltro([]); setSede(''); setLivello(''); setCerca(''); }}>Togli i filtri</button></div>
          )}
          <ul className="isc-corsi">
            {corsiVisti.map((c) => {
              const aperto = c.iscrizioni_app === 'aperte';
              return (
                <li key={c.id}>
                  <button type="button" className={`isc-corso${aperto ? '' : ' chiuso'}`} onClick={() => scegliCorso(c)} disabled={!aperto} style={{ '--colore': c.colore || '#e30613' }}>
                    <span className="isc-corso-nome">{c.nome}</span>
                    <span className="isc-corso-info">{[c.disciplina, c.livello, c.fascia && `${c.fascia}${c.eta_min ? ` ${c.eta_min}${c.eta_max ? `–${c.eta_max}` : '+'} anni` : ''}`].filter(Boolean).join(' · ')}</span>
                    <span className="isc-corso-orari">
                      {(c.orari || []).map((o, i) => <span key={i}>{GIORNI[o.giorno]} {o.ora}</span>)}
                    </span>
                    {(c.insegnanti || c.sede) && <span className="isc-corso-info">{[c.insegnanti && `con ${c.insegnanti}`, sedi.length > 1 && c.sede].filter(Boolean).join(' · ')}</span>}
                    {!aperto && <span className="isc-corso-stato">{c.iscrizioni_app === 'attesa' ? 'In partenza' : 'Iscrizioni chiuse'}{c.nota_iscrizioni ? `: ${c.nota_iscrizioni}` : ''}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ---------------------------------------------- 3 · abbonamento */}
      {passo === 'abbonamento' && corso && (
        <section>
          <h2 className="isc-domanda">Che abbonamento?</h2>
          {tipiCorso.length === 0 && <div className="vuoto">Questo corso non si può ancora acquistare dall&apos;app: scrivi alla segreteria e ti iscrive lei.</div>}
          {volteDisponibili.length > 1 && (
            <div className="isc-chips" role="group" aria-label="Quante volte a settimana">
              <button type="button" aria-pressed={!volte} onClick={() => setVolte(0)}>Tutti</button>
              {volteDisponibili.map((n) => <button key={n} type="button" aria-pressed={volte === n} onClick={() => setVolte(n)}>{n === 1 ? '1 volta' : `${n} volte`} a settimana</button>)}
            </div>
          )}
          <ul className="isc-tipi">
            {[...tipiVisti, ...(vediAltre ? altreFormule.filter((t) => !volte || t.lezioni_settimanali === volte) : [])].map((t) => {
              const m = mesi(t);
              return (
                <li key={t.id}>
                  <button type="button" className={`isc-tipo${tipoId === t.id ? ' scelto' : ''}`} onClick={() => scegliTipo(t)}>
                    <span className="isc-tipo-nome">
                      <strong>{durata(t).replace(/^./, (x) => x.toUpperCase())}{t.lezioni_settimanali ? ` · ${t.lezioni_settimanali === 1 ? '1 volta' : `${t.lezioni_settimanali} volte`} a settimana` : ''}</strong>
                      <span>{t.nome}</span>
                    </span>
                    <span className="isc-tipo-prezzo"><strong>{euro(prezzoDi(t))}</strong>{m > 1 && <span>{euro(Math.round(prezzoDi(t) / m))} al mese</span>}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {altreFormule.length > 0 && !vediAltre && (
            <button type="button" className="link-btn isc-altre" onClick={() => setVediAltre(true)}>Altre formule ({altreFormule.length})</button>
          )}
        </section>
      )}

      {/* ---------------------------------------------- 4 · giorni */}
      {passo === 'giorni' && tipo && (
        <section>
          <h2 className="isc-domanda">{max === 1 ? 'Che giorno vieni?' : `Scegli ${max} giorni`}</h2>
          {orariCorso.length === 0 && <div className="vuoto">Questo corso non ha giorni prenotabili: scrivi alla segreteria.</div>}
          <div className="isc-giorni">
            {orariCorso.map((o) => {
              const pieno = pieni.includes(o.id) && !scelti.includes(o.id);
              return (
                <button key={o.id} type="button" aria-pressed={scelti.includes(o.id)} disabled={pieno} onClick={() => alterna(o)}>
                  <strong>{GIORNI_LUNGHI[o.giorno_settimana]}</strong><span>{String(o.ora_inizio).slice(0, 5)}{o.durata_min ? ` · ${o.durata_min} min` : ''}</span>
                  {pieno && <small>completo</small>}
                </button>
              );
            })}
          </div>
          {orariCorso.some((o) => pieni.includes(o.id)) && (
            <p className="isc-nota">Il giorno che vuoi è pieno?{' '}
              {orariCorso.filter((o) => pieni.includes(o.id)).map((o) => (inCoda.includes(o.id)
                ? <span key={o.id} className="tag tag-attenzione">in coda per {GIORNI[o.giorno_settimana]} {String(o.ora_inizio).slice(0, 5)}</span>
                : <button key={o.id} type="button" className="link-btn" onClick={() => inCodaPer(o)}>mettimi in coda per {GIORNI[o.giorno_settimana]} {String(o.ora_inizio).slice(0, 5)}</button>))}
            </p>
          )}
          <button type="button" className="btn btn-primario btn-pieno btn-grande isc-avanti" disabled={!scelti.length} onClick={() => vai('paga')}>
            {scelti.length ? `Avanti con ${giorniTesto(scelti)} →` : 'Scegli almeno un giorno'}
          </button>
        </section>
      )}

      {/* ---------------------------------------------- 5 · riepilogo e pagamento */}
      {passo === 'paga' && tipo && (
        <section>
          <h2 className="isc-domanda">Riepilogo</h2>
          <div className="isc-riepilogo">
            <div><span>Chi</span><strong>{persona?.nome}</strong></div>
            <div><span>Corso</span><strong>{corso?.nome}</strong></div>
            <div><span>Abbonamento</span><strong>{tipo.nome}</strong></div>
            {fissi && <div><span>Giorni</span><strong>{giorniTesto(scelti)}</strong></div>}
            <div><span>Da</span>
              {inCorso ? <strong>{dataBreve(inizioVero)}</strong> : aMese(tipo) ? (
                <select value={inizio} onChange={(e) => setInizio(e.target.value)} aria-label="Da quando">
                  {primiDelMese().map((d) => <option key={d} value={d}>1° {nomeMese(d)}</option>)}
                </select>
              ) : <input type="date" value={inizio} min={oggi()} onChange={(e) => setInizio(e.target.value)} aria-label="Da quando" />}
            </div>
            {fine && <div><span>Fino al</span><strong>{dataBreve(fine)}</strong></div>}
          </div>
          {inCorso && <p className="isc-nota">Hai già questo corso fino al {dataBreve(inCorso.data_fine)}: il nuovo abbonamento parte il giorno dopo.</p>}
          {aMese(tipo) && !inCorso && !oggi().endsWith('-01') && (
            <p className="isc-nota">Gli abbonamenti partono il 1° del mese. Vuoi cominciare subito? Passa in segreteria: ti fanno l&apos;importo per le lezioni che restano.</p>
          )}

          <div className="isc-totale">
            <div><span>{durata(tipo).replace(/^./, (x) => x.toUpperCase())}</span><span>{euro(prezzo)}</span></div>
            {quota > 0 && <div><span>Quota associativa annuale (con assicurazione)</span><span>{euro(quota)}</span></div>}
            <div className="somma"><strong>Totale</strong><strong>{euro(prezzo + quota)}</strong></div>
          </div>

          {/* certificato medico: si può caricare subito (non blocca il pagamento) */}
          {persona && !persona.certificatoOk && !persona.inVerifica && !certCaricato && (
            <details className="isc-cert">
              <summary><strong>Certificato medico</strong> · serve per fare lezione: caricalo ora (foto o PDF) o portalo in segreteria</summary>
              <CaricaCertificato token={persona.token} nome={persona.nome} onFatto={() => setCertCaricato(true)} />
            </details>
          )}
          {(certCaricato || persona?.inVerifica) && <p className="isc-nota">✓ Certificato caricato: la segreteria lo controlla.</p>}

          {richiesta ? (
            <div className="aq-bonifico">
              <strong>Richiesta inviata ✓ Ora fai il bonifico:</strong>
              {bonifico?.iban ? (
                <>
                  <span className="aq-riga">Importo <b>{euro(richiesta.importo_cent)}</b></span>
                  {bonifico.intestatario && <span className="aq-riga">Intestato a <b>{bonifico.intestatario}</b></span>}
                  <span className="aq-riga">IBAN <b>{bonifico.iban}</b><button type="button" className="link-btn piccolo" onClick={() => copia(bonifico.iban.replace(/\s/g, ''))}>copia</button></span>
                  <span className="aq-riga">Causale <b>{richiesta.causale}</b><button type="button" className="link-btn piccolo" onClick={() => copia(richiesta.causale)}>copia</button></span>
                </>
              ) : <span>La segreteria ti manda i dati per il bonifico.</span>}
              <span className="isc-nota">Appena arriva, la segreteria attiva l&apos;abbonamento e ti arriva la notifica.</span>
              <Link href="/area" className="btn btn-pieno">Torna alle lezioni</Link>
            </div>
          ) : (
            <div className="isc-paga">
              {carta && rinnovo && tipo.rinnovo_automatico && (
                <label className="spunta isc-rinnovo"><input type="checkbox" checked={ricorrente} onChange={(e) => setRicorrente(e.target.checked)} />
                  <span><strong>Rinnovo automatico</strong> con la stessa carta alla scadenza (lo disdici quando vuoi da Pagamenti)</span></label>
              )}
              {carta && <button className="btn btn-primario btn-pieno btn-grande" disabled={invio || metaMese} onClick={conCarta}>{invio ? 'Un attimo…' : `Paga ${euro(prezzo + quota)} con carta`}</button>}
              <button className={`btn btn-pieno ${carta ? '' : 'btn-primario btn-grande'}`} disabled={invio || metaMese} onClick={conBonifico}>{invio ? 'Un attimo…' : 'Paga con bonifico'}</button>
              <p className="isc-nota">Dopo il pagamento le lezioni ti compaiono da sole in &quot;Lezioni&quot; e la ricevuta arriva per email.</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
