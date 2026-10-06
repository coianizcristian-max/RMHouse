'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { applicaRicerca } from '@/lib/ricerca';
import { euro, dataBreve, ora } from '@/lib/formato';
import CampoCerca from '../CampoCerca';
import NuovoCliente from './NuovoCliente';
import { GruppoWhatsApp, TesseraEnte } from './Ultimi';
import { Data, centDa, euroTesto, oggi, piuGiorni, giorniTra, eta } from './campi';

const GIORNI = ['', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
const FILTRI = [['tutti', 'Tutti'], ['attivi', 'Con abbonamento'], ['scaduti', 'Abbonamento finito'], ['certificato', 'Certificato da sistemare']];
const METODI = [['contanti', 'Contanti'], ['pos', 'POS / carta'], ['bonifico', 'Bonifico'], ['assegno', 'Assegno']];
const ERRORI = {
  iscrizione_gia_attiva: 'Ha già un abbonamento a questo corso in quelle date: fai partire il nuovo dal giorno dopo la fine.',
  orario_non_attivo: 'Uno dei giorni scelti è sospeso: scegline un altro.',
  orario_non_del_corso: 'Uno dei giorni scelti non è di questo corso.',
  numerazione_mancante: 'Manca la numerazione delle ricevute (Impostazioni → Fiscale).',
  importo_non_valido: 'Controlla il prezzo.',
  non_autorizzato: 'Non hai i permessi per incassare.',
};
const ESITI_LEZIONE = {
  gia_presente: 'era già nella lezione',
  lezione_al_completo: 'lezione piena: non aggiunta',
  certificato_scaduto: 'certificato scaduto: non aggiunta',
  senza_abbonamento_attivo: 'nessun abbonamento valido quel giorno: non aggiunta',
};
// mese solare: scade a fine mese (non a ingressi né a giorni)
const aMese = (t) => !!t && t.scadenza_fine_mese !== false && t.modalita !== 'ingressi' && (!t.durata_giorni || t.durata_giorni >= 28);
const fineMese = (d) => { const [y, m] = d.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const nomeGiorno = (iso) => GIORNI[((new Date(iso + 'T12:00:00Z').getUTCDay() + 6) % 7) + 1];

const VENDITA = {
  quota: false, quotaImporto: '', corso_id: '', tipo_id: '', orari: [], data_inizio: '', prezzo: '', ingressi: '', note: '',
  aLezioni: false, al: '', nLez: '', euroLez: '', prezzoMano: false,
  certificato: '', lezioni: [], metodo: 'contanti', ricevuta: true, inviaEmail: true, email: '',
};

export default function Sportello({ palestraId, corsi, tipi, orari, palestra, personaIniziale }) {
  const [modo, setModo] = useState(personaIniziale ? 'persona' : 'cerca');   // cerca | nuovo | persona
  const [personaId, setPersonaId] = useState(personaIniziale);
  const [s, setS] = useState(null);           // situazione della persona scelta
  const [v, setV] = useState(VENDITA);
  const [lezioni, setLezioni] = useState([]);
  const [rimaste, setRimaste] = useState(null);
  const [contate, setContate] = useState(null);   // { n, stima }: lezioni proposte per il pagamento "a lezioni"
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState('');
  const [esito, setEsito] = useState(null);
  const [vista3, setVista3] = useState('incassa');   // incassa | dopo
  const [testo, setTesto] = useState('');
  // computer: le tre colonne finiscono al fondo dello schermo (l'altezza dipende da cosa c'è sopra)
  const griglia = useRef(null);
  useEffect(() => {
    const misura = () => { const g = griglia.current; if (g) g.style.setProperty('--sp-alto', `${Math.round(g.getBoundingClientRect().top + window.scrollY + 16)}px`); };
    misura(); window.addEventListener('resize', misura);
    return () => window.removeEventListener('resize', misura);
  }, []);

  const stagione = (() => { const d = new Date(); const m = d.getMonth() + 1; return m >= (palestra.mese_inizio_stagione || 9) ? d.getFullYear() : d.getFullYear() - 1; })();
  const quotaCent = palestra.quota_iscrizione_cent || 0;
  const corso = corsi.find((c) => c.id === v.corso_id);
  const tipo = tipi.find((t) => t.id === v.tipo_id);
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  // da quando parte un abbonamento a quel corso: il giorno dopo la fine di quello in corso, altrimenti oggi
  const inizioPer = (corsoId, sit = s) => {
    const fine = (sit?.iscrizioni || []).filter((i) => i.corso_id === corsoId && i.stato === 'attiva' && i.data_fine >= oggi())
      .reduce((m, i) => (i.data_fine > m ? i.data_fine : m), '');
    return fine ? piuGiorni(fine, 1) : oggi();
  };

  // ------------------------------------------------------------ situazione della persona
  async function carica(id) {
    const sb = supabaseBrowser();
    const [{ data: persona }, { data: dati }, { data: iscrizioni }, { data: tess }] = await Promise.all([
      sb.from('v_stato_clienti').select('id, nome, cognome, data_nascita, is_titolare, titolare_nome, titolare_cognome, email, telefono, attivo, fine_prossima, ultima_fine, certificato_scadenza, quota_valida_fino, consenso_whatsapp, account_id, stato')
        .eq('id', id).maybeSingle(),
      sb.from('allievi').select('id, codice_fiscale, sesso, luogo_nascita, tessera, account ( nome, cognome, indirizzo, cap, citta, provincia, codice_fiscale )').eq('id', id).maybeSingle(),
      sb.from('iscrizioni').select('id, corso_id, tipo_abbonamento_id, data_inizio, data_fine, stato, ingressi_residui, corsi ( nome ), tipi_abbonamento ( nome, modalita ), iscrizioni_orari ( orario_id )')
        .eq('allievo_id', id).order('data_inizio', { ascending: false }).limit(8),
      sb.from('tesseramenti').select('stagione, stato, numero').eq('allievo_id', id).order('stagione', { ascending: false }).limit(1),
    ]);
    const nuovo = { persona, dati, iscrizioni: iscrizioni || [], tessera: (tess || [])[0] || null };
    setS(nuovo);
    return nuovo;
  }

  // prepara la vendita: "come l'ultima volta" (stesso corso, abbonamento e giorni, dal giorno dopo la fine)
  function preparaVendita(sit) {
    const oggiISO = oggi();
    const ultima = sit.iscrizioni.find((i) => i.stato === 'attiva' || i.stato === 'scaduta');
    const t = ultima && tipi.find((x) => x.id === ultima.tipo_abbonamento_id);
    const orariOk = ultima ? (ultima.iscrizioni_orari || []).map((o) => o.orario_id).filter((oid) => orari.some((o) => o.id === oid)) : [];
    const dal = ultima ? inizioPer(ultima.corso_id, sit) : oggiISO;
    const quotaServe = !sit.persona?.quota_valida_fino || sit.persona.quota_valida_fino < oggiISO;
    setV({
      ...VENDITA,
      quota: quotaServe && quotaCent > 0, quotaImporto: euroTesto(quotaCent),
      corso_id: ultima && corsi.some((c) => c.id === ultima.corso_id) ? ultima.corso_id : '',
      tipo_id: t ? t.id : '', orari: orariOk, data_inizio: dal, prezzo: t ? euroTesto(t.prezzo_cent) : '',
      email: sit.persona?.email || '', inviaEmail: !!sit.persona?.email,
    });
    setEsito(null); setErrore(''); setVista3('incassa');
  }

  async function scegli(id) {
    setPersonaId(id); setModo('persona'); setS(null);
    const sit = await carica(id);
    preparaVendita(sit);
    try { window.history.replaceState(null, '', `/gestione/sportello?persona=${id}`); } catch { /* niente */ }
  }
  useEffect(() => { if (personaIniziale) scegli(personaIniziale); }, []); // eslint-disable-line

  function nuovaRicerca() {
    setModo('cerca'); setPersonaId(null); setS(null); setV(VENDITA); setEsito(null); setErrore('');
    try { window.history.replaceState(null, '', '/gestione/sportello'); } catch { /* niente */ }
  }

  // ------------------------------------------------------------ lezioni del corso (prossimi 14 giorni)
  useEffect(() => {
    if (!v.corso_id) { setLezioni([]); return; }
    let vivo = true;
    (async () => {
      const sb = supabaseBrowser();
      const { data } = await sb.from('v_occupazione').select('lezione_id, data, inizio, fine, capienza, iscritti, prove, stato, sala_nome')
        .eq('corso_id', v.corso_id).eq('stato', 'programmata').gte('data', oggi()).lte('data', piuGiorni(oggi(), 14))
        .order('inizio').limit(10);
      const ids = (data || []).map((l) => l.lezione_id);
      const { data: lo } = ids.length ? await sb.from('lezioni').select('id, orario_id').in('id', ids) : { data: [] };
      if (vivo) setLezioni((data || []).map((l) => ({ ...l, orario_id: lo?.find((x) => x.id === l.lezione_id)?.orario_id })));
    })();
    return () => { vivo = false; };
  }, [v.corso_id]);

  // ------------------------------------------------------------ prezzo proposto
  const dopoIlPrimo = aMese(tipo) && /^\d{4}-\d{2}-\d{2}$/.test(v.data_inizio) && !v.data_inizio.endsWith('-01');
  useEffect(() => {
    if (!dopoIlPrimo) { setRimaste(null); return; }
    if (v.orari.length) {
      supabaseBrowser().rpc('lezioni_rimaste_mese', { p_orari: v.orari, p_dal: v.data_inizio }).then(({ data }) => setRimaste(data || null));
    } else {
      const tot = Number(fineMese(v.data_inizio).slice(8, 10));
      setRimaste({ mese: tot, rimaste: tot - Number(v.data_inizio.slice(8, 10)) + 1, giorni: true });
    }
  }, [dopoIlPrimo, v.data_inizio, v.orari.join(',')]); // eslint-disable-line
  const proposte = useMemo(() => {
    if (!tipo) return [];
    const out = [];
    const mesi = Math.max(1, tipo.durata_mesi || 1);
    const prezzoMese = Math.round(tipo.prezzo_cent / mesi);
    if (dopoIlPrimo && rimaste && rimaste.mese > 0 && rimaste.rimaste < rimaste.mese) {
      const p = Math.round(((tipo.prezzo_cent - prezzoMese) + (prezzoMese * rimaste.rimaste) / rimaste.mese) / 100) * 100;
      out.push([p, `metà mese: restano ${rimaste.rimaste} ${rimaste.giorni ? 'giorni' : 'lezioni'} su ${rimaste.mese}`]);
    }
    const annuale = tipo.modalita !== 'ingressi' && (tipo.durata_mesi || 0) >= 9 && /^\d{4}-\d{2}-\d{2}$/.test(v.data_inizio);
    if (annuale) {
      const fine = palestra.mese_fine_stagione || 7, ini = palestra.mese_inizio_annuale || 10;
      const mesiAnno = ((fine - ini + 12) % 12) + 1; const m = Number(v.data_inizio.slice(5, 7));
      const persi = ini <= fine ? (m > ini && m <= fine ? m - ini : 0) : (m > ini ? m - ini : m <= fine ? m + 12 - ini : 0);
      if (persi > 0) out.push([tipo.prezzo_cent - Math.round((tipo.prezzo_cent / mesiAnno) * persi / 100) * 100, `parte ${persi} ${persi === 1 ? 'mese' : 'mesi'} dopo l'inizio dell'anno`]);
    }
    const attivi = (s?.iscrizioni || []).filter((i) => i.stato === 'attiva' && i.data_fine >= oggi() && i.corso_id !== v.corso_id).length;
    const sc = palestra.sconti || {};
    const pct = attivi >= 2 ? sc.piu_corsi_3 : attivi === 1 ? sc.piu_corsi_2 : 0;
    if (pct > 0) out.push([Math.round(tipo.prezzo_cent * (100 - pct) / 100), `sconto ${pct}% (${attivi >= 2 ? 'dal terzo corso' : 'secondo corso'})`]);
    return out;
  }, [tipo, dopoIlPrimo, rimaste, v.data_inizio, v.corso_id, s, palestra]);

  // ------------------------------------------------------------ pagamento "a lezioni" (es. settembre: si paga da quando si comincia)
  // il corso ha tanti giorni quanti ne prevede l'abbonamento (es. un solo orario e "1 volta"): si scelgono da soli
  useEffect(() => {
    if (!tipo || v.orari.length || !(tipo.modalita === 'orari_fissi' || v.aLezioni)) return;
    const ids = orari.filter((o) => o.corso_id === v.corso_id).map((o) => o.id);
    if (ids.length && ids.length <= (tipo.lezioni_settimanali || 1)) setV((x) => ({ ...x, orari: ids }));
  }, [v.tipo_id, v.corso_id, v.aLezioni]); // eslint-disable-line
  // lezioni proposte fra Dal e Al: sui giorni scelti; se non sono ancora scelti, una stima sui giorni del corso
  useEffect(() => {
    const delCorso = orari.filter((o) => o.corso_id === v.corso_id).map((o) => o.id);
    const giorni = v.orari.length ? v.orari : delCorso;
    if (!v.aLezioni || !giorni.length || !v.data_inizio || !v.al) { setContate(null); return undefined; }
    let vivo = true;
    supabaseBrowser().rpc('conta_lezioni', { p_orari: giorni, p_dal: v.data_inizio, p_al: v.al }).then(({ data }) => {
      if (!vivo || data == null) { if (vivo) setContate(null); return; }
      if (v.orari.length) setContate({ n: data, stima: false });
      else setContate({ n: Math.round(data * Math.min(tipo?.lezioni_settimanali || 1, giorni.length) / giorni.length), stima: true });
    });
    return () => { vivo = false; };
  }, [v.aLezioni, v.orari.join(','), v.corso_id, v.data_inizio, v.al, v.tipo_id]); // eslint-disable-line
  const euroLezDefault = !tipo ? null : tipo.num_ingressi > 0 ? Math.round(tipo.prezzo_cent / tipo.num_ingressi)
    : tipo.lezioni_settimanali > 0 ? Math.round(tipo.prezzo_cent / Math.max(1, tipo.durata_mesi || 1) / (4 * tipo.lezioni_settimanali)) : null;
  // le lezioni proposte restano in grigio finché la segreteria non le conferma (scrivendole o con ✓)
  const nLezioni = v.nLez !== '' && Number.isInteger(Number(v.nLez)) ? Number(v.nLez) : null;
  const importoProposto = contate && euroLezDefault != null ? Math.round(contate.n * (v.euroLez !== '' ? centDa(v.euroLez) ?? euroLezDefault : euroLezDefault)) : null;
  const euroLez = v.euroLez !== '' ? centDa(v.euroLez) : euroLezDefault;
  const importoLezioni = nLezioni != null && euroLez != null ? Math.round(nLezioni * euroLez) : null;
  const prezzoCent = !tipo ? 0 : v.aLezioni && !v.prezzoMano ? importoLezioni : centDa(v.prezzo);
  const quotaImportoCent = v.quota ? centDa(v.quotaImporto) ?? quotaCent : 0;
  const totale = (v.quota ? quotaImportoCent || 0 : 0) + (tipo ? prezzoCent || 0 : 0);
  const orariCorso = orari.filter((o) => o.corso_id === v.corso_id);
  const nelleSueOre = (l) => tipo?.modalita === 'orari_fissi' && v.orari.includes(l.orario_id) && l.data >= (v.data_inizio || oggi())
    && !(v.aLezioni && v.al && l.data > v.al);

  // ------------------------------------------------------------ conferma
  async function conferma() {
    setErrore('');
    if (tipo && !v.corso_id) { setErrore('Scegli il corso.'); return; }
    if (v.corso_id && !tipo && !v.lezioni.length) { setErrore('Scegli l\'abbonamento (o togli il corso).'); return; }
    if (tipo?.modalita === 'orari_fissi' && !v.orari.length) { setErrore('Scegli almeno un giorno: è quello che la fa comparire in appello.'); return; }
    if (tipo && v.aLezioni && (!v.al || v.al < v.data_inizio)) { setErrore('A lezioni: scegli fino a quando vale (la data "Al").'); return; }
    if (tipo && v.aLezioni && nLezioni == null && !v.prezzoMano) { setErrore('A lezioni: conferma il numero di lezioni (scrivilo o tocca ✓).'); return; }
    if (tipo && v.aLezioni && prezzoCent == null) { setErrore('A lezioni: scrivi quanto costa una lezione (o l\'importo).'); return; }
    if (tipo && (prezzoCent == null || prezzoCent < 0)) { setErrore('Controlla il prezzo dell\'abbonamento.'); return; }
    if (!v.quota && !tipo && !v.certificato && !v.lezioni.length) { setErrore('Non c\'è niente da confermare: scegli quota, abbonamento, certificato o una lezione.'); return; }
    if (v.ricevuta && v.inviaEmail && totale > 0 && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email.trim())) { setErrore('Scrivi un\'email valida per la ricevuta (o togli "inviala per email").'); return; }
    setInvio(true);
    const { data, error } = await supabaseBrowser().rpc('sportello_conferma', {
      p: {
        palestra_id: palestraId, allievo_id: personaId,
        quota: v.quota, quota_cent: quotaImportoCent,
        tipo_abbonamento_id: tipo ? tipo.id : null, corso_id: v.corso_id || null, data_inizio: v.data_inizio || oggi(),
        orari: tipo?.modalita === 'orari_fissi' ? v.orari : [], prezzo_cent: tipo ? prezzoCent : null,
        ingressi: tipo?.modalita === 'ingressi' && v.aLezioni && nLezioni != null ? nLezioni
          : tipo?.modalita === 'ingressi' && v.ingressi !== '' && Number(v.ingressi) !== tipo.num_ingressi ? Number(v.ingressi) : null,
        data_fine: tipo && v.aLezioni && v.al ? v.al : null,
        note: v.note, certificato_scadenza: v.certificato || null, lezioni: v.lezioni,
        metodo: v.metodo, ricevuta: v.ricevuta, invia_email: v.ricevuta && v.inviaEmail, email: v.email.trim(),
      },
    });
    setInvio(false);
    if (error) {
      const k = Object.keys(ERRORI).find((x) => error.message?.includes(x));
      setErrore(ERRORI[k] || `Non riuscito: ${error.message}`);
      return;
    }
    const { data: ric } = data.ricevute?.length
      ? await supabaseBrowser().from('ricevute').select('id, numero, anno, importo_cent, iva_cent, descrizione').in('id', data.ricevute)
      : { data: [] };
    const fatto = { ...data, ricevuteDati: ric || [], totale, corso, tipo, metodo: v.metodo };
    const sit = await carica(personaId);
    preparaVendita(sit);
    setV((x) => ({ ...x, corso_id: corso?.id || x.corso_id, tipo_id: '', orari: [], prezzo: '', lezioni: [], quota: false }));
    setEsito(fatto); setVista3('dopo');
  }

  // ============================================================ colonne
  return (
    <div className="sportello">
      <div className="spt-testa">
        <h1>Sportello</h1>
        <span className="muto">Cerca o inserisci il cliente · scegli cosa prende · incassa: ricevuta, email e posto a lezione con un clic.</span>
      </div>
      <div className="sp-griglia" ref={griglia}>
        {/* ---------------------------------------------- 1 · chi */}
        <section className="sp-col" aria-label="Cliente">
          <div className="sp-col-titolo"><span className="sp-num">1</span>Cliente</div>
          {modo === 'cerca' && <Cerca palestraId={palestraId} testo={testo} setTesto={setTesto} onScegli={scegli} onNuovo={() => setModo('nuovo')} />}
          {modo === 'nuovo' && <NuovoCliente palestraId={palestraId} testoIniziale={testo} onCreato={scegli} onUsa={scegli} onAnnulla={() => setModo('cerca')} />}
          {modo === 'persona' && (s ? <Situazione s={s} v={v} setV={setV} onCambia={nuovaRicerca} onRinnova={(i) => {
            const t = tipi.find((x) => x.id === i.tipo_abbonamento_id);
            setV((x) => ({ ...x, corso_id: i.corso_id, tipo_id: t?.id || '', prezzo: t ? euroTesto(t.prezzo_cent) : '',
              orari: (i.iscrizioni_orari || []).map((o) => o.orario_id).filter((oid) => orari.some((o) => o.id === oid)),
              data_inizio: i.data_fine >= oggi() ? piuGiorni(i.data_fine, 1) : oggi(), lezioni: [] }));
            setEsito(null); setVista3('incassa');
          }} /> : <p className="muto">Carico…</p>)}
        </section>

        {/* ---------------------------------------------- 2 · cosa prende */}
        <section className={`sp-col${modo !== 'persona' ? ' sp-spento' : ''}`} aria-label="Cosa prende">
          <div className="sp-col-titolo"><span className="sp-num">2</span>Cosa prende</div>
          {modo !== 'persona' ? <p className="muto">Prima scegli il cliente.</p> : (
            <div className="sp-vendita">
              <div className={`sp-blocco${v.quota ? ' scelto' : ''}`}>
                <label className="spunta"><input type="checkbox" checked={v.quota} onChange={set('quota')} />
                  <span><b>Quota associativa annuale</b>
                    <span className="piccolo muto"> · {s?.persona?.quota_valida_fino
                      ? (s.persona.quota_valida_fino < oggi() ? `scaduta il ${dataBreve(s.persona.quota_valida_fino)}` : `valida fino al ${dataBreve(s.persona.quota_valida_fino)}`)
                      : 'mai pagata'}</span></span>
                </label>
                {v.quota && <div className="sp-importo"><input inputMode="decimal" value={v.quotaImporto} onChange={set('quotaImporto')} aria-label="Importo quota" /> €</div>}
              </div>

              <div className={`sp-blocco${tipo ? ' scelto' : ''}`}>
                <div className="sp-blocco-testa"><b>Abbonamento</b>
                  {(v.corso_id || v.tipo_id) && <button type="button" className="link-btn piccolo" onClick={() => setV((x) => ({ ...x, corso_id: '', tipo_id: '', orari: [], prezzo: '', lezioni: [] }))}>togli</button>}
                </div>
                <div className="sp-corso-tipo">
                  <div className="campo"><label htmlFor="sp-corso">Corso</label>
                    <CampoCerca id="sp-corso" valore={v.corso_id} placeholder="Scrivi il corso… (es. pole 1)"
                                onChange={(id) => setV((x) => ({ ...x, corso_id: id, orari: [], lezioni: [], data_inizio: inizioPer(id),
                                  tipo_id: x.tipo_id && tipi.find((t) => t.id === x.tipo_id)?.tipi_abbonamento_corsi?.some((c) => c.corso_id === id) ? x.tipo_id : '' }))}
                                opzioni={corsi.map((c) => ({ value: c.id, label: c.nome }))} />
                  </div>
                  <div className="campo"><label htmlFor="sp-tipo">Tipo</label>
                    {(() => {
                      const adatti = v.corso_id ? tipi.filter((t) => t.tipi_abbonamento_corsi?.some((x) => x.corso_id === v.corso_id)) : [];
                      const altri = tipi.filter((t) => !adatti.includes(t));
                      const voce = (t, gruppo) => ({ value: t.id, label: t.nome, extra: euro(t.prezzo_cent), gruppo });
                      const opzioni = [...adatti.map((t) => voce(t, 'Valgono per questo corso')), ...altri.map((t) => voce(t, adatti.length ? `Altri · ${t.famiglia || 'altri'}` : t.famiglia || 'Altri'))];
                      return <CampoCerca id="sp-tipo" valore={v.tipo_id} placeholder="es. mensile 1 volta"
                                         onChange={(id) => { const t = tipi.find((x) => x.id === id); setV((x) => ({ ...x, tipo_id: id, prezzo: t ? euroTesto(t.prezzo_cent) : '', ingressi: t?.modalita === 'ingressi' ? String(t.num_ingressi || '') : '', nLez: '', euroLez: '', prezzoMano: false })); }}
                                         opzioni={opzioni} />;
                    })()}
                  </div>
                </div>
                {v.corso_id && (tipo?.modalita === 'orari_fissi' || (tipo && v.aLezioni)) && (
                  <div className="sp-chip-riga" role="group" aria-label="Giorni">
                    <span className="piccolo muto">Giorni:</span>
                    {orariCorso.length === 0 && <span className="piccolo muto">il corso non ha orari</span>}
                    {orariCorso.map((o) => (
                      <button type="button" key={o.id} aria-pressed={v.orari.includes(o.id)} className={`sp-chip${v.orari.includes(o.id) ? ' attivo' : ''}`}
                              onClick={() => setV((x) => ({ ...x, orari: x.orari.includes(o.id) ? x.orari.filter((y) => y !== o.id) : [...x.orari, o.id] }))}>
                        {GIORNI[o.giorno_settimana]} {String(o.ora_inizio).slice(0, 5)}
                      </button>
                    ))}
                  </div>
                )}
                {tipo && (
                  <div className="sp-modo-prezzo" role="radiogroup" aria-label="Come si paga">
                    <span className="piccolo muto">Si paga:</span>
                    <button type="button" role="radio" aria-checked={!v.aLezioni} className={!v.aLezioni ? 'attivo' : ''}
                            onClick={() => setV((x) => ({ ...x, aLezioni: false, prezzoMano: false }))}>a listino</button>
                    <button type="button" role="radio" aria-checked={v.aLezioni} className={v.aLezioni ? 'attivo' : ''}
                            onClick={() => setV((x) => ({ ...x, aLezioni: true, prezzoMano: false, al: x.al || (x.data_inizio ? fineMese(x.data_inizio) : '') }))}>a lezioni (calcola)</button>
                  </div>
                )}
                {tipo && !v.aLezioni && (
                  <div className="sp-campi-3">
                    <Data id="sp-dal" etichetta="Dal" futura valore={v.data_inizio} onChange={(d) => setV((x) => ({ ...x, data_inizio: d }))} />
                    {tipo.modalita === 'ingressi' && (
                      <div className="campo"><label htmlFor="sp-ingr">Lezioni</label><input id="sp-ingr" inputMode="numeric" value={v.ingressi} onChange={set('ingressi')} title="Si possono contare a mano" /></div>
                    )}
                    <div className="campo"><label htmlFor="sp-prezzo">Prezzo (€) <span className="eti-info">listino {euro(tipo.prezzo_cent)}</span></label>
                      <input id="sp-prezzo" inputMode="decimal" value={v.prezzo} onChange={set('prezzo')} />
                    </div>
                  </div>
                )}
                {tipo && v.aLezioni && (
                  <div className="sp-a-lezioni">
                    <div className="sp-campi-2">
                      <Data id="sp-dal" etichetta="Dal" futura valore={v.data_inizio} onChange={(d) => setV((x) => ({ ...x, data_inizio: d }))} />
                      <Data id="sp-al" etichetta="Al (vale fino a)" futura valore={v.al} onChange={(d) => setV((x) => ({ ...x, al: d }))} />
                    </div>
                    <div className="sp-calcolo">
                      <div className="campo"><label htmlFor="sp-nlez">Lezioni</label>
                        <div className="sp-proposta">
                          <input id="sp-nlez" inputMode="numeric" value={v.nLez} placeholder={contate ? String(contate.n) : '?'}
                                 onChange={(e) => setV((x) => ({ ...x, nLez: e.target.value.replace(/\D/g, ''), prezzoMano: false }))}
                                 onKeyDown={(e) => { if (e.key === 'Enter' && v.nLez === '' && contate) { e.preventDefault(); setV((x) => ({ ...x, nLez: String(contate.n), prezzoMano: false })); } }} />
                          {contate && v.nLez === '' && (
                            <button type="button" className="sp-conferma-n" title={`Conferma ${contate.n} lezioni`} aria-label={`Conferma ${contate.n} lezioni`}
                                    onClick={() => setV((x) => ({ ...x, nLez: String(contate.n), prezzoMano: false }))}>✓</button>
                          )}
                        </div>
                      </div>
                      <span className="sp-per" aria-hidden="true">×</span>
                      <div className="campo"><label htmlFor="sp-eurolez">€ a lezione</label>
                        <input id="sp-eurolez" inputMode="decimal" value={v.euroLez !== '' ? v.euroLez : euroTesto(euroLezDefault)} placeholder="?"
                               onChange={(e) => setV((x) => ({ ...x, euroLez: e.target.value, prezzoMano: false }))} />
                      </div>
                      <span className="sp-per" aria-hidden="true">=</span>
                      <div className="campo"><label htmlFor="sp-prezzo">Importo (€)</label>
                        <input id="sp-prezzo" inputMode="decimal" value={v.prezzoMano ? v.prezzo : euroTesto(importoLezioni)} placeholder={euroTesto(importoProposto) || ''}
                               onChange={(e) => setV((x) => ({ ...x, prezzo: e.target.value, prezzoMano: true }))} />
                      </div>
                    </div>
                    <p className="piccolo muto sp-calcolo-nota">
                      {contate && v.nLez === '' ? (contate.stima
                          ? `Circa ${contate.n} lezioni dal ${dataBreve(v.data_inizio)} al ${dataBreve(v.al)}: scegli i giorni per il numero esatto, poi confermalo (✓ o scrivilo).`
                          : `Dal ${dataBreve(v.data_inizio)} al ${dataBreve(v.al)} ci sono ${contate.n} lezioni (chiusure escluse): confermale con ✓ o scrivi il numero giusto.`)
                        : v.nLez !== '' ? (contate && !contate.stima && Number(v.nLez) !== contate.n ? `Scritte a mano: dal calendario sarebbero ${contate.n}.` : 'Lezioni confermate.')
                        : 'Scrivi quante lezioni fa (o scegli i giorni qui sopra per contarle).'}
                      {' '}{euroLezDefault != null && v.euroLez === '' && `Una lezione a listino: ${euro(euroLezDefault)}.`}
                      {(v.nLez !== '' || v.euroLez !== '' || v.prezzoMano) && (
                        <> <button type="button" className="link-btn piccolo" onClick={() => setV((x) => ({ ...x, nLez: '', euroLez: '', prezzoMano: false }))}>ricalcola</button></>
                      )}
                    </p>
                    <p className="piccolo sp-calcolo-nota">L&apos;abbonamento vale dal {v.data_inizio ? dataBreve(v.data_inizio) : '…'} al {v.al ? dataBreve(v.al) : '…'}.</p>
                  </div>
                )}
                {tipo && !v.aLezioni && proposte.length > 0 && (
                  <div className="sp-proposte">
                    {proposte.map(([p, perche]) => (
                      <button type="button" key={perche} className="link-btn piccolo" onClick={() => setV((x) => ({ ...x, prezzo: euroTesto(p) }))}>usa {euro(p)} <span className="muto">({perche})</span></button>
                    ))}
                  </div>
                )}
                {tipo && <div className="campo sp-nota"><input value={v.note} onChange={set('note')} placeholder="Nota (facoltativa)" aria-label="Nota" /></div>}
              </div>

              <div className={`sp-blocco${v.certificato ? ' scelto' : ''}`}>
                <div className="sp-blocco-testa"><b>Certificato medico</b>
                  <span className="piccolo muto">{s?.persona?.certificato_scadenza ? `ora: ${s.persona.certificato_scadenza < oggi() ? 'scaduto il' : 'fino al'} ${dataBreve(s.persona.certificato_scadenza)}` : 'ora: mancante'}</span>
                </div>
                <div className="sp-campi-2">
                  <Data id="sp-cert" etichetta="Ha portato il nuovo: scade il" futura valore={v.certificato} onChange={(d) => setV((x) => ({ ...x, certificato: d }))} />
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ---------------------------------------------- 3 · posto e incasso */}
        <section className={`sp-col${modo !== 'persona' ? ' sp-spento' : ''}`} aria-label="Posto e incasso">
          <div className="sp-col-titolo"><span className="sp-num">3</span>{vista3 === 'dopo' ? 'Fatto' : 'Posto a lezione e incasso'}
            {modo === 'persona' && (
              <span className="sp-linguette">
                <button type="button" className={vista3 === 'incassa' ? 'attiva' : ''} onClick={() => setVista3('incassa')}>Incassa</button>
                <button type="button" className={vista3 === 'dopo' ? 'attiva' : ''} onClick={() => setVista3('dopo')}>WhatsApp e tessera</button>
              </span>
            )}
          </div>
          {modo !== 'persona' ? <p className="muto">Prima scegli il cliente.</p> : vista3 === 'incassa' ? (
            <div className="sp-incassa">
              <div className="sp-blocco">
                <div className="sp-blocco-testa"><b>Prenota il posto</b>{corso && <span className="piccolo muto">{corso.nome} · prossimi 14 giorni</span>}</div>
                {!v.corso_id && <p className="piccolo muto">Scegli un corso per vedere le lezioni.</p>}
                {v.corso_id && lezioni.length === 0 && <p className="piccolo muto">Nessuna lezione nei prossimi 14 giorni.</p>}
                <ul className="sp-lezioni">
                  {lezioni.map((l) => {
                    const posti = l.capienza ? Math.max(l.capienza - l.iscritti - l.prove, 0) : null;
                    const auto = nelleSueOre(l);
                    const scelta = v.lezioni.includes(l.lezione_id);
                    return (
                      <li key={l.lezione_id}>
                        <label className={`sp-lezione${scelta || auto ? ' scelta' : ''}${posti === 0 ? ' piena' : ''}`}>
                          <input type="checkbox" disabled={auto} checked={scelta || auto}
                                 onChange={() => setV((x) => ({ ...x, lezioni: x.lezioni.includes(l.lezione_id) ? x.lezioni.filter((y) => y !== l.lezione_id) : [...x.lezioni, l.lezione_id] }))} />
                          <span className="sp-lez-quando">{nomeGiorno(l.data)} {Number(l.data.slice(8, 10))}/{Number(l.data.slice(5, 7))} · {ora(l.inizio)}</span>
                          <span className="sp-lez-posti">{auto ? 'nei suoi giorni' : tipo && v.data_inizio && l.data < v.data_inizio ? 'prima dell\'inizio' : posti === null ? `${l.iscritti} iscritti` : posti === 0 ? 'piena' : `${posti} ${posti === 1 ? 'posto' : 'posti'}`}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="sp-blocco sp-cassa">
                <div className="sp-totale">
                  <span>Totale</span><strong>{euro(totale)}</strong>
                </div>
                <div className="sp-righe-totale piccolo muto">
                  {v.quota && <span>Quota {euro(quotaImportoCent || 0)}</span>}
                  {tipo && <span>{tipo.nome} {euro(prezzoCent || 0)}</span>}
                </div>
                {totale > 0 && (
                  <>
                    <div className="sp-metodi" role="radiogroup" aria-label="Come paga">
                      {METODI.map(([k, t]) => (
                        <button type="button" key={k} role="radio" aria-checked={v.metodo === k} className={v.metodo === k ? 'attivo' : ''} onClick={() => setV((x) => ({ ...x, metodo: k }))}>{t}</button>
                      ))}
                    </div>
                    <label className="spunta"><input type="checkbox" checked={v.ricevuta} onChange={set('ricevuta')} /><span>Emetti la ricevuta</span></label>
                    {v.ricevuta && (
                      <div className="sp-email">
                        <label className="spunta"><input type="checkbox" checked={v.inviaEmail} onChange={set('inviaEmail')} /><span>Inviala per email a</span></label>
                        <input type="email" value={v.email} onChange={set('email')} disabled={!v.inviaEmail} aria-label="Email per la ricevuta" placeholder="email" />
                      </div>
                    )}
                  </>
                )}
                {errore && <div className="errore" role="alert">{errore}</div>}
                <button type="button" className="btn btn-primario sp-conferma" disabled={invio} onClick={conferma}>
                  {invio ? 'Registro…' : totale > 0 ? `Conferma e incassa ${euro(totale)}` : 'Conferma'}
                </button>
              </div>
            </div>
          ) : (
            <Dopo esito={esito} s={s} corso={esito?.corso || corso} palestra={palestra} palestraId={palestraId} stagione={stagione} lezioni={lezioni}
                  onRicarica={() => carica(personaId)} onAncora={() => { preparaVendita(s); }} onProssimo={nuovaRicerca} />
          )}
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 1 · cerca (filtri progressivi, in tempo reale)
function Cerca({ palestraId, testo, setTesto, onScegli, onNuovo }) {
  const [filtro, setFiltro] = useState('tutti');
  const [trovati, setTrovati] = useState([]);
  const [totale, setTotale] = useState(0);
  const [attivo, setAttivo] = useState(0);
  const [cerco, setCerco] = useState(false);
  const campo = useRef(null);
  const ultima = useRef(0);
  useEffect(() => { campo.current?.focus(); }, []);

  useEffect(() => {
    const t = testo.trim();
    if (t.length < 2 && filtro === 'tutti') { setTrovati([]); setTotale(0); return undefined; }
    const timer = setTimeout(async () => {
      const n = ++ultima.current; setCerco(true);
      let q = supabaseBrowser().from('v_stato_clienti')
        .select('id, nome, cognome, data_nascita, telefono, attivo, fine_prossima, ultima_fine, certificato_scadenza, quota_valida_fino, is_titolare, titolare_nome, titolare_cognome', { count: 'exact' })
        .eq('palestra_id', palestraId);
      if (t.length >= 2) q = applicaRicerca(q, t);
      if (filtro === 'attivi') q = q.eq('attivo', true);
      if (filtro === 'scaduti') q = q.eq('attivo', false).not('ultima_fine', 'is', null);
      if (filtro === 'certificato') q = q.or(`certificato_scadenza.is.null,certificato_scadenza.lt.${oggi()}`).eq('attivo', true);
      const { data, count } = await q.order('cognome').order('nome').limit(12);
      if (n !== ultima.current) return;
      setTrovati(data || []); setTotale(count || 0); setAttivo(0); setCerco(false);
    }, 180);
    return () => clearTimeout(timer);
  }, [testo, filtro, palestraId]);

  return (
    <div className="sp-cerca">
      <input ref={campo} type="search" value={testo} onChange={(e) => setTesto(e.target.value)} autoComplete="off"
             placeholder="Nome, cognome, iniziali, telefono o email" aria-label="Cerca il cliente"
             onKeyDown={(e) => {
               if (e.key === 'ArrowDown') { e.preventDefault(); setAttivo((a) => Math.min(a + 1, trovati.length - 1)); }
               if (e.key === 'ArrowUp') { e.preventDefault(); setAttivo((a) => Math.max(a - 1, 0)); }
               if (e.key === 'Enter' && trovati.length) { e.preventDefault(); onScegli(trovati[attivo].id); }
             }} />
      <div className="sp-filtri" role="radiogroup" aria-label="Filtra">
        {FILTRI.map(([k, t]) => (
          <button type="button" key={k} role="radio" aria-checked={filtro === k} className={filtro === k ? 'attivo' : ''} onClick={() => { setFiltro(k); campo.current?.focus(); }}>{t}</button>
        ))}
      </div>
      <ul className="sp-risultati" role="listbox" aria-label="Clienti trovati">
        {trovati.map((p, i) => {
          const certOk = p.certificato_scadenza && p.certificato_scadenza >= oggi();
          const anni = eta(p.data_nascita);
          return (
            <li key={p.id} role="option" aria-selected={i === attivo}>
              <button type="button" className={i === attivo ? 'attivo' : ''} onClick={() => onScegli(p.id)} onMouseEnter={() => setAttivo(i)}>
                <span className="sp-ris-nome"><b>{p.cognome} {p.nome}</b>{anni != null && <span className="muto"> · {anni} anni</span>}</span>
                <span className="sp-ris-info piccolo">
                  <span className={`sp-pallino ${p.attivo ? 'ok' : 'no'}`}>{p.attivo ? `abb. fino al ${dataBreve(p.fine_prossima)}` : p.ultima_fine ? `finito il ${dataBreve(p.ultima_fine)}` : 'mai iscritto'}</span>
                  <span className={`sp-pallino ${certOk ? 'ok' : 'no'}`}>{certOk ? 'cert. ok' : 'cert. da sistemare'}</span>
                  {!p.is_titolare && p.titolare_nome && <span className="muto">genitore {p.titolare_nome}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {totale > trovati.length && <p className="piccolo muto">e altri {totale - trovati.length}: scrivi qualche lettera in più.</p>}
      {!cerco && testo.trim().length >= 2 && trovati.length === 0 && <p className="piccolo muto">Nessuno con &quot;{testo.trim()}&quot;.</p>}
      <button type="button" className={`btn sp-largo${testo.trim().length >= 2 && trovati.length === 0 && !cerco ? ' btn-primario' : ''}`} onClick={onNuovo}>
        + Nuovo cliente{testo.trim() ? `: ${testo.trim()}` : ''}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- 1 · situazione del cliente scelto
function Situazione({ s, v, setV, onCambia, onRinnova }) {
  const p = s.persona;
  if (!p) return <p className="muto">Persona non trovata. <button type="button" className="link-btn" onClick={onCambia}>Cerca di nuovo</button></p>;
  const o = oggi();
  const inCorso = s.iscrizioni.filter((i) => i.stato === 'attiva' && i.data_fine >= o);
  const finite = s.iscrizioni.filter((i) => !inCorso.includes(i) && (i.stato === 'attiva' || i.stato === 'scaduta')).slice(0, 2);
  const fineAbb = inCorso.reduce((m, i) => (i.data_fine > m ? i.data_fine : m), '');
  const cert = p.certificato_scadenza;
  const certStato = !cert ? ['no', 'mancante'] : cert < o ? ['no', `scaduto il ${dataBreve(cert)}`]
    : giorniTra(o, cert) <= 30 ? ['forse', `scade il ${dataBreve(cert)} (tra ${giorniTra(o, cert)} giorni)`]
    : fineAbb && cert < fineAbb ? ['forse', `fino al ${dataBreve(cert)}: scade prima dell'abbonamento`] : ['ok', `valido fino al ${dataBreve(cert)}`];
  const q = p.quota_valida_fino;
  const quotaStato = !q ? ['no', 'mai pagata'] : q < o ? ['no', `scaduta il ${dataBreve(q)}`]
    : giorniTra(o, q) <= 30 ? ['forse', `scade il ${dataBreve(q)}`] : ['ok', `valida fino al ${dataBreve(q)}`];
  const anni = eta(p.data_nascita);
  return (
    <div className="sp-situazione">
      <div className="sp-persona">
        <div>
          <div className="sp-persona-nome">{p.nome} {p.cognome}</div>
          <div className="piccolo muto">
            {[anni != null ? `${anni} anni` : null, !p.is_titolare && p.titolare_nome ? `genitore: ${p.titolare_nome} ${p.titolare_cognome || ''}` : null].filter(Boolean).join(' · ')}
          </div>
          <div className="piccolo">{[p.telefono, p.email].filter(Boolean).join(' · ') || <span className="sp-attenzione">nessun contatto</span>}</div>
        </div>
        <div className="sp-persona-azioni">
          <Link prefetch={false} href={`/gestione/persone/${p.id}`} className="link-btn piccolo" target="_blank">scheda ↗</Link>
          <button type="button" className="link-btn piccolo" onClick={onCambia}>cambia</button>
        </div>
      </div>
      <dl className="sp-stati">
        <div className={`sp-stato-riga ${quotaStato[0]}`}><dt>Quota annuale</dt><dd>{quotaStato[1]}</dd></div>
        <div className={`sp-stato-riga ${certStato[0]}`}><dt>Certificato</dt><dd>{certStato[1]}
          {certStato[0] !== 'ok' && !v.certificato && <span className="piccolo muto"> · se l&apos;ha portato scrivi la scadenza in 2</span>}</dd></div>
        <div className={`sp-stato-riga ${s.tessera?.stato === 'tesserato' ? 'ok' : 'forse'}`}><dt>Tessera</dt>
          <dd>{s.tessera?.stato === 'tesserato' ? `fatta${s.tessera.numero ? ` n. ${s.tessera.numero}` : ''} (${s.tessera.stagione}/${String(s.tessera.stagione + 1).slice(2)})` : s.tessera?.stato === 'inviato' ? 'inviata, da confermare' : 'da fare'}</dd></div>
        <div className={`sp-stato-riga ${p.consenso_whatsapp ? 'ok' : 'forse'}`}><dt>WhatsApp</dt><dd>{p.consenso_whatsapp ? 'sì ai gruppi' : p.consenso_whatsapp === false ? 'no ai gruppi' : 'non chiesto'}</dd></div>
      </dl>
      <div className="sp-abbonamenti">
        <div className="sp-blocco-testa"><b>Abbonamenti</b></div>
        {inCorso.length === 0 && finite.length === 0 && <p className="piccolo muto">Nessun abbonamento.</p>}
        {[...inCorso, ...finite].map((i) => (
          <div key={i.id} className={`sp-abb${inCorso.includes(i) ? '' : ' finito'}`}>
            <div>
              <b>{i.corsi?.nome}</b> <span className="muto">· {i.tipi_abbonamento?.nome}</span>
              <div className="piccolo">{inCorso.includes(i) ? 'fino al' : 'finito il'} {dataBreve(i.data_fine)}
                {i.tipi_abbonamento?.modalita === 'ingressi' && i.ingressi_residui != null && ` · ${i.ingressi_residui} lezioni rimaste`}
                {inCorso.includes(i) && giorniTra(o, i.data_fine) <= 10 && <span className="sp-attenzione"> · sta per finire</span>}
              </div>
            </div>
            <button type="button" className="btn btn-piccolo" onClick={() => onRinnova(i)}>Rinnova</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 3 · fatto: riepilogo, WhatsApp, tessera
function Dopo({ esito, s, corso, palestra, palestraId, stagione, lezioni, onRicarica, onAncora, onProssimo }) {
  return (
    <div className="sp-dopo">
      {esito && (
        <div className="sp-fatto" role="status">
          <div className="sp-fatto-titolo">✓ Registrato{esito.totale > 0 ? `: ${euro(esito.totale)} in ${METODI.find(([k]) => k === esito.metodo)?.[1].toLowerCase() || esito.metodo}` : ''}</div>
          <ul>
            {esito.iscrizione_id && <li>Abbonamento {esito.tipo?.nome} · {esito.corso?.nome}</li>}
            {esito.ricevuteDati.map((r) => (
              <li key={r.id}>Ricevuta n. {r.numero}/{r.anno} · {euro(r.importo_cent + (r.iva_cent || 0))} <Link prefetch={false} href={`/gestione/ricevute/${r.id}`} target="_blank" className="link-btn piccolo">apri ↗</Link></li>
            ))}
            {esito.email && <li>Ricevut{esito.ricevuteDati.length > 1 ? 'e' : 'a'} in invio a {esito.email} (entro pochi minuti)</li>}
            {(esito.lezioni || []).map((x) => {
              const l = lezioni.find((y) => y.lezione_id === x.lezione_id);
              const quando = l ? `${nomeGiorno(l.data)} ${Number(l.data.slice(8, 10))}/${Number(l.data.slice(5, 7))} ${ora(l.inizio)}` : 'lezione';
              const k = Object.keys(ESITI_LEZIONE).find((y) => String(x.esito).includes(y));
              return <li key={x.lezione_id} className={x.esito === 'ok' ? '' : 'sp-attenzione'}>Posto {quando}: {x.esito === 'ok' ? 'prenotato' : ESITI_LEZIONE[k] || x.esito}</li>;
            })}
            {(esito.avvisi || []).map((a) => <li key={a} className="sp-attenzione">{a}</li>)}
          </ul>
        </div>
      )}
      <GruppoWhatsApp persona={s?.persona} corso={corso} palestraNome={palestra.nome} />
      <TesseraEnte palestraId={palestraId} ente={palestra.ente || {}} persona={s?.persona} dati={s?.dati} tessera={s?.tessera?.stagione === stagione ? s.tessera : null}
                   stagione={stagione} onCambio={onRicarica} />
      <div className="sp-bottoni sp-fine">
        <button type="button" className="btn" onClick={onAncora}>Altro per {s?.persona?.nome}</button>
        <button type="button" className="btn btn-primario" onClick={onProssimo}>Prossimo cliente →</button>
      </div>
    </div>
  );
}
