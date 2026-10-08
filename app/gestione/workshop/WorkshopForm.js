'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import Immagine from '../Immagine';
import CampoTestoRicco from '../CampoTestoRicco';
import { Finestra } from '../Gestore';
import Dettaglio from '../../workshop/Dettaglio';
import { euro } from '@/lib/formato';
import { STATI_WORKSHOP } from '@/lib/workshop';

// Scheda di un workshop: dati e locandina, i momenti (date, sala, posti), le opzioni che si comprano con i prezzi
// a scaglioni (allievi ed esterni), le regole delle iscrizioni e il compenso dell'insegnante. Si salva tutto insieme.
const TZ = 'Europe/Rome';
const nuovoId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16)));
const dataLocale = (iso) => (iso ? new Date(iso).toLocaleDateString('sv-SE', { timeZone: TZ }) : '');
const oraLocale = (iso) => (iso ? new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: TZ }) : '');
const isoDa = (data, ora) => (data && ora ? new Date(`${data}T${ora}:00`).toISOString() : null);
const euroTesto = (cent) => (cent == null || cent === '' ? '' : (Number(cent) / 100).toString().replace('.', ','));
const centDa = (t) => {
  const s = String(t ?? '').trim().replace(/[€\s]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN;
};
const ERRORI = {
  titolo_mancante: 'Scrivi il titolo del workshop.',
  momenti_mancanti: 'Aggiungi almeno un momento (giorno e ora).',
  opzioni_mancanti: 'Aggiungi almeno un\'opzione con il suo prezzo.',
  momento_senza_data: 'Ogni momento ha bisogno di giorno e ora di inizio.',
  momento_fine_prima: 'In un momento l\'ora di fine è prima dell\'inizio.',
  opzione_senza_nome: 'Ogni opzione ha bisogno di un nome (es. "Weekend completo").',
  opzione_senza_momenti: 'Ogni opzione deve comprendere almeno un momento.',
  prezzo_mancante: 'Ogni opzione ha bisogno di almeno un prezzo per gli allievi.',
  non_autorizzato: 'Non hai i permessi per salvare.',
};

function momentoVuoto(i, primo) {
  const base = primo?.data || '';
  return { id: nuovoId(), titolo: i === 0 ? 'Workshop' : `Giorno ${i + 1}`, data: base, dalle: primo?.dalle || '15:00', alle: primo?.alle || '17:00', sala_id: primo?.sala_id || '', posti: primo?.posti || '' };
}
const scaglioneVuoto = () => ({ fino_al: '', allievi: '', esterni: '' });

export default function WorkshopForm({ palestraId, workshop = null, momenti = [], opzioni = [], sedi = [], sale = [], quotaCent = 0, iscrittiPerOpzione = {}, staffElenco = [], onSalvato, onAnnulla }) {
  const router = useRouter();
  const [f, setF] = useState(() => ({
    titolo: workshop?.titolo || '', sottotitolo: workshop?.sottotitolo || '', insegnante: workshop?.insegnante || '',
    insegnante_id: workshop?.insegnante_id || '',     // '' = esterno/a (nome scritto a mano)
    descrizione: workshop?.descrizione || '', info_pratiche: workshop?.info_pratiche || '', locandina_url: workshop?.locandina_url || null,
    sede_id: workshop?.sede_id || (sedi.length === 1 ? sedi[0].id : ''), luogo: workshop?.luogo || '',
    stato: workshop?.stato || 'bozza',
    iscrizioni_fino_data: dataLocale(workshop?.iscrizioni_fino), iscrizioni_fino_ora: oraLocale(workshop?.iscrizioni_fino),
    online: workshop ? workshop.online : true, in_segreteria: workshop ? workshop.in_segreteria : true,
    quota_esterni: workshop ? workshop.quota_esterni : true, certificato_richiesto: workshop ? workshop.certificato_richiesto : false,
    compenso_tipo: workshop?.compenso_tipo || '', compenso: workshop?.compenso_tipo === 'percentuale' ? (workshop?.compenso_percentuale ?? '') : euroTesto(workshop?.compenso_cent),
    note_interne: workshop?.note_interne || '',
  }));
  const [mm, setMm] = useState(() => (momenti.length ? momenti.map((m) => ({
    id: m.id, titolo: m.titolo, data: dataLocale(m.inizio), dalle: oraLocale(m.inizio), alle: oraLocale(m.fine), sala_id: m.sala_id || '', posti: m.posti ?? '',
  })) : [momentoVuoto(0)]));
  const [oo, setOo] = useState(() => (opzioni.length ? opzioni.map((o) => ({
    id: o.id, nome: o.nome, descrizione: o.descrizione || '', momenti: o.momenti || [], attiva: o.attiva !== false,
    prezzi: (o.prezzi || []).map((s) => ({ fino_al: s.fino_al || '', allievi: euroTesto(s.allievi), esterni: euroTesto(s.esterni) })),
  })) : null));
  // la prima opzione nasce con tutti i momenti
  useEffect(() => {
    if (oo === null) setOo([{ id: nuovoId(), nome: 'Workshop completo', descrizione: '', momenti: mm.map((m) => m.id), attiva: true, prezzi: [scaglioneVuoto()] }]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const [anteprima, setAnteprima] = useState(false);
  const rifErrore = useRef(null);
  useEffect(() => { if (errore) rifErrore.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, [errore]);

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const nomeStaff = (id) => { const t = staffElenco.find((x) => x.id === id); return t ? `${t.nome} ${t.cognome || ''}`.trim() : ''; };
  // gli insegnanti prima, poi il resto dello staff
  const staffOrdinato = [...staffElenco].sort((a, b) => (a.ruolo === 'insegnante' ? 0 : 1) - (b.ruolo === 'insegnante' ? 0 : 1) || `${a.nome}`.localeCompare(`${b.nome}`, 'it'));
  const setM = (i, k, v) => setMm((xs) => xs.map((m, j) => (j === i ? { ...m, [k]: v } : m)));
  const setO = (i, k, v) => setOo((xs) => xs.map((o, j) => (j === i ? { ...o, [k]: v } : o)));
  const setS = (i, s, k, v) => setOo((xs) => xs.map((o, j) => (j === i ? { ...o, prezzi: o.prezzi.map((x, h) => (h === s ? { ...x, [k]: v } : x)) } : o)));

  function aggiungiMomento() {
    const ultimo = mm[mm.length - 1];
    const nuovo = momentoVuoto(mm.length, ultimo);
    // il giorno dopo l'ultimo
    if (ultimo?.data) { const d = new Date(`${ultimo.data}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); nuovo.data = d.toISOString().slice(0, 10); }
    // le opzioni che comprendevano tutti i momenti comprendono anche il nuovo
    setOo((xs) => (xs || []).map((o) => (mm.every((m) => o.momenti.includes(m.id)) ? { ...o, momenti: [...o.momenti, nuovo.id] } : o)));
    setMm((xs) => [...xs, nuovo]);
  }
  function togliMomento(i) {
    const id = mm[i].id;
    if (mm.length === 1) return;
    setMm((xs) => xs.filter((_, j) => j !== i));
    setOo((xs) => xs.map((o) => ({ ...o, momenti: o.momenti.filter((x) => x !== id) })));
  }
  function aggiungiOpzione() {
    setOo((xs) => [...xs, { id: nuovoId(), nome: '', descrizione: '', momenti: mm.length === 1 ? [mm[0].id] : [], attiva: true, prezzi: [scaglioneVuoto()] }]);
  }
  // chi viene solo a uno dei giorni: un'opzione "Solo …" per ogni momento che non ce l'ha ancora (i prezzi li scrivi tu)
  const senzaOpzioneSingola = mm.filter((m) => !(oo || []).some((o) => o.momenti.length === 1 && o.momenti[0] === m.id));
  function opzioniPerGiorno() {
    setOo((xs) => [...xs, ...senzaOpzioneSingola.map((m) => ({ id: nuovoId(), nome: `Solo ${m.titolo || 'questo giorno'}`, descrizione: '',
      momenti: [m.id], attiva: true, prezzi: [scaglioneVuoto()] }))]);
  }
  function togliOpzione(i) {
    const o = oo[i];
    if (iscrittiPerOpzione[o.id]) {
      if (!confirm(`«${o.nome}» ha già ${iscrittiPerOpzione[o.id]} iscritti: non si cancella, si ferma (non si vende più). Continuare?`)) return;
    }
    setOo((xs) => xs.filter((_, j) => j !== i));
  }

  const nomeMomento = (m) => `${m.titolo || 'Momento'}${m.data ? ` · ${new Date(`${m.data}T12:00:00Z`).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}` : ''}`;
  const totPosti = useMemo(() => mm.map((m) => Number(m.posti) || 0), [mm]);

  async function salva(e) {
    e.preventDefault();
    setErrore('');
    if (!f.titolo.trim()) { setErrore(ERRORI.titolo_mancante); return; }
    if (mm.some((m) => !m.data || !m.dalle)) { setErrore(ERRORI.momento_senza_data); return; }
    if (mm.some((m) => m.alle && m.alle <= m.dalle)) { setErrore(ERRORI.momento_fine_prima); return; }
    if (mm.some((m) => m.posti !== '' && !(Number.isInteger(Number(m.posti)) && Number(m.posti) > 0))) { setErrore('I posti sono un numero intero (vuoto = senza limite).'); return; }
    for (const o of oo) {
      if (!o.nome.trim()) { setErrore(ERRORI.opzione_senza_nome); return; }
      if (!o.momenti.length) { setErrore(`«${o.nome}»: ${ERRORI.opzione_senza_momenti.toLowerCase()}`); return; }
      const validi = o.prezzi.filter((s) => s.allievi !== '');
      if (!validi.length) { setErrore(`«${o.nome}»: scrivi il prezzo per gli allievi.`); return; }
      if (o.prezzi.some((s) => Number.isNaN(centDa(s.allievi)) || Number.isNaN(centDa(s.esterni)))) { setErrore(`«${o.nome}»: un prezzo non è un importo (es. 40 oppure 40,50).`); return; }
      if (validi.filter((s) => !s.fino_al).length > 1) { setErrore(`«${o.nome}»: un solo prezzo può essere senza data ("poi").`); return; }
    }
    if (f.compenso_tipo && f.compenso !== '' && Number.isNaN(f.compenso_tipo === 'fisso' ? centDa(f.compenso) : Number(String(f.compenso).replace(',', '.')))) {
      setErrore('Il compenso non è un numero.'); return;
    }
    const p = {
      id: workshop?.id || nuovoId(), palestra_id: palestraId,
      titolo: f.titolo, sottotitolo: f.sottotitolo, insegnante: f.insegnante_id ? nomeStaff(f.insegnante_id) : f.insegnante,
      descrizione: f.descrizione, info_pratiche: f.info_pratiche,
      locandina_url: f.locandina_url || '', sede_id: f.sede_id || '', luogo: f.luogo, stato: f.stato,
      iscrizioni_fino: f.iscrizioni_fino_data ? isoDa(f.iscrizioni_fino_data, f.iscrizioni_fino_ora || '23:59') : '',
      online: f.online, in_segreteria: f.in_segreteria, quota_esterni: f.quota_esterni, certificato_richiesto: f.certificato_richiesto,
      compenso_tipo: f.compenso_tipo, compenso_cent: f.compenso_tipo === 'fisso' ? (centDa(f.compenso) ?? '') : '',
      compenso_percentuale: f.compenso_tipo === 'percentuale' && f.compenso !== '' ? String(f.compenso).replace(',', '.') : '',
      note_interne: f.note_interne,
      momenti: mm.map((m, i) => ({ id: m.id, titolo: m.titolo, inizio: isoDa(m.data, m.dalle), fine: m.alle ? isoDa(m.data, m.alle) : '',
        sala_id: m.sala_id, posti: m.posti === '' ? '' : Number(m.posti), ordine: i })),
      opzioni: oo.map((o, i) => ({ id: o.id, nome: o.nome, descrizione: o.descrizione, momenti: o.momenti.filter((x) => mm.some((m) => m.id === x)),
        attiva: o.attiva, ordine: i,
        prezzi: o.prezzi.filter((s) => s.allievi !== '').map((s) => ({ fino_al: s.fino_al || null, allievi: centDa(s.allievi), esterni: centDa(s.esterni) })) })),
    };
    setInvio(true);
    const db = supabaseBrowser();
    const { data, error } = await db.rpc('salva_workshop', { p });
    if (error) {
      setInvio(false);
      const k = Object.keys(ERRORI).find((x) => error.message?.includes(x));
      setErrore(ERRORI[k] || `Salvataggio non riuscito: ${error.message}`);
      return;
    }
    // l'insegnante della scuola (query 150): il compenso andrà nel suo cedolino
    if (f.insegnante_id || workshop?.insegnante_id) {
      const { error: e2 } = await db.from('workshop').update({ insegnante_id: f.insegnante_id || null }).eq('id', data);
      if (e2) { setInvio(false); setErrore('Workshop salvato, ma non l\'insegnante della scuola: esegui la query 150 e salva di nuovo.'); return; }
    }
    setInvio(false);
    router.refresh();
    if (onSalvato) onSalvato(data); else router.push(`/gestione/workshop/${data}`);
  }

  // come lo vede il cliente: gli stessi dati del modulo, anche non salvati
  const wAnteprima = () => ({
    titolo: f.titolo.trim() || 'Titolo del workshop', insegnante: f.insegnante_id ? nomeStaff(f.insegnante_id) : f.insegnante, sottotitolo: f.sottotitolo, stato: f.stato,
    luogo: f.luogo || sedi.find((x) => x.id === f.sede_id)?.nome || '', locandina_url: f.locandina_url,
    descrizione: f.descrizione, info_pratiche: f.info_pratiche, certificato_richiesto: f.certificato_richiesto,
    quota_cent: f.quota_esterni ? quotaCent : 0,
    momenti: mm.filter((m) => m.data && m.dalle).map((m) => ({ id: m.id, titolo: m.titolo || 'Workshop', inizio: isoDa(m.data, m.dalle),
      fine: m.alle ? isoDa(m.data, m.alle) : null, posti: m.posti === '' ? null : Number(m.posti), occupati: 0,
      sala: sale.find((x) => x.id === m.sala_id)?.nome || null })),
    opzioni: (oo || []).filter((o) => o.attiva).map((o) => ({ id: o.id, nome: o.nome || 'Opzione', descrizione: o.descrizione, momenti: o.momenti,
      prezzi: o.prezzi.filter((x) => x.allievi !== '' && Number.isFinite(centDa(x.allievi)))
        .map((x) => ({ fino_al: x.fino_al || null, allievi: centDa(x.allievi), esterni: Number.isFinite(centDa(x.esterni)) ? centDa(x.esterni) : null })),
      liberi: null })),
  });

  if (!oo) return null;
  return (
    <>
    <form onSubmit={salva} className="wf">
      <div className="wf-griglia">
        <div className="wf-principale">
          <section className="wf-sezione">
            <h3>Il workshop</h3>
            <div className="wf-campi">
              <div className="campo wf-4"><label htmlFor="wf-titolo">Titolo</label>
                <input id="wf-titolo" value={f.titolo} onChange={set('titolo')} placeholder="Es. Heels Workshop" autoFocus={!workshop} /></div>
              <div className="campo wf-2"><label htmlFor="wf-ins-chi">Insegnante</label>
                <select id="wf-ins-chi" value={f.insegnante_id} onChange={set('insegnante_id')}>
                  <option value="">Esterno/a (scrivi il nome)</option>
                  {staffOrdinato.length > 0 && (
                    <optgroup label="Della scuola: il compenso va nel cedolino">
                      {staffOrdinato.map((t) => <option key={t.id} value={t.id}>{`${t.nome} ${t.cognome || ''}`.trim()}</option>)}
                    </optgroup>
                  )}
                </select>
                {!f.insegnante_id && (
                  <input id="wf-ins" value={f.insegnante} onChange={set('insegnante')} placeholder="Nome e cognome" aria-label="Nome dell'insegnante esterno" style={{ marginTop: 6 }} />
                )}</div>
              <div className="campo wf-6"><label htmlFor="wf-sotto">Sottotitolo <span className="eti-info">· una riga sotto il titolo, es. "Livello intermedio · dai 16 anni"</span></label>
                <input id="wf-sotto" value={f.sottotitolo} onChange={set('sottotitolo')} /></div>
              <div className="campo wf-6"><label htmlFor="wf-desc">Descrizione per i clienti</label>
                <CampoTestoRicco id="wf-desc" rows={6} value={f.descrizione} onChange={(v) => setF((x) => ({ ...x, descrizione: v }))}
                                 placeholder="Cosa si fa, per chi è, chi è l'insegnante…" /></div>
              <div className="campo wf-6"><label htmlFor="wf-info">Cosa sapere <span className="eti-info">· va anche nell'email di conferma e nel promemoria (lì senza formattazione)</span></label>
                <CampoTestoRicco id="wf-info" rows={3} value={f.info_pratiche} onChange={(v) => setF((x) => ({ ...x, info_pratiche: v }))}
                                 placeholder="Cosa portare, abbigliamento, quanto arrivare prima…" /></div>
              {sedi.length > 1 && (
                <div className="campo wf-3"><label htmlFor="wf-sede">Sede</label>
                  <select id="wf-sede" value={f.sede_id} onChange={set('sede_id')}>
                    <option value="">—</option>
                    {sedi.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                  </select></div>
              )}
              <div className={`campo ${sedi.length > 1 ? 'wf-3' : 'wf-6'}`}><label htmlFor="wf-luogo">Luogo <span className="eti-info">· solo se non è la sede (es. "Teatro Comunale")</span></label>
                <input id="wf-luogo" value={f.luogo} onChange={set('luogo')} /></div>
            </div>
          </section>

          <section className="wf-sezione">
            <h3>Quando · i momenti</h3>
            <p className="piccolo muto wf-nota">Un momento per ogni lezione del workshop (es. sabato e domenica, o livello base e avanzato). I posti valgono per il momento: vuoto = senza limite.</p>
            <div className="wf-momenti">
              {mm.map((m, i) => (
                <div key={m.id} className="wf-momento">
                  <div className="campo"><label htmlFor={`wm-t-${i}`}>Nome</label>
                    <input id={`wm-t-${i}`} value={m.titolo} onChange={(e) => setM(i, 'titolo', e.target.value)} placeholder="Es. Sabato" /></div>
                  <div className="campo"><label htmlFor={`wm-d-${i}`}>Giorno</label>
                    <input id={`wm-d-${i}`} type="date" value={m.data} onChange={(e) => setM(i, 'data', e.target.value)} /></div>
                  <div className="campo"><label htmlFor={`wm-a-${i}`}>Dalle</label>
                    <input id={`wm-a-${i}`} type="time" value={m.dalle} onChange={(e) => setM(i, 'dalle', e.target.value)} /></div>
                  <div className="campo"><label htmlFor={`wm-b-${i}`}>Alle</label>
                    <input id={`wm-b-${i}`} type="time" value={m.alle} onChange={(e) => setM(i, 'alle', e.target.value)} /></div>
                  <div className="campo"><label htmlFor={`wm-s-${i}`}>Sala</label>
                    <select id={`wm-s-${i}`} value={m.sala_id} onChange={(e) => setM(i, 'sala_id', e.target.value)}>
                      <option value="">—</option>
                      {sale.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                    </select></div>
                  <div className="campo"><label htmlFor={`wm-p-${i}`}>Posti</label>
                    <input id={`wm-p-${i}`} inputMode="numeric" value={m.posti} onChange={(e) => setM(i, 'posti', e.target.value.replace(/\D/g, ''))} placeholder="∞" /></div>
                  <button type="button" className="wf-togli" onClick={() => togliMomento(i)} disabled={mm.length === 1}
                          aria-label={`Togli ${m.titolo || 'il momento'}`} title="Togli">×</button>
                </div>
              ))}
            </div>
            <button type="button" className="btn btn-piccolo" onClick={aggiungiMomento}>+ Aggiungi un momento</button>
          </section>

          <section className="wf-sezione">
            <h3>Cosa si compra · opzioni e prezzi</h3>
            <p className="piccolo muto wf-nota">
              Ogni opzione comprende uno o più momenti (es. "Solo sabato", "Weekend completo"). I prezzi possono cambiare con la data:
              &quot;fino al 15/11 40 €&quot;, poi un prezzo senza data. Il prezzo esterni vuoto = uguale agli allievi.
              {quotaCent > 0 && <> Agli esterni senza quota annuale si aggiungono {euro(quotaCent)} (si può togliere qui sotto, in Iscrizioni).</>}
            </p>
            {oo.map((o, i) => (
              <div key={o.id} className={`wf-opzione${o.attiva ? '' : ' ferma'}`}>
                <div className="wf-opz-testa">
                  <div className="campo"><label htmlFor={`wo-n-${i}`}>Opzione</label>
                    <input id={`wo-n-${i}`} value={o.nome} onChange={(e) => setO(i, 'nome', e.target.value)} placeholder="Es. Weekend completo" /></div>
                  <div className="campo"><label htmlFor={`wo-d-${i}`}>Nota <span className="eti-info">· facoltativa</span></label>
                    <input id={`wo-d-${i}`} value={o.descrizione} onChange={(e) => setO(i, 'descrizione', e.target.value)} placeholder="Es. tutte e due le lezioni" /></div>
                  <label className="spunta wf-attiva" title="Tolta la spunta, l'opzione non si vende più (chi è iscritto resta)">
                    <input type="checkbox" checked={o.attiva} onChange={(e) => setO(i, 'attiva', e.target.checked)} /><span>In vendita</span>
                  </label>
                  {oo.length > 1 && <button type="button" className="wf-togli" onClick={() => togliOpzione(i)} aria-label={`Togli ${o.nome || 'l\'opzione'}`} title="Togli">×</button>}
                </div>
                <div className="wf-comprende" role="group" aria-label="Momenti compresi">
                  <span className="piccolo muto">Comprende</span>
                  {mm.map((m) => (
                    <button key={m.id} type="button" className="oc-gruppo-chip" style={{ '--g': 'var(--nero)' }} aria-pressed={o.momenti.includes(m.id)}
                            onClick={() => setO(i, 'momenti', o.momenti.includes(m.id) ? o.momenti.filter((x) => x !== m.id) : [...o.momenti, m.id])}>
                      {nomeMomento(m)}
                    </button>
                  ))}
                </div>
                <div className="wf-prezzi">
                  <div className="wf-prezzo wf-prezzo-testa" aria-hidden="true"><span>Fino al</span><span>Allievi €</span><span>Esterni €</span><span /></div>
                  {o.prezzi.map((s, h) => (
                    <div key={h} className="wf-prezzo">
                      <input type="date" value={s.fino_al} onChange={(e) => setS(i, h, 'fino_al', e.target.value)} aria-label="Fino al (vuoto = poi, senza scadenza)" title="Vuoto = senza scadenza" />
                      <input inputMode="decimal" value={s.allievi} onChange={(e) => setS(i, h, 'allievi', e.target.value)} aria-label="Prezzo allievi" placeholder="es. 40" />
                      <input inputMode="decimal" value={s.esterni} onChange={(e) => setS(i, h, 'esterni', e.target.value)} aria-label="Prezzo esterni" placeholder="uguale" />
                      <button type="button" className="wf-togli" onClick={() => setO(i, 'prezzi', o.prezzi.filter((_, x) => x !== h))} disabled={o.prezzi.length === 1} aria-label="Togli il prezzo" title="Togli">×</button>
                    </div>
                  ))}
                  <button type="button" className="link-btn piccolo" onClick={() => setO(i, 'prezzi', [...o.prezzi, scaglioneVuoto()])}>+ prezzo con un'altra scadenza</button>
                </div>
                {iscrittiPerOpzione[o.id] > 0 && <p className="piccolo muto" style={{ margin: '6px 0 0' }}>{iscrittiPerOpzione[o.id]} iscritti con questa opzione: chi è già iscritto tiene il suo prezzo.</p>}
              </div>
            ))}
            <div className="azioni">
              <button type="button" className="btn btn-piccolo" onClick={aggiungiOpzione}>+ Aggiungi un'opzione</button>
              {mm.length > 1 && senzaOpzioneSingola.length > 0 && (
                <button type="button" className="btn btn-piccolo" onClick={opzioniPerGiorno}
                        title="Per chi viene solo a uno dei giorni: crea «Solo …» per ogni momento, poi scrivi i prezzi">
                  + Un'opzione per ogni giorno ({senzaOpzioneSingola.length})
                </button>
              )}
            </div>
          </section>
        </div>

        <aside className="wf-lato">
          <section className="wf-sezione">
            <h3>Locandina</h3>
            <Immagine url={f.locandina_url} cartella="workshop" etichetta="Locandina del workshop" onChange={(url) => setF((x) => ({ ...x, locandina_url: url }))} />
          </section>

          <section className="wf-sezione">
            <h3>Iscrizioni</h3>
            <div className="wf-stati" role="radiogroup" aria-label="Stato del workshop">
              {Object.entries(STATI_WORKSHOP).map(([k, s]) => (
                <label key={k} className={`cf-stato${f.stato === k ? ' scelto' : ''}`}>
                  <input type="radio" name="wf-stato" value={k} checked={f.stato === k} onChange={set('stato')} />
                  <strong>{s.testo}</strong><span>{s.nota}</span>
                </label>
              ))}
            </div>
            <div className="wf-campi" style={{ marginTop: 8 }}>
              <div className="campo wf-3"><label htmlFor="wf-chiusura">Chiudi le iscrizioni il</label>
                <input id="wf-chiusura" type="date" value={f.iscrizioni_fino_data} onChange={set('iscrizioni_fino_data')} /></div>
              <div className="campo wf-3"><label htmlFor="wf-chiusura-ora">alle</label>
                <input id="wf-chiusura-ora" type="time" value={f.iscrizioni_fino_ora} onChange={set('iscrizioni_fino_ora')} disabled={!f.iscrizioni_fino_data} /></div>
            </div>
            <p className="piccolo muto wf-nota" style={{ marginTop: -4 }}>Vuoto = fino all'inizio del primo momento.</p>
            <div className="wf-spunte">
              <label className="cf-interruttore"><input type="checkbox" checked={f.online} onChange={set('online')} /><span>Pagamento online (carta, Satispay)</span></label>
              <label className="cf-interruttore"><input type="checkbox" checked={f.in_segreteria} onChange={set('in_segreteria')} /><span>Si può pagare in segreteria</span></label>
              <label className="cf-interruttore"><input type="checkbox" checked={f.quota_esterni} onChange={set('quota_esterni')} /><span>Chi non ha la quota annuale la paga insieme{quotaCent > 0 ? ` (${euro(quotaCent)})` : ''}</span></label>
              <label className="cf-interruttore"><input type="checkbox" checked={f.certificato_richiesto} onChange={set('certificato_richiesto')} /><span>Serve il certificato medico</span></label>
            </div>
            {!f.online && !f.in_segreteria && <p className="piccolo sp-attenzione">Scegli almeno un modo di pagare.</p>}
          </section>

          <section className="wf-sezione">
            <h3>Insegnante e conti</h3>
            <div className="wf-campi">
              <div className="campo wf-3"><label htmlFor="wf-comp">Compenso</label>
                <select id="wf-comp" value={f.compenso_tipo} onChange={set('compenso_tipo')}>
                  <option value="">—</option>
                  <option value="fisso">Fisso (€)</option>
                  <option value="percentuale">Percentuale sugli incassi</option>
                </select></div>
              {f.compenso_tipo && (
                <div className="campo wf-3"><label htmlFor="wf-comp-v">{f.compenso_tipo === 'fisso' ? 'Importo €' : 'Percentuale %'}</label>
                  <input id="wf-comp-v" inputMode="decimal" value={f.compenso} onChange={set('compenso')} placeholder={f.compenso_tipo === 'fisso' ? 'es. 300' : 'es. 50'} /></div>
              )}
              <div className="campo wf-6"><label htmlFor="wf-note">Note interne <span className="eti-info">· le vede solo lo staff</span></label>
                <textarea id="wf-note" rows={2} value={f.note_interne} onChange={set('note_interne')} placeholder="Viaggio, alloggio, accordi…" /></div>
            </div>
            {f.compenso_tipo && (
              <p className="piccolo muto wf-nota">
                {f.insegnante_id
                  ? `Insegnante della scuola: il compenso va da solo nel cedolino di ${nomeStaff(f.insegnante_id)} del mese in cui finisce il workshop.`
                  : 'Insegnante esterno/a: dopo il workshop, nella scheda → Insegnante, stampi il riepilogo da allegare alla sua ricevuta o fattura e registri il pagamento (va nei Costi).'}
              </p>
            )}
            {totPosti.some(Boolean) && <p className="piccolo muto wf-nota">Posti: {mm.map((m) => `${m.titolo || 'momento'} ${m.posti || '∞'}`).join(' · ')}</p>}
          </section>
        </aside>
      </div>

      {errore && <div className="errore" role="alert" ref={rifErrore}>{errore}</div>}
      <div className="cf-barra-salva">
        <button className="btn btn-primario" disabled={invio || (!f.online && !f.in_segreteria)}>{invio ? 'Salvo…' : workshop ? 'Salva il workshop' : 'Crea il workshop'}</button>
        <button type="button" className="btn" onClick={() => setAnteprima(true)}
                title="Come lo vedono i clienti sul telefono">Anteprima<span className="ws-solo-pc"> sul telefono</span></button>
        <button type="button" className="btn" onClick={() => (onAnnulla ? onAnnulla() : router.back())}>Annulla</button>
      </div>
    </form>
    {anteprima && (
      <Finestra titolo="Anteprima: come lo vedono i clienti" sotto="Nell'app e dal link pubblico, su un telefono. Non è ancora salvato: chiudi e salva quando va bene."
                chiudi={() => setAnteprima(false)}>
        <div className="at-telefono">
          <div className="at-stato" aria-hidden="true"><span>9:41</span><span className="at-notch" /><span>●●● 5G</span></div>
          <div className="at-app" aria-hidden="true"><strong>Ritmo Metropolitano</strong><span>☰</span></div>
          <div className="at-schermo">
            <Dettaglio w={wAnteprima()} />
            <div className="at-iscriviti">
              <strong>Iscriviti</strong>
              <span className="piccolo muto">Qui il cliente sceglie chi iscrivere e l&apos;opzione, vede il totale e paga.</span>
              <span className="btn btn-primario at-finto">Iscriviti</span>
            </div>
          </div>
        </div>
      </Finestra>
    )}
    </>
  );
}
