'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { gruppiDi, nomeGruppo } from '@/lib/gruppi';
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
  gruppi_diversi: 'I giorni devono essere tutti dello stesso gruppo: per mescolare gruppi scrivi alla segreteria.',
  eta_non_adatta: 'Questo corso è per un\'altra età: torna indietro e scegline un altro.',
  inizio_meta_mese: 'Dall\'app si parte il 1° del mese. Per iniziare adesso passa dalla segreteria.',
  annuale_in_segreteria: 'L\'annuale iniziato a stagione avviata si fa in segreteria (ti scalano i mesi passati).',
};
const PASSI = [['chi', 'Per chi'], ['corso', 'Corso'], ['abbonamento', 'Abbonamento'], ['giorni', 'Giorni'], ['paga', 'Riepilogo']];

export default function Iscriviti({ persone, corsi, tipi, orari, coperti, pieni, attivi, quotaCent, carta, satispay = false, rinnovo, bonifico, corsoIniziale, perIniziale, annullato }) {
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
  const [vediFiltri, setVediFiltri] = useState(false);

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
  const nFiltri = giorniFiltro.length + (sede ? 1 : 0) + (livello ? 1 : 0) + (tutteEta ? 1 : 0);
  const corsiVisti = perEta.filter((c) => (!categoria || c.categoria === categoria)
    && (!sede || c.sede === sede) && (!livello || c.livello === livello)
    && (!giorniFiltro.length || (c.orari || []).some((o) => giorniFiltro.includes(o.giorno)))
    && (!testo || `${c.nome} ${c.disciplina} ${c.insegnanti || ''}`.toLowerCase().includes(testo)))
    .sort((a, b) => {
      const ok = (c) => (c.iscrizioni_app === 'aperte' && orari.some((o) => o.corso_id === c.id) ? 0 : 1);
      return ok(a) - ok(b) || a.nome.localeCompare(b.nome);
    });

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
  // gruppi dentro il corso (es. serale con Eloise, pausa pranzo con Liuda): si sceglie il gruppo, poi solo i suoi giorni
  const gruppiCorso = gruppiDi(orariCorso);
  const [gruppo, setGruppo] = useState(null);   // chiave del gruppo scelto ('' = "Altri orari"), null = non ancora scelto
  const gruppoScelto = gruppiCorso.length ? gruppiCorso.find((g) => g.chiave === gruppo) || null : null;
  const orariGruppo = gruppiCorso.length ? (gruppoScelto ? gruppoScelto.orari : []) : orariCorso;
  const insegnantiDi = (lista) => [...new Set(lista.map((o) => o.insegnante).filter(Boolean))];
  // gli altri corsi compresi nell'abbonamento scelto (Corsi coperti), adatti all'età e aperti dall'app:
  // servono quando il corso ha meno giorni di quelli dell'abbonamento (es. Hip Hop 2 solo il mercoledì, abbonamento 3 volte)
  const altriCorsi = useMemo(() => {
    if (!tipo) return [];
    const ids = new Set(coperti.filter((c) => c.tipo_abbonamento_id === tipo.id && c.corso_id !== corsoId).map((c) => c.corso_id));
    // stessa regola dell'età del corso scelto: se l'ha scelto fuori età ("tutte le età"), non si filtra
    const filtraEta = !corso || adatto(corso);
    return corsi.filter((c) => ids.has(c.id) && c.iscrizioni_app === 'aperte' && (!filtraEta || adatto(c)))
      .map((c) => ({ corso: c, orari: orari.filter((o) => o.corso_id === c.id)
        .sort((a, b) => a.giorno_settimana - b.giorno_settimana || String(a.ora_inizio).localeCompare(String(b.ora_inizio))) }))
      .filter((x) => x.orari.length)
      .sort((a, b) => a.corso.nome.localeCompare(b.corso.nome, 'it'));
  }, [tipo, coperti, corsoId, corsi, orari, anni]); // eslint-disable-line react-hooks/exhaustive-deps
  const [vediAltriCorsi, setVediAltriCorsi] = useState(false);
  const pochiGiorni = !!tipo?.lezioni_settimanali && orariGruppo.length < tipo.lezioni_settimanali;
  const giorniPossibili = orariGruppo.length + altriCorsi.reduce((n, x) => n + x.orari.length, 0);
  // si chiedono tutti i giorni dell'abbonamento quando ce ne sono abbastanza; altrimenti basta almeno uno
  const servono = tipo?.lezioni_settimanali ? Math.min(tipo.lezioni_settimanali, giorniPossibili) : 1;
  const mancano = Math.max(0, servono - scelti.length);
  const orariVisibili = [...orariGruppo, ...(pochiGiorni || vediAltriCorsi ? altriCorsi.flatMap((x) => x.orari) : [])];
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
    if (c.iscrizioni_app !== 'aperte' || !orari.some((o) => o.corso_id === c.id)) return;
    setCorsoId(c.id); setTipoId(''); setScelti([]); setVolte(0); setVediAltre(false); setGruppo(null);
    vai('abbonamento');
  }
  function scegliTipo(t) {
    setTipoId(t.id); setScelti([]); setGruppo(null); setInizio(aMese(t) ? primiDelMese()[0] : oggi()); setRicorrente(false); setRichiesta(null); setVediAltriCorsi(false);
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
    if (fissi && (!scelti.length || mancano > 0)) { setErrore('Scegli i giorni in cui verrai.'); return false; }
    if (metaMese) { setErrore(ERRORI.inizio_meta_mese); return false; }
    setErrore(''); return true;
  }
  async function conSatispay() {
    if (!controlla()) return;
    setInvio(true);
    const r = await fetch('/api/satispay/acquisto', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allievo_id: chi, tipo_abbonamento_id: tipo.id, corso_id: corsoId, orari: scelti, data_inizio: inizio }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.url) { setInvio(false); setErrore(d.errore || 'Non riusciamo ad aprire Satispay. Riprova.'); return; }
    window.location.href = d.url;
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
    .map((o) => `${GIORNI[o.giorno_settimana]} ${String(o.ora_inizio).slice(0, 5)}${o.corso_id !== corsoId ? ` (${corsi.find((c) => c.id === o.corso_id)?.nome || 'altro corso'})` : ''}`).join(' · ');
  const bottoneGiorno = (o) => {
    const pieno = pieni.includes(o.id) && !scelti.includes(o.id);
    return (
      <button key={o.id} type="button" aria-pressed={scelti.includes(o.id)} disabled={pieno} onClick={() => alterna(o)}>
        <strong>{GIORNI_LUNGHI[o.giorno_settimana]}</strong><span>{String(o.ora_inizio).slice(0, 5)}{o.durata_min ? ` · ${o.durata_min} min` : ''}</span>
        {(o.insegnante || (o.corso_id !== corsoId && nomeGruppo(o))) && (
          <small className="isc-ins">{[o.insegnante && `con ${o.insegnante}`, o.corso_id !== corsoId && nomeGruppo(o)].filter(Boolean).join(' · ')}</small>
        )}
        {pieno && <small>completo</small>}
      </button>
    );
  };

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
          {/* in alto: cerca e "cosa ti piace"; giorni, sede e livello in "Filtri" (chiusi), così i corsi si vedono subito */}
          <input className="isc-cerca" type="search" value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca per nome (es. hip hop, pole)" aria-label="Cerca un corso" />
          {categorie.length > 1 && (
            <div className="isc-scorri" role="group" aria-label="Cosa ti piace">
              <button type="button" aria-pressed={!categoria} onClick={() => { setCategoria(''); setLivello(''); }}>Tutto</button>
              {categorie.map((k) => <button key={k} type="button" aria-pressed={categoria === k} onClick={() => { setCategoria(categoria === k ? '' : k); setLivello(''); }}>{k}</button>)}
            </div>
          )}
          <div className="isc-filtri-riga">
            <button type="button" className={`isc-filtri-btn${nFiltri ? ' attivi' : ''}`} aria-expanded={vediFiltri} onClick={() => setVediFiltri(!vediFiltri)}>
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M4 6h16M7 12h10M10 18h4" /></svg>
              Filtri{nFiltri ? ` · ${nFiltri}` : ''}
            </button>
            {/* i filtri scelti restano visibili anche a pannello chiuso, e si tolgono con × */}
            {!vediFiltri && giorniFiltro.map((g) => <button key={`g${g}`} type="button" className="isc-tolto" onClick={() => setGiorniFiltro((v) => v.filter((x) => x !== g))}>{GIORNI[g]} ×</button>)}
            {!vediFiltri && sede && <button type="button" className="isc-tolto" onClick={() => setSede('')}>{sede} ×</button>}
            {!vediFiltri && livello && <button type="button" className="isc-tolto" onClick={() => setLivello('')}>{livello} ×</button>}
            {!vediFiltri && tutteEta && <button type="button" className="isc-tolto" onClick={() => setTutteEta(false)}>tutte le età ×</button>}
          </div>
          {vediFiltri && (
            <div className="isc-filtri">
              <div className="isc-filtro"><span>Giorni</span>
                <div className="isc-scorri piccoli">
                  {[1, 2, 3, 4, 5, 6].map((g) => (
                    <button key={g} type="button" aria-pressed={giorniFiltro.includes(g)} onClick={() => setGiorniFiltro((v) => (v.includes(g) ? v.filter((x) => x !== g) : [...v, g]))}>{GIORNI[g]}</button>
                  ))}
                </div></div>
              {livelli.length > 1 && (
                <div className="isc-filtro"><span>Livello</span>
                  <div className="isc-scorri piccoli">
                    {livelli.map((l) => <button key={l} type="button" aria-pressed={livello === l} onClick={() => setLivello(livello === l ? '' : l)}>{l}</button>)}
                  </div></div>
              )}
              {sedi.length > 1 && (
                <div className="isc-filtro"><span>Sede</span>
                  <div className="isc-scorri piccoli">
                    {sedi.map((x) => <button key={x} type="button" aria-pressed={sede === x} onClick={() => setSede(sede === x ? '' : x)}>{x}</button>)}
                  </div></div>
              )}
              {anni != null && (
                <label className="isc-filtro-eta"><input type="checkbox" checked={tutteEta} onChange={(e) => setTutteEta(e.target.checked)} /> anche i corsi non adatti a {anni} anni</label>
              )}
              <div className="isc-filtri-azioni">
                {nFiltri > 0 && <button type="button" className="link-btn" onClick={() => { setGiorniFiltro([]); setSede(''); setLivello(''); setTutteEta(false); }}>Togli i filtri</button>}
                <button type="button" className="btn btn-piccolo btn-primario" onClick={() => setVediFiltri(false)}>Mostra {corsiVisti.length === 1 ? '1 corso' : `${corsiVisti.length} corsi`}</button>
              </div>
            </div>
          )}
          <p className="isc-conta" key={`${corsiVisti.length}-${categoria}-${nFiltri}-${cerca}`}>
            {corsiVisti.length === 1 ? '1 corso' : `${corsiVisti.length} corsi`}
            {anni != null && !tutteEta && <span className="muto"> · adatti a {anni} anni</span>}
          </p>
          {corsiVisti.length === 0 && (
            <div className="vuoto">Nessun corso con queste scelte.{' '}
              <button type="button" className="link-btn" onClick={() => { setCategoria(''); setGiorniFiltro([]); setSede(''); setLivello(''); setCerca(''); }}>Togli i filtri</button></div>
          )}
          <ul className="isc-corsi">
            {corsiVisti.map((c) => {
              // senza giorni prenotabili dall'app non si può scegliere: lo iscrive la segreteria
              const senzaGiorni = !orari.some((o) => o.corso_id === c.id);
              const aperto = c.iscrizioni_app === 'aperte' && !senzaGiorni;
              return (
                <li key={c.id}>
                  <button type="button" className={`isc-corso${aperto ? '' : ' chiuso'}`} onClick={() => scegliCorso(c)} disabled={!aperto} style={{ '--colore': c.colore || '#e30613' }}>
                    <span className="isc-corso-nome">{c.nome}</span>
                    <span className="isc-corso-info">{[c.disciplina, c.livello, c.fascia && `${c.fascia}${c.eta_min ? ` ${c.eta_min}${c.eta_max ? `–${c.eta_max}` : '+'} anni` : ''}`].filter(Boolean).join(' · ')}</span>
                    <span className="isc-corso-orari">
                      {(c.orari || []).map((o, i) => <span key={i}>{GIORNI[o.giorno]} {o.ora}</span>)}
                    </span>
                    {(c.insegnanti || c.sede) && <span className="isc-corso-info">{[c.insegnanti && `con ${c.insegnanti}`, sedi.length > 1 && c.sede].filter(Boolean).join(' · ')}</span>}
                    {!aperto && <span className="isc-corso-stato">{senzaGiorni && c.iscrizioni_app === 'aperte' ? 'Iscrizione in segreteria' : c.iscrizioni_app === 'attesa' ? 'In partenza' : 'Iscrizioni chiuse'}{c.nota_iscrizioni ? `: ${c.nota_iscrizioni}` : ''}</span>}
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
          <h2 className="isc-domanda">{max === 1 ? 'Che giorno vieni?' : tipo.lezioni_settimanali ? `Scegli ${max} giorni` : 'Scegli i giorni'}</h2>
          {orariCorso.length === 0 && <div className="vuoto">Questo corso non ha giorni prenotabili: scrivi alla segreteria.</div>}
          {gruppiCorso.length > 0 && !gruppoScelto && (
            <>
              <p className="isc-nota">{corso?.nome} ha {gruppiCorso.length} gruppi con giorni e insegnanti diversi: scegli il tuo.</p>
              <div className="isc-gruppi">
                {gruppiCorso.map((g) => (
                  <button key={g.chiave || 'altri'} type="button" className="isc-gruppo" onClick={() => { setGruppo(g.chiave); setScelti([]); }}>
                    <strong>{g.nome}</strong>
                    <span className="isc-gruppo-giorni">{g.orari.map((o) => `${GIORNI[o.giorno_settimana]} ${String(o.ora_inizio).slice(0, 5)}`).join(' · ')}</span>
                    {insegnantiDi(g.orari).length > 0 && <span className="isc-gruppo-ins">con {insegnantiDi(g.orari).join(', ')}</span>}
                  </button>
                ))}
              </div>
            </>
          )}
          {gruppoScelto && (
            <div className="isc-gruppo-scelto">
              <span>Gruppo <strong>{gruppoScelto.nome}</strong>{insegnantiDi(gruppoScelto.orari).length ? ` · con ${insegnantiDi(gruppoScelto.orari).join(', ')}` : ''}</span>
              <button type="button" className="link-btn" onClick={() => { setGruppo(null); setScelti([]); }}>cambia gruppo</button>
            </div>
          )}
          {(!gruppiCorso.length || gruppoScelto) && (<>
          {altriCorsi.length > 0 && orariGruppo.length > 0 && <h3 className="isc-sotto">{corso?.nome}{gruppoScelto ? ` · ${gruppoScelto.nome}` : ''}</h3>}
          <div className="isc-giorni">{orariGruppo.map(bottoneGiorno)}</div>
          {altriCorsi.length > 0 && (pochiGiorni || vediAltriCorsi) && (
            <>
              <p className="isc-nota">
                {pochiGiorni
                  ? `${gruppoScelto ? `Il gruppo ${gruppoScelto.nome}` : corso?.nome} ha ${orariGruppo.length === 1 ? 'un solo giorno' : `${orariGruppo.length} giorni`} a settimana: gli altri ${tipo.lezioni_settimanali - orariGruppo.length === 1 ? 'lo scegli' : 'li scegli'} fra i corsi compresi nel tuo abbonamento.`
                  : 'Corsi compresi nel tuo abbonamento: puoi scegliere anche questi giorni.'}
              </p>
              {altriCorsi.map((x) => (
                <div key={x.corso.id} className="isc-altro-corso">
                  <h3 className="isc-sotto">{x.corso.nome}{x.corso.livello ? <span className="muto"> · {x.corso.livello}</span> : null}</h3>
                  <div className="isc-giorni">{x.orari.map(bottoneGiorno)}</div>
                </div>
              ))}
            </>
          )}
          {altriCorsi.length > 0 && !pochiGiorni && !vediAltriCorsi && (
            <button type="button" className="link-btn isc-nota" onClick={() => setVediAltriCorsi(true)}>
              Vuoi venire anche in un altro corso compreso nell&apos;abbonamento? ({altriCorsi.length})
            </button>
          )}
          {pochiGiorni && altriCorsi.length === 0 && orariGruppo.length > 0 && (
            <p className="isc-nota">{gruppoScelto ? 'Questo gruppo' : 'Questo corso'} ha {orariGruppo.length === 1 ? 'un solo giorno' : `${orariGruppo.length} giorni`} a settimana: per gli altri giorni dell&apos;abbonamento senti la segreteria.</p>
          )}
          {orariVisibili.some((o) => pieni.includes(o.id)) && (
            <p className="isc-nota">Il giorno che vuoi è pieno?{' '}
              {orariVisibili.filter((o) => pieni.includes(o.id)).map((o) => (inCoda.includes(o.id)
                ? <span key={o.id} className="tag tag-attenzione">in coda per {GIORNI[o.giorno_settimana]} {String(o.ora_inizio).slice(0, 5)}</span>
                : <button key={o.id} type="button" className="link-btn" onClick={() => inCodaPer(o)}>mettimi in coda per {GIORNI[o.giorno_settimana]} {String(o.ora_inizio).slice(0, 5)}</button>))}
            </p>
          )}
          <button type="button" className="btn btn-primario btn-pieno btn-grande isc-avanti" disabled={!scelti.length || mancano > 0} onClick={() => vai('paga')}>
            {!scelti.length ? (servono > 1 ? `Scegli ${servono} giorni` : 'Scegli almeno un giorno')
              : mancano > 0 ? `Scegli ancora ${mancano === 1 ? 'un giorno' : `${mancano} giorni`}`
              : `Avanti con ${giorniTesto(scelti)} →`}
          </button>
          </>)}
        </section>
      )}

      {/* ---------------------------------------------- 5 · riepilogo e pagamento */}
      {passo === 'paga' && tipo && (
        <section>
          <h2 className="isc-domanda">Riepilogo</h2>
          <div className="isc-riepilogo">
            <div><span>Chi</span><strong>{persona?.nome}</strong></div>
            <div><span>Corso</span><strong>{corso?.nome}{gruppoScelto ? ` · ${gruppoScelto.nome}` : ''}</strong></div>
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
                  <span><strong>Rinnovo automatico</strong> con la stessa carta alla scadenza (solo pagando con carta; lo disdici quando vuoi da Pagamenti)</span></label>
              )}
              {carta && <button className="btn btn-primario btn-pieno btn-grande" disabled={invio || metaMese} onClick={conCarta}>{invio ? 'Un attimo…' : `Paga ${euro(prezzo + quota)} con carta`}</button>}
              {satispay && (
                <button className={`btn btn-pieno btn-satispay${carta ? '' : ' btn-grande'}`} disabled={invio || metaMese} onClick={conSatispay}>
                  {invio ? 'Un attimo…' : `Paga ${euro(prezzo + quota)} con Satispay`}
                </button>
              )}
              <button className={`btn btn-pieno ${carta || satispay ? '' : 'btn-primario btn-grande'}`} disabled={invio || metaMese} onClick={conBonifico}>{invio ? 'Un attimo…' : 'Paga con bonifico'}</button>
              <p className="isc-nota">Dopo il pagamento le lezioni ti compaiono da sole in &quot;Lezioni&quot; e la ricevuta arriva per email.</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
