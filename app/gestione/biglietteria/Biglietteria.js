'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { euro, dataBreve } from '@/lib/formato';
import { oraSpettacolo, quandoSpettacolo, testoExtra, erroreBiglietteria } from '@/lib/biglietteria';
import { leggiCsv, leggiData } from '@/lib/csv';
import Immagine from '../Immagine';
import { righeXlsx, dataDaExcel } from '@/lib/xlsx';

const STATI = { da_pagare: 'Da pagare', pagata: 'Pagata', gratis: 'Gratis', annullata: 'Annullata', scaduta: 'Scaduta' };
const METODI = [['satispay', 'Satispay'], ['bonifico', 'Bonifico'], ['contanti', 'Contanti'], ['pos', 'POS'], ['altro', 'Altro']];
const statoDi = (p) => (p.stato === 'da_pagare' && p.scade_at && new Date(p.scade_at) < new Date() ? 'scaduta' : p.stato);
const centDa = (v) => (v === '' || v == null ? null : Math.round(Number(String(v).replace(',', '.')) * 100));
const euroTesto = (c) => (c == null ? '' : (c / 100).toString().replace('.', ','));
// ISO → valore per <input type="datetime-local"> (ora italiana del browser) e ritorno
const perInput = (iso) => { if (!iso) return ''; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const daInput = (v) => (v ? new Date(v).toISOString() : null);

const REGOLE = `PRENOTA IL TUO POSTO!
Scegli a quale evento partecipare.
Spettacoli: associa il tuo nome all'allievo/a e scegli quanti posti (2 per allievo). Contributo per la nostra raccolta fondi: 10 €.
Party: ingresso libero, puoi contribuire alla raccolta fondi e prenotare la pizza.`;

// ---------------------------------------------------------------- creazione: quanti eventi si vuole, ognuno com'è
const EVENTO_VUOTO = { titolo: '', ora: '20:00', con_allievi: false, chiedi_nascita: true, scelta_allievo: 'gruppo', posti_per_allievo: '2', contributo: '', contributo_per_posto: false,
  offerta_libera: false, pizza: '', capienza: '' };
const MODELLI = {
  saggio: { titolo: 'Saggio di Natale', testo: REGOLE, eventi: [
    { ...EVENTO_VUOTO, titolo: 'Christmas Aerial e Pole Dance show', ora: '15:30', con_allievi: true, contributo: '10' },
    { ...EVENTO_VUOTO, titolo: 'Christmas Streetdance show', ora: '18:00', con_allievi: true, contributo: '10' },
    { ...EVENTO_VUOTO, titolo: 'Party con DJ set', ora: '19:00', offerta_libera: true, pizza: '8' }, // la pizza diventa un'opzione extra (si cambia e se ne aggiungono altre in Eventi)
  ] },
  uno: { titolo: '', testo: '', eventi: [{ ...EVENTO_VUOTO, titolo: 'Spettacolo' }] },
};
const ERRORI_CREA = { titolo_mancante: 'Scrivi il titolo.', nessuno_spettacolo: 'Serve almeno un evento con il titolo.',
  esiste_gia: 'Esiste già una biglietteria con questo titolo e anno: cambia il titolo.', non_autorizzato: 'Non hai i permessi.' };

function Nuova({ palestraId, onFatto }) {
  const [titolo, setTitolo] = useState(MODELLI.saggio.titolo);
  const [testo, setTesto] = useState(MODELLI.saggio.testo);
  const [data, setData] = useState('2026-12-20');
  const [liberi, setLiberi] = useState('2026-12-08');
  const [pizzaEntro, setPizzaEntro] = useState('2026-12-12');
  const [eventi, setEventi] = useState(MODELLI.saggio.eventi);
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const usa = (k) => { setTitolo(MODELLI[k].titolo); setTesto(MODELLI[k].testo); setEventi(MODELLI[k].eventi.map((e) => ({ ...e }))); };
  const set = (i, k) => (e) => setEventi((v) => v.map((x, n) => (n === i ? { ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value } : x)));
  const sposta = (i, d) => setEventi((v) => { const w = [...v]; const [x] = w.splice(i, 1); w.splice(i + d, 0, x); return w; });
  const conAllievi = eventi.some((e) => e.con_allievi);
  const conPizza = eventi.some((e) => centDa(e.pizza));
  async function crea() {
    setErrore('');
    if (!titolo.trim()) { setErrore(ERRORI_CREA.titolo_mancante); return; }
    if (!data) { setErrore('Scegli il giorno.'); return; }
    const validi = eventi.filter((e) => e.titolo.trim());
    if (!validi.length) { setErrore(ERRORI_CREA.nessuno_spettacolo); return; }
    setInvio(true);
    const { data: id, error } = await supabaseBrowser().rpc('biglietteria_crea', { p: {
      palestra_id: palestraId, titolo: titolo.trim(), anno: data.slice(0, 4), sottotitolo: testo,
      spettacoli: validi.map((e) => ({
        titolo: e.titolo.trim(), inizio: new Date(`${data}T${e.ora || '20:00'}:00`).toISOString(), con_allievi: !!e.con_allievi,
        chiedi_nascita: e.chiedi_nascita !== false, scelta_allievo: e.scelta_allievo || 'gruppo', posti_per_allievo: e.posti_per_allievo, liberi_dal: e.con_allievi ? liberi || null : null, capienza: e.capienza,
        contributo_cent: centDa(e.contributo) || 0, contributo_per_posto: !!e.contributo_per_posto, offerta_libera: !!e.offerta_libera,
        extra: centDa(e.pizza) ? [{ id: 'pizza', nome: 'Pizza', descrizione: '', prezzo_cent: centDa(e.pizza), entro: pizzaEntro || null }] : [],
      })),
    } });
    setInvio(false);
    if (error) {
      const k = Object.keys(ERRORI_CREA).find((x) => error.message?.includes(x));
      setErrore(k ? ERRORI_CREA[k] : error.message?.includes('biglietteria_crea') ? 'Manca una query della biglietteria in Supabase (172–174).' : `Non riuscito: ${error.message}`);
      return;
    }
    onFatto(id);
  }
  return (
    <section className="pannello bt-nuova">
      <h2>Nuova biglietteria</h2>
      <p className="piccolo muto">Parti da un modello e cambia quello che serve: quanti eventi, orari, se si prenota scegliendo un allievo, contributi,
        pizza. Tutto si può modificare anche dopo. Nasce chiusa: la apri quando è pronta.</p>
      <div className="azioni">
        <span className="piccolo">Modello:</span>
        <button type="button" className="btn btn-piccolo" onClick={() => usa('saggio')}>Saggio di Natale (3 eventi)</button>
        <button type="button" className="btn btn-piccolo" onClick={() => usa('uno')}>Vuoto (1 evento)</button>
      </div>
      <div className="bt-campi">
        <div className="campo"><label htmlFor="bn-t">Titolo</label><input id="bn-t" value={titolo} onChange={(e) => setTitolo(e.target.value)} placeholder="es. Saggio di fine anno" /></div>
        <div className="campo"><label htmlFor="bn-d">Giorno</label><input id="bn-d" type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
        {conAllievi && <div className="campo"><label htmlFor="bn-l">Posti liberi a tutti dal</label><input id="bn-l" type="date" value={liberi} onChange={(e) => setLiberi(e.target.value)} /></div>}
        {conPizza && <div className="campo"><label htmlFor="bn-p">Pizza prenotabile entro</label><input id="bn-p" type="date" value={pizzaEntro} onChange={(e) => setPizzaEntro(e.target.value)} /></div>}
      </div>

      <h3>Eventi ({eventi.length})</h3>
      <div className="bt-eventi">
        {eventi.map((e, i) => (
          <div key={i} className="bt-evento">
            <div className="bt-evento-testa">
              <strong>{i + 1}</strong>
              <input aria-label={`Titolo evento ${i + 1}`} value={e.titolo} onChange={set(i, 'titolo')} placeholder="Titolo dell'evento" />
              <input aria-label={`Ora evento ${i + 1}`} type="time" value={e.ora} onChange={set(i, 'ora')} />
              <span className="bt-evento-bottoni">
                <button type="button" className="link-btn piccolo" disabled={i === 0} onClick={() => sposta(i, -1)} aria-label="Sposta su">↑</button>
                <button type="button" className="link-btn piccolo" disabled={i === eventi.length - 1} onClick={() => sposta(i, 1)} aria-label="Sposta giù">↓</button>
                <button type="button" className="link-btn piccolo pericolo" disabled={eventi.length === 1} onClick={() => setEventi((v) => v.filter((_, n) => n !== i))}>togli</button>
              </span>
            </div>
            <div className="bt-evento-opzioni">
              <label className="spunta"><input type="checkbox" checked={e.con_allievi} onChange={set(i, 'con_allievi')} /><span>si prenota scegliendo un allievo</span></label>
              {e.con_allievi && <label className="spunta"><input type="checkbox" checked={e.chiedi_nascita} onChange={set(i, 'chiedi_nascita')} /><span>conferma con la data di nascita</span></label>}
              {e.con_allievi && <label className="bt-mini">allievo <select value={e.scelta_allievo} onChange={set(i, 'scelta_allievo')}><option value="gruppo">gruppo → allievo</option><option value="nome">scrivendo il nome</option></select></label>}
              {e.con_allievi && <label className="bt-mini">posti per allievo <input inputMode="numeric" value={e.posti_per_allievo} onChange={set(i, 'posti_per_allievo')} /></label>}
              <label className="bt-mini">contributo € <input inputMode="decimal" value={e.contributo} onChange={set(i, 'contributo')} placeholder="0" /></label>
              <label className="spunta"><input type="checkbox" checked={e.contributo_per_posto} onChange={set(i, 'contributo_per_posto')} /><span>a persona</span></label>
              <label className="spunta"><input type="checkbox" checked={e.offerta_libera} onChange={set(i, 'offerta_libera')} /><span>offerta libera</span></label>
              <label className="bt-mini">pizza € <input inputMode="decimal" value={e.pizza} onChange={set(i, 'pizza')} placeholder="no" /></label>
              <label className="bt-mini">capienza <input inputMode="numeric" value={e.capienza} onChange={set(i, 'capienza')} placeholder="∞" /></label>
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-piccolo" onClick={() => setEventi((v) => [...v, { ...EVENTO_VUOTO, titolo: `Evento ${v.length + 1}` }])}>Aggiungi un evento</button>

      <div className="campo" style={{ marginTop: 12 }}><label htmlFor="bn-r">Testo in cima alla pagina (regole)</label><textarea id="bn-r" rows={4} value={testo} onChange={(e) => setTesto(e.target.value)} /></div>
      {errore && <div className="errore" role="alert">{errore}</div>}
      <button type="button" className="btn btn-primario" disabled={invio} onClick={crea}>{invio ? 'Un attimo…' : `Crea la biglietteria (${eventi.filter((e) => e.titolo.trim()).length} eventi)`}</button>
    </section>
  );
}

// id stabile di un'opzione extra (dal nome, con un pezzo a caso per non confonderne due uguali)
const idOpzione = (nome) => `${nome.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'extra'}-${Math.random().toString(36).slice(2, 6)}`;

// ---------------------------------------------------------------- uno spettacolo (modifica)
function Spettacolo({ s, nPren, onSalvato }) {
  const [v, setV] = useState({
    titolo: s.titolo, descrizione: s.descrizione || '', inizio: perInput(s.inizio), con_allievi: s.con_allievi, chiedi_nascita: s.chiedi_nascita !== false, scelta_allievo: s.scelta_allievo || 'gruppo', frase_offerta: s.frase_offerta || '', posti_per_allievo: String(s.posti_per_allievo),
    liberi_dal: s.liberi_dal || '', capienza: s.capienza == null ? '' : String(s.capienza), max_per_prenotazione: String(s.max_per_prenotazione),
    contributo: euroTesto(s.contributo_cent), contributo_per_posto: s.contributo_per_posto, offerta_libera: s.offerta_libera,
    chiuso: s.chiuso,
  });
  const [extra, setExtra] = useState((s.extra || []).map((o) => ({ ...o, prezzo: euroTesto(o.prezzo_cent), entro: o.entro || '', descrizione: o.descrizione || '' })));
  const setOpz = (k, campo) => (e) => setExtra((v) => v.map((o, i) => (i === k ? { ...o, [campo]: e.target.value } : o)));
  const [esito, setEsito] = useState('');
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  async function salva() {
    setEsito('');
    if (!v.titolo.trim() || !v.inizio) { setEsito('Titolo e data/ora servono.'); return; }
    const { error } = await supabaseBrowser().from('biglietteria_spettacoli').update({
      titolo: v.titolo.trim(), descrizione: v.descrizione.trim() || null, inizio: daInput(v.inizio), con_allievi: v.con_allievi, chiedi_nascita: v.chiedi_nascita, scelta_allievo: v.scelta_allievo, frase_offerta: v.frase_offerta.trim() || null,
      posti_per_allievo: Math.max(1, Number(v.posti_per_allievo) || 2), liberi_dal: v.liberi_dal || null,
      capienza: v.capienza === '' ? null : Math.max(0, Number(v.capienza) || 0), max_per_prenotazione: Math.max(1, Number(v.max_per_prenotazione) || 10),
      contributo_cent: centDa(v.contributo) || 0, contributo_per_posto: v.contributo_per_posto, offerta_libera: v.offerta_libera,
      extra: extra.filter((o) => o.nome.trim()).map((o) => ({ id: o.id || idOpzione(o.nome), nome: o.nome.trim(), descrizione: o.descrizione.trim(),
        prezzo_cent: centDa(o.prezzo) || 0, entro: o.entro || null })),
      chiuso: v.chiuso,
    }).eq('id', s.id);
    setEsito(error ? `Non salvato: ${error.message}` : 'Salvato ✓');
    if (!error) onSalvato();
  }
  async function elimina() {
    if (nPren > 0) { setEsito('Ha già delle prenotazioni: chiudilo invece di eliminarlo.'); return; }
    if (!confirm(`Eliminare «${s.titolo}» e il suo elenco allievi?`)) return;
    const { error } = await supabaseBrowser().from('biglietteria_spettacoli').delete().eq('id', s.id);
    if (error) setEsito(`Non eliminato: ${error.message}`); else onSalvato();
  }
  return (
    <section className="pannello bt-spettacolo">
      <div className="bt-campi">
        <div className="campo bt-largo"><label>Titolo</label><input value={v.titolo} onChange={set('titolo')} /></div>
        <div className="campo"><label>Giorno e ora</label><input type="datetime-local" value={v.inizio} onChange={set('inizio')} /></div>
        <div className="campo"><label>Capienza (posti in tutto)</label><input inputMode="numeric" value={v.capienza} onChange={set('capienza')} placeholder="senza limite" /></div>
        <div className="campo"><label>Contributo €</label><input inputMode="decimal" value={v.contributo} onChange={set('contributo')} placeholder="0 = gratis" /></div>
        <label className="spunta"><input type="checkbox" checked={v.contributo_per_posto} onChange={set('contributo_per_posto')} /><span>contributo a persona (non a prenotazione)</span></label>
        <label className="spunta"><input type="checkbox" checked={v.con_allievi} onChange={set('con_allievi')} /><span>il pubblico sceglie l&apos;allievo che viene a vedere</span></label>
        {v.con_allievi && (
          <>
            <div className="campo"><label>Posti per allievo</label><input inputMode="numeric" value={v.posti_per_allievo} onChange={set('posti_per_allievo')} /></div>
            <div className="campo"><label>Dal giorno: posti liberi a tutti</label><input type="date" value={v.liberi_dal} onChange={set('liberi_dal')} /></div>
            <div className="campo bt-largo"><label>Come si sceglie l&apos;allievo</label>
              <select value={v.scelta_allievo} onChange={set('scelta_allievo')}>
                <option value="gruppo">Prima il gruppo, poi l&apos;allievo</option>
                <option value="nome">Scrivendo il nome (l&apos;elenco si filtra mentre si scrive)</option>
              </select></div>
            <label className="spunta bt-largo"><input type="checkbox" checked={v.chiedi_nascita} onChange={set('chiedi_nascita')} />
              <span>chiedi la data di nascita dell&apos;allievo per confermare (se la togli: scelto l&apos;allievo si passa subito a posti e pagamento)</span></label>
          </>
        )}
        <div className="campo"><label>Max posti per prenotazione</label><input inputMode="numeric" value={v.max_per_prenotazione} onChange={set('max_per_prenotazione')} /></div>
        <div className="campo bt-largo"><label>Raccolta fondi nella pagina</label>
          <select value={v.offerta_libera ? 'importi' : 'frase'} onChange={(e) => setV((x) => ({ ...x, offerta_libera: e.target.value === 'importi' }))}>
            <option value="importi">Importi da scegliere (No, 5 €, 10 €, 20 €, altro)</option>
            <option value="frase">Solo una frase (o niente, se la lasci vuota)</option>
          </select></div>
        {!v.offerta_libera && <div className="campo bt-largo"><label>Frase al posto degli importi</label>
          <textarea rows={2} value={v.frase_offerta} onChange={set('frase_offerta')} placeholder="es. Durante la festa potrai contribuire alla raccolta fondi direttamente in sala. Grazie!" /></div>}
        <div className="bt-largo bt-extra">
          <strong>Opzioni extra</strong> <span className="piccolo muto">(es. pizza, pizza per celiaci, bibita): il pubblico sceglie quante ne vuole e deve confermare se le lascia a 0</span>
          {extra.map((o, k) => (
            <div key={k} className="bt-extra-riga">
              <input aria-label="Nome dell'opzione" value={o.nome} onChange={setOpz(k, 'nome')} placeholder="Nome (es. Pizza margherita)" />
              <input aria-label="Prezzo in euro" inputMode="decimal" value={o.prezzo} onChange={setOpz(k, 'prezzo')} placeholder="€" />
              <label className="bt-mini">entro il <input type="date" value={o.entro} onChange={setOpz(k, 'entro')} /></label>
              <button type="button" className="link-btn piccolo pericolo" onClick={() => setExtra((v) => v.filter((_, i) => i !== k))}>togli</button>
              <input className="bt-extra-descr" aria-label="Descrizione" value={o.descrizione} onChange={setOpz(k, 'descrizione')} placeholder="Descrizione chiara (es. «pizza intera, ritiro al bar dalle 19:30»)" />
            </div>
          ))}
          <button type="button" className="btn btn-piccolo" onClick={() => setExtra((v) => [...v, { id: '', nome: '', descrizione: '', prezzo: '', entro: '' }])}>Aggiungi un&apos;opzione</button>
        </div>
        <div className="campo bt-largo"><label>Descrizione (si vede nella pagina)</label><textarea rows={2} value={v.descrizione} onChange={set('descrizione')} /></div>
        <label className="spunta"><input type="checkbox" checked={v.chiuso} onChange={set('chiuso')} /><span>prenotazioni chiuse per questo spettacolo</span></label>
      </div>
      <div className="azioni">
        <button type="button" className="btn btn-primario btn-piccolo" onClick={salva}>Salva</button>
        <button type="button" className="link-btn piccolo pericolo" onClick={elimina}>Elimina</button>
        {esito && <span className="piccolo">{esito}</span>}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- elenco iscritti (un file per tutti gli spettacoli)
// colonne riconosciute dall'intestazione: Nome, Cognome, Gruppo (o Corso), Spettacolo (1, 2, l'ora o il titolo), Data di nascita
function righeDaTabella(righe) {
  const pulite = righe.map((r) => r.map((c) => String(c ?? '').trim())).filter((r) => r.some((c) => c));
  if (!pulite.length) return { righe: [], manca: '' };
  const testa = pulite[0].map((c) => c.toLowerCase());
  const col = (...parole) => testa.findIndex((h) => parole.some((p) => h.includes(p)));
  const iC = col('cognome');
  const iN = testa.findIndex((h, k) => h.includes('nome') && k !== iC);
  const iG = col('gruppo', 'corso', 'classe');
  const iS = col('spettacolo', 'show', 'evento', 'turno');
  const iD = col('nascita', 'nato', 'data');
  if (iN < 0 || iS < 0) return { righe: [], manca: 'Nella prima riga servono almeno le intestazioni «Nome» e «Spettacolo» (meglio anche Cognome, Gruppo, Data di nascita).' };
  return {
    manca: '',
    righe: pulite.slice(1).map((r) => {
      const d = iD >= 0 ? r[iD] : '';
      return { nome: r[iN] || '', cognome: iC >= 0 ? r[iC] || '' : '', gruppo: iG >= 0 ? r[iG] || '' : '', spettacolo: r[iS] || '',
               nascita: d ? (/^\d+(\.\d+)?$/.test(d) ? dataDaExcel(d) : leggiData(d)) : null, nascitaTesto: d };
    }).filter((x) => x.nome),
  };
}

function Allievi({ b, spettacoli, allievi, prenotati, onFatto }) {
  const [tabella, setTabella] = useState(null);        // righe lette dal file o incollate
  const [testo, setTesto] = useState('');
  const [sostituisci, setSostituisci] = useState(false);
  const [esito, setEsito] = useState('');
  const [cerca, setCerca] = useState('');
  const letto = useMemo(() => {
    if (tabella) return righeDaTabella(tabella);
    const t = testo.replace(/^\uFEFF/, '').trim();
    if (!t) return { righe: [], manca: '' };
    if (t.includes('\t')) return righeDaTabella(t.split(/\r?\n/).map((r) => r.split('\t')));
    const { intestazioni, righe } = leggiCsv(t);
    return righeDaTabella([intestazioni, ...righe.map((x) => intestazioni.map((h) => x[h]))]);
  }, [tabella, testo]);
  const senzaData = letto.righe.filter((r) => !r.nascita).length;
  async function file(e) {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    setEsito('');
    try {
      if (/\.xlsx$/i.test(f.name)) { setTabella(await righeXlsx(f)); setTesto(''); }
      else if (/\.(csv|txt)$/i.test(f.name)) { setTesto(await f.text()); setTabella(null); }
      else setEsito('Carica un file Excel (.xlsx) o CSV. Un .xls vecchio: aprilo in Excel e salvalo come .xlsx.');
    } catch { setEsito('Non riesco a leggere il file: salvalo come .xlsx o CSV e riprova.'); }
  }
  async function carica() {
    setEsito('');
    const righe = letto.righe.map(({ nome, cognome, gruppo, spettacolo, nascita }) => ({ nome, cognome, gruppo, spettacolo, nascita }));
    const { data, error } = await supabaseBrowser().rpc('biglietteria_carica_allievi', { p_biglietteria: b.id, p_righe: righe, p_sostituisci: sostituisci });
    if (error) { setEsito(`Non caricato: ${error.message}`); return; }
    const sc = data.scartate || [];
    setEsito(`${data.nuovi} aggiunti, ${data.aggiornati} aggiornati${data.tolti ? `, ${data.tolti} tolti` : ''} · ${data.totale} in elenco`
      + (data.senza_nascita ? ` · ${data.senza_nascita} senza data di nascita (per loro non si chiede)` : '')
      + (sc.length ? `. Saltati ${sc.length} (spettacolo non riconosciuto): ${sc.slice(0, 8).join(', ')}${sc.length > 8 ? '…' : ''}` : ''));
    setTesto(''); setTabella(null); onFatto();
  }
  async function togli(a) {
    if (prenotati[a.id]) { setEsito(`${a.nome} ha già delle prenotazioni: non si può togliere.`); return; }
    const { error } = await supabaseBrowser().from('biglietteria_allievi').delete().eq('id', a.id);
    if (error) setEsito(`Non tolto: ${error.message}`); else onFatto();
  }
  const q = cerca.trim().toLowerCase();
  const conAllievi = spettacoli.filter((s) => s.con_allievi);
  return (
    <>
      <section className="pannello">
        <h3>Carica gli iscritti</h3>
        <p className="piccolo muto">Un solo file per tutti gli spettacoli. Prima riga con le intestazioni: <strong>Nome, Cognome, Gruppo, Spettacolo, Data di nascita</strong>.
          In «Spettacolo» scrivi il numero ({conAllievi.map((s) => `${s.ordine} = ${s.titolo}`).join(', ')}), oppure l&apos;ora o una parola del titolo.
          Ricaricando il file, chi c&apos;è già viene aggiornato.</p>
        <div className="azioni">
          <input type="file" accept=".xlsx,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={file} aria-label="File Excel o CSV" />
          <label className="spunta"><input type="checkbox" checked={sostituisci} onChange={(e) => setSostituisci(e.target.checked)} /><span>sostituisci tutto l&apos;elenco (restano quelli con prenotazioni)</span></label>
        </div>
        <div className="campo">
          <label htmlFor="ba-incolla">…oppure incolla qui le colonne copiate da Excel (con la riga delle intestazioni)</label>
          <textarea id="ba-incolla" rows={3} value={testo} onChange={(e) => { setTesto(e.target.value); setTabella(null); }}
                    placeholder={'Nome\tCognome\tGruppo\tSpettacolo\tData di nascita\nSofia\tRossi\tAerea Kids 1\t1\t12/05/2015'} />
        </div>
        {letto.manca && <div className="errore" role="alert">{letto.manca}</div>}
        {letto.righe.length > 0 && (
          <>
            <div className="bt-anteprima">
              <table>
                <thead><tr><th>Nome</th><th>Cognome</th><th>Gruppo</th><th>Spettacolo</th><th>Nascita</th></tr></thead>
                <tbody>{letto.righe.slice(0, 6).map((r, k) => (
                  <tr key={k}><td>{r.nome}</td><td>{r.cognome}</td><td>{r.gruppo}</td><td>{r.spettacolo}</td>
                    <td className={r.nascita ? '' : 'rosso'}>{r.nascita ? dataBreve(r.nascita) : (r.nascitaTesto || 'manca')}</td></tr>
                ))}</tbody>
              </table>
            </div>
            <p className="piccolo">{letto.righe.length} righe{letto.righe.length > 6 ? ' (qui le prime 6)' : ''}
              {senzaData ? ` · ${senzaData} senza data di nascita valida: per loro non verrà chiesta` : ''}
              {' '}<button type="button" className="btn btn-primario btn-piccolo" onClick={carica}>Carica {letto.righe.length}</button></p>
          </>
        )}
        {esito && <p className="piccolo" role="status">{esito}</p>}
      </section>

      {conAllievi.map((s) => {
        const di = allievi.filter((a) => a.spettacolo_id === s.id);
        const visti = di.filter((a) => !q || `${a.nome} ${a.cognome} ${a.gruppo || ''}`.toLowerCase().includes(q));
        const gruppi = [...new Set(di.map((a) => a.gruppo || 'Altri'))].sort();
        return (
          <section key={s.id} className="pannello">
            <h3>{s.ordine} · {s.titolo} <span className="muto piccolo">· {di.length} allievi in {gruppi.length} gruppi · {s.posti_per_allievo} posti ciascuno</span></h3>
            {di.length > 0 && (
              <details>
                <summary>Elenco</summary>
                <input className="bt-cerca" value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca" aria-label="Cerca allievo" />
                <ul className="bt-allievi">
                  {visti.map((a) => (
                    <li key={a.id}><span>{a.cognome} {a.nome}<span className="muto"> · {a.gruppo || 'Altri'}{a.data_nascita ? ` · ${dataBreve(a.data_nascita)}` : ' · senza data'}</span></span>
                      <span className="piccolo">{prenotati[a.id] ? `${prenotati[a.id]} posti` : ''}</span>
                      <button type="button" className="link-btn piccolo pericolo" onClick={() => togli(a)} aria-label={`Togli ${a.nome}`}>togli</button></li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------- una prenotazione
// modifica di una prenotazione dalla segreteria (query 176): dati e nomi sempre; persone ed extra finché non è pagata
function ModificaPrenotazione({ p, s, onFatto, onChiudi }) {
  const aperta = p.stato === 'da_pagare';
  const [v, setV] = useState({ nome: p.nome, cognome: p.cognome, email: p.email, telefono: p.telefono || '' });
  const [persone, setPersone] = useState((p.partecipanti || []).length ? p.partecipanti.map((x) => ({ ...x })) : [{ nome: p.nome, cognome: p.cognome }]);
  const [extra, setExtra] = useState(Object.fromEntries((p.extra || []).map((o) => [o.id, o.quantita])));
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState('');
  const opzioni = s?.extra || [];
  const contr = s?.contributo_per_posto ? (s.contributo_cent || 0) * persone.length : p.contributo_cent || 0;
  const totale = aperta ? contr + opzioni.reduce((n, o) => n + (extra[o.id] || 0) * (o.prezzo_cent || 0), 0) + (p.offerta_cent || 0) : p.totale_cent;
  const setP = (k, campo) => (e) => setPersone((x) => x.map((y, i) => (i === k ? { ...y, [campo]: e.target.value } : y)));
  async function salva() {
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().rpc('biglietteria_modifica', { p_prenotazione: p.id, p: {
      ...v, partecipanti: persone, extra: opzioni.map((o) => ({ id: o.id, quantita: extra[o.id] || 0 })) } });
    setInvio(false);
    if (error) { setErrore(erroreBiglietteria(error.message) || (error.message?.includes('biglietteria_modifica') ? 'Manca la query 176 in Supabase.' : `Non salvato: ${error.message}`)); return; }
    onFatto(totale !== p.totale_cent && aperta ? 'Salvata ✓ Nuovo importo: mandato di nuovo il promemoria di pagamento' : 'Salvata ✓');
  }
  return (
    <div className="bt-modifica">
      <div className="bt-campi">
        <div className="campo"><label>Nome</label><input value={v.nome} onChange={(e) => setV({ ...v, nome: e.target.value })} /></div>
        <div className="campo"><label>Cognome</label><input value={v.cognome} onChange={(e) => setV({ ...v, cognome: e.target.value })} /></div>
        <div className="campo"><label>Email</label><input type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></div>
        <div className="campo"><label>Telefono</label><input value={v.telefono} onChange={(e) => setV({ ...v, telefono: e.target.value })} /></div>
      </div>
      <strong className="piccolo">Persone ({persone.length})</strong>
      {persone.map((x, k) => (
        <div key={k} className="bt-modifica-persona">
          <span className="bg-num">{k + 1}</span>
          <input aria-label={`Nome persona ${k + 1}`} value={x.nome} onChange={setP(k, 'nome')} placeholder="Nome" />
          <input aria-label={`Cognome persona ${k + 1}`} value={x.cognome} onChange={setP(k, 'cognome')} placeholder="Cognome" />
          {persone.length > 1 && <button type="button" className="link-btn piccolo pericolo" onClick={() => setPersone((y) => y.filter((_, i) => i !== k))}>togli</button>}
        </div>
      ))}
      {aperta ? <button type="button" className="link-btn piccolo" onClick={() => setPersone((y) => [...y, { nome: '', cognome: '' }])}>+ aggiungi una persona</button>
        : <p className="piccolo muto">È già confermata: si possono correggere i nomi e togliere chi disdice (il suo biglietto non vale più e il posto torna libero;
          l&apos;incasso non cambia: se va restituito qualcosa fallo a parte). Per aggiungere persone fai una nuova prenotazione. Per toglierle tutte usa «Annulla».</p>}
      {aperta && opzioni.length > 0 && (
        <div className="bt-modifica-extra">
          {opzioni.map((o) => (
            <label key={o.id} className="bt-mini">{o.nome} ({euro(o.prezzo_cent)})
              <input inputMode="numeric" value={extra[o.id] ?? 0} onChange={(e) => setExtra((x) => ({ ...x, [o.id]: Math.max(0, Math.min(50, Number(e.target.value.replace(/\D/g, '')) || 0)) }))} /></label>
          ))}
        </div>
      )}
      <p className="piccolo">Totale: <strong>{totale ? euro(totale) : 'gratis'}</strong>{aperta && totale !== p.totale_cent ? ` (prima ${euro(p.totale_cent)}: al salvataggio parte di nuovo il promemoria di pagamento)` : ''}</p>
      {errore && <div className="errore" role="alert">{errore}</div>}
      <div className="azioni">
        <button type="button" className="btn btn-primario btn-piccolo" disabled={invio} onClick={salva}>{invio ? 'Salvo…' : 'Salva le modifiche'}</button>
        <button type="button" className="link-btn piccolo" onClick={onChiudi}>chiudi</button>
      </div>
    </div>
  );
}

function Riga({ p, s, ordine = [], perId = {}, onFatto }) {
  const [modifica, setModifica] = useState(false);
  const [metodo, setMetodo] = useState('satispay');
  const [invio, setInvio] = useState(false);
  const [msg, setMsg] = useState('');
  const st = statoDi(p);
  async function chiama(nome, args, ok) {
    setInvio(true); setMsg('');
    const { error } = await supabaseBrowser().rpc(nome, args);
    setInvio(false);
    if (error) { setMsg(`Non riuscito: ${error.message}`); return; }
    setMsg(ok); onFatto();
  }
  return (
    <li className={`bt-pren ${st}`}>
      <div className="bt-pren-testa">
        <strong>{p.nome} {p.cognome}</strong>
        <span className={`tag ${st === 'pagata' || st === 'gratis' ? 'tag-ok' : st === 'da_pagare' ? 'tag-attenzione' : 'tag-neutro'}`}>{STATI[st]}</span>
        <span className="bt-codice">{p.codice}</span>
      </div>
      <div className="piccolo">
        {s ? `${oraSpettacolo(s.inizio)} ${s.titolo}` : ''} · {p.posti} {p.posti === 1 ? 'posto' : 'posti'}{p.pizze ? ` · ${testoExtra(p.extra, p.pizze)}` : ''}
        {p.allievo_nome ? ` · per ${p.allievo_nome}` : ''} · <strong>{p.totale_cent ? euro(p.totale_cent) : 'gratis'}</strong>
        {(p.partecipanti || []).length > 0 && <span className="muto"> · {(p.partecipanti || []).map((x) => `${x.nome} ${x.cognome}`).join(', ')}</span>}
        {ordine.length > 1 && (
          <span className="bt-ordine"> · ordine di {ordine.length} eventi ({ordine.filter((x) => x.id !== p.id).map((x) => perId[x.spettacolo_id]?.titolo || 'altro').join(', ')}),
            totale {euro(ordine.reduce((n, x) => n + (x.stato !== 'annullata' ? x.totale_cent : 0), 0))}, codice {ordine.find((x) => x.id === (p.gruppo_id || p.id))?.codice || p.codice}</span>
        )}
        {p.offerta_cent ? ` (di cui offerta ${euro(p.offerta_cent)})` : ''}
      </div>
      <div className="piccolo muto">{p.email}{p.telefono ? ` · ${p.telefono}` : ''} · {dataBreve(p.created_at)}
        {p.pagata_at ? ` · pagata il ${dataBreve(p.pagata_at)}${p.metodo ? ` (${p.metodo})` : ''}` : ''}
        {st === 'da_pagare' && p.scade_at ? ` · posti tenuti fino al ${dataBreve(p.scade_at)}` : ''}</div>
      <div className="azioni">
        {(st === 'da_pagare' || st === 'scaduta') && (
          <>
            <select value={metodo} onChange={(e) => setMetodo(e.target.value)} aria-label="Come ha pagato">
              {METODI.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
            <button type="button" className="btn btn-primario btn-piccolo" disabled={invio}
                    onClick={() => chiama('biglietteria_conferma', { p_prenotazione: p.id, p_metodo: metodo }, ordine.length > 1 ? 'Confermato tutto l\'ordine: biglietti mandati per email ✓' : 'Confermata: biglietti mandati per email ✓')}>
              {ordine.length > 1 ? `Pagamento arrivato (${euro(ordine.reduce((n, x) => n + (x.stato !== 'annullata' ? x.totale_cent : 0), 0))}): manda tutti i biglietti` : 'Pagamento arrivato: manda i biglietti'}</button>
          </>
        )}
        {(st === 'pagata' || st === 'gratis') && (
          <>
            <a className="btn btn-piccolo" href={`/biglietti/${p.token}`} target="_blank" rel="noopener noreferrer">Biglietti</a>
            <button type="button" className="link-btn piccolo" disabled={invio} onClick={() => chiama('biglietteria_reinvia', { p_prenotazione: p.id }, 'Email rimessa in coda ✓')}>Rimanda email</button>
          </>
        )}
        {st !== 'annullata' && st !== 'scaduta' && <button type="button" className="link-btn piccolo" onClick={() => setModifica((x) => !x)}>Modifica</button>}
        {st !== 'annullata' && (
          <button type="button" className="link-btn piccolo pericolo" disabled={invio} onClick={() => {
            if (confirm(`Annullare la prenotazione ${p.codice} di ${p.nome} ${p.cognome}? I biglietti non varranno più.${p.stato === 'pagata' ? ' L\'incasso resta: se va restituito, fallo a parte.' : ''}`)) {
              chiama('biglietteria_annulla', { p_prenotazione: p.id }, 'Annullata');
            }
          }}>Annulla</button>
        )}
        {msg && <span className="piccolo" role="status">{msg}</span>}
      </div>
      {modifica && <ModificaPrenotazione p={p} s={s} onChiudi={() => setModifica(false)} onFatto={(t) => { setModifica(false); setMsg(t); onFatto(); }} />}
    </li>
  );
}

// ---------------------------------------------------------------- registro d'ingresso (online da spuntare, o stampato)
function Registro({ b, spettacoli, prenotazioni, biglietti }) {
  const conAllievi = spettacoli.length ? spettacoli : [];
  const [sp, setSp] = useState(conAllievi[0]?.id || '');
  const [ordine, setOrdine] = useState('prenotante');
  const [cerca, setCerca] = useState('');
  const [entrati, setEntrati] = useState(() => Object.fromEntries(biglietti.map((x) => [x.id, x.entrato_at])));
  const [errore, setErrore] = useState('');
  const s = spettacoli.find((x) => x.id === sp);
  const perPren = useMemo(() => {
    const m = {};
    for (const x of biglietti) (m[x.prenotazione_id] ||= []).push(x);
    for (const k of Object.keys(m)) m[k].sort((a, c) => a.numero - c.numero);
    return m;
  }, [biglietti]);
  const q = cerca.trim().toLowerCase();
  const righe = prenotazioni
    .filter((p) => p.spettacolo_id === sp && (p.stato === 'pagata' || p.stato === 'gratis'))
    .filter((p) => !q || `${p.nome} ${p.cognome} ${p.allievo_nome || ''} ${p.codice} ${(p.partecipanti || []).map((x) => `${x.nome} ${x.cognome}`).join(' ')}`.toLowerCase().includes(q))
    .sort((a, c) => (ordine === 'allievo'
      ? `${a.allievo_nome || 'zzz'} ${a.cognome}`.localeCompare(`${c.allievo_nome || 'zzz'} ${c.cognome}`, 'it')
      : `${a.cognome} ${a.nome}`.localeCompare(`${c.cognome} ${c.nome}`, 'it')));
  const tutti = righe.flatMap((p) => perPren[p.id] || []);
  const dentro = tutti.filter((x) => entrati[x.id]).length;
  const pizze = righe.reduce((n, p) => n + (p.pizze || 0), 0);
  const sommaExtra = Object.entries(righe.reduce((m, p) => { (p.extra || []).forEach((o) => { m[o.nome] = (m[o.nome] || 0) + o.quantita; }); return m; }, {}))
    .map(([n, q]) => `${q} × ${n}`).join(', ');
  async function segna(x, si) {
    setErrore('');
    setEntrati((e) => ({ ...e, [x.id]: si ? new Date().toISOString() : null }));
    const { error } = await supabaseBrowser().rpc('biglietteria_segna', { p_biglietto: x.id, p_entrato: si });
    if (error) { setEntrati((e) => ({ ...e, [x.id]: si ? null : x.entrato_at })); setErrore('Non salvato: controlla la connessione e riprova.'); }
  }
  const ora = (iso) => new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
  return (
    <section className="bt-registro">
      <div className="azioni bt-filtri bt-non-stampa">
        <select value={sp} onChange={(e) => setSp(e.target.value)} aria-label="Spettacolo">
          {spettacoli.map((x) => <option key={x.id} value={x.id}>{oraSpettacolo(x.inizio)} · {x.titolo}</option>)}
        </select>
        <select value={ordine} onChange={(e) => setOrdine(e.target.value)} aria-label="Ordine">
          <option value="prenotante">in ordine di cognome di chi ha prenotato</option>
          <option value="allievo">in ordine di allievo</option>
        </select>
        <input value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca nome, allievo, codice" aria-label="Cerca" />
        <button type="button" className="btn btn-primario btn-piccolo" onClick={() => window.print()}>Stampa il registro</button>
      </div>
      {errore && <div className="errore bt-non-stampa" role="alert">{errore}</div>}
      <div className="bt-reg-testa">
        <h2>{b.titolo} · {s ? `${s.titolo} · ${quandoSpettacolo(s.inizio)}` : ''}</h2>
        <p>{tutti.length} persone · {righe.length} prenotazioni{pizze ? ` · ${sommaExtra || `${pizze} pizze`}` : ''} · <span className="bt-non-stampa">entrati {dentro} su {tutti.length}</span></p>
      </div>
      {righe.length === 0 ? <div className="vuoto">Nessuna prenotazione confermata per questo spettacolo.</div> : (
        <table className="bt-reg-tabella">
          <thead><tr><th aria-label="Entrato">✓</th><th>Persona</th><th>Prenotato da</th>{s?.con_allievi && <th>Allievo/a</th>}{pizze > 0 && <th>Extra</th>}<th>Codice</th></tr></thead>
          <tbody>
            {righe.flatMap((p) => (perPren[p.id] || []).map((x, k) => (
              <tr key={x.id} className={`${entrati[x.id] ? 'tutti-dentro' : ''}${k === 0 ? ' prima' : ''}`}>
                <td className="bt-spunte">
                  <label className="bt-spunta" title={entrati[x.id] ? `entrato alle ${ora(entrati[x.id])}` : `biglietto ${x.numero}: ${x.codice}`}>
                    <input type="checkbox" checked={!!entrati[x.id]} onChange={(e) => segna(x, e.target.checked)} aria-label={`${x.nome || p.nome} entrato`} />
                    <span className="bt-casella" aria-hidden="true" />
                  </label>
                </td>
                <td><strong>{x.nome || `${p.nome} ${p.cognome} (${x.numero})`}</strong>{entrati[x.id] && <span className="piccolo bt-non-stampa"> · {ora(entrati[x.id])}</span>}</td>
                <td>{k === 0 ? <>{p.cognome} {p.nome}{p.telefono ? <span className="piccolo bt-non-stampa"> · {p.telefono}</span> : null}</> : <span className="muto">〃</span>}</td>
                {s?.con_allievi && <td>{p.allievo_nome || '—'}</td>}
                {pizze > 0 && <td>{k === 0 ? testoExtra(p.extra, p.pizze) : ''}</td>}
                <td className="bt-codice">{x.codice}</td>
              </tr>
            )))}
          </tbody>
        </table>
      )}
      <p className="piccolo muto bt-non-stampa">Una riga per persona (nome sul biglietto): spunta quando entra; vale come il QR, che poi risulta già usato.
        Stampato, le caselle sono da spuntare a penna. Ci sono solo le prenotazioni pagate o gratis.</p>
    </section>
  );
}

const csvCella = (v) => { const t = String(v ?? ''); return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };

// ---------------------------------------------------------------- la pagina
// iscritti aggiunti a mano dalla segreteria (query 177): posti scalati, biglietti con QR subito se pagata/omaggio
function AggiungiIscritti({ spettacoli, allievi, onChiudi, onFatto }) {
  const [sp, setSp] = useState(spettacoli[0]?.id || '');
  const s = spettacoli.find((x) => x.id === sp);
  const [cercaA, setCercaA] = useState('');
  const [allievoId, setAllievoId] = useState('');
  const [chi, setChi] = useState({ nome: '', cognome: '', email: '', telefono: '' });
  const [persone, setPersone] = useState([{ nome: '', cognome: '' }]);
  const [extra, setExtra] = useState({});
  const [modo, setModo] = useState('pagata');
  const [metodo, setMetodo] = useState('contanti');
  const [forza, setForza] = useState(false);
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState('');
  const [fatto, setFatto] = useState(null);
  const daiAllievi = allievi.filter((a) => a.spettacolo_id === sp);
  const q = cercaA.trim().toLowerCase();
  const filtrati = q.length >= 2 ? daiAllievi.filter((a) => `${a.nome} ${a.cognome} ${a.cognome} ${a.nome}`.toLowerCase().includes(q)).slice(0, 12) : [];
  const scelto = daiAllievi.find((a) => a.id === allievoId);
  const opzioni = s?.extra || [];
  const contr = s ? (s.contributo_per_posto ? (s.contributo_cent || 0) * persone.length : s.contributo_cent || 0) : 0;
  const totale = modo === 'omaggio' ? 0 : contr + opzioni.reduce((n, o) => n + (extra[o.id] || 0) * (o.prezzo_cent || 0), 0);
  const setP = (k, campo) => (e) => setPersone((x) => x.map((y, i) => (i === k ? { ...y, [campo]: e.target.value } : y)));
  async function salva() {
    setErrore('');
    const pers = persone.filter((x) => x.nome.trim() || x.cognome.trim());
    const nome = chi.nome.trim() || pers[0]?.nome || ''; const cognome = chi.cognome.trim() || pers[0]?.cognome || '';
    setInvio(true);
    const { data, error } = await supabaseBrowser().rpc('biglietteria_aggiungi', { p: {
      spettacolo_id: sp, allievo_id: allievoId || null, nome, cognome, email: chi.email.trim(), telefono: chi.telefono.trim(),
      partecipanti: pers, extra: opzioni.map((o) => ({ id: o.id, quantita: extra[o.id] || 0 })), modo, metodo, forza } });
    setInvio(false);
    if (error) {
      setErrore(erroreBiglietteria(error.message) || (error.message?.includes('biglietteria_aggiungi') ? 'Manca la query 177 in Supabase.' : `Non riuscito: ${error.message}`));
      return;
    }
    setFatto(data); onFatto();
  }
  if (fatto) {
    return (
      <section className="pannello bt-aggiungi">
        <h3>Aggiunta ✓ codice {fatto.codice}</h3>
        <p>{fatto.stato === 'da_pagare' ? `Da pagare ${euro(fatto.totale_cent)}: la trovi in «Da pagare».` : 'Biglietti con il QR pronti: aprili per stamparli o mostrarli.'}
          {chi.email.trim() ? ` Email a ${chi.email.trim()}.` : ' Nessuna email (non inserita).'}</p>
        <div className="azioni">
          {fatto.stato !== 'da_pagare' && <a className="btn btn-primario btn-piccolo" href={`/biglietti/${fatto.token}`} target="_blank" rel="noopener noreferrer">Apri / stampa i biglietti</a>}
          <button type="button" className="btn btn-piccolo" onClick={() => { setFatto(null); setPersone([{ nome: '', cognome: '' }]); setChi({ nome: '', cognome: '', email: '', telefono: '' }); setAllievoId(''); setCercaA(''); setExtra({}); setForza(false); }}>Aggiungine un&apos;altra</button>
          <button type="button" className="link-btn piccolo" onClick={onChiudi}>chiudi</button>
        </div>
      </section>
    );
  }
  return (
    <section className="pannello bt-aggiungi">
      <h3>Aggiungi iscritti a mano</h3>
      <p className="piccolo muto">I posti si scalano dalla disponibilità dell&apos;evento. Già pagata o omaggio: i biglietti con il QR si creano subito. L&apos;email è facoltativa.</p>
      <div className="bt-campi">
        <div className="campo bt-largo"><label>Evento</label>
          <select value={sp} onChange={(e) => { setSp(e.target.value); setAllievoId(''); setCercaA(''); setExtra({}); }}>
            {spettacoli.map((x) => <option key={x.id} value={x.id}>{oraSpettacolo(x.inizio)} · {x.titolo}</option>)}
          </select></div>
        {s?.con_allievi && (
          <div className="campo bt-largo"><label>Allievo/a (facoltativo)</label>
            {scelto ? (
              <div className="bg-allievo-trovato"><span><strong>{scelto.nome} {scelto.cognome}</strong> · {scelto.gruppo || 'Altri'}</span>
                <button type="button" className="link-btn piccolo" onClick={() => setAllievoId('')}>cambia</button></div>
            ) : (
              <>
                <input value={cercaA} onChange={(e) => setCercaA(e.target.value)} placeholder="Scrivi nome o cognome" />
                {filtrati.length > 0 && <ul className="bg-trovati">{filtrati.map((a) => (
                  <li key={a.id}><button type="button" onClick={() => setAllievoId(a.id)}><strong>{a.nome} {a.cognome}</strong><span className="piccolo muto"> · {a.gruppo || 'Altri'}</span></button></li>
                ))}</ul>}
              </>
            )}
          </div>
        )}
      </div>
      <strong className="piccolo">Persone ({persone.length})</strong>
      {persone.map((x, k) => (
        <div key={k} className="bt-modifica-persona">
          <span className="bg-num">{k + 1}</span>
          <input aria-label={`Nome persona ${k + 1}`} value={x.nome} onChange={setP(k, 'nome')} placeholder="Nome" />
          <input aria-label={`Cognome persona ${k + 1}`} value={x.cognome} onChange={setP(k, 'cognome')} placeholder="Cognome" />
          {persone.length > 1 && <button type="button" className="link-btn piccolo pericolo" onClick={() => setPersone((y) => y.filter((_, i) => i !== k))}>togli</button>}
        </div>
      ))}
      <button type="button" className="link-btn piccolo" onClick={() => setPersone((y) => [...y, { nome: '', cognome: '' }])}>+ aggiungi una persona</button>
      <div className="bt-campi">
        <div className="campo"><label>Prenotato da: nome <span className="muto">(vuoto = la 1ª persona)</span></label><input value={chi.nome} onChange={(e) => setChi({ ...chi, nome: e.target.value })} /></div>
        <div className="campo"><label>Cognome</label><input value={chi.cognome} onChange={(e) => setChi({ ...chi, cognome: e.target.value })} /></div>
        <div className="campo"><label>Email <span className="muto">(facoltativa: se c&apos;è, arrivano i biglietti)</span></label><input type="email" value={chi.email} onChange={(e) => setChi({ ...chi, email: e.target.value })} /></div>
        <div className="campo"><label>Telefono</label><input value={chi.telefono} onChange={(e) => setChi({ ...chi, telefono: e.target.value })} /></div>
      </div>
      {opzioni.length > 0 && (
        <div className="bt-modifica-extra">
          {opzioni.map((o) => (
            <label key={o.id} className="bt-mini">{o.nome} ({euro(o.prezzo_cent)})
              <input inputMode="numeric" value={extra[o.id] ?? 0} onChange={(e) => setExtra((x) => ({ ...x, [o.id]: Math.max(0, Math.min(50, Number(e.target.value.replace(/\D/g, '')) || 0)) }))} /></label>
          ))}
        </div>
      )}
      <div className="azioni">
        {[['pagata', 'Ha già pagato'], ['omaggio', 'Omaggio (gratis)'], ['da_pagare', 'Pagherà dopo']].map(([k, t]) => (
          <label key={k} className="spunta"><input type="radio" name="bt-modo" checked={modo === k} onChange={() => setModo(k)} /><span>{t}</span></label>
        ))}
        {modo === 'pagata' && <select value={metodo} onChange={(e) => setMetodo(e.target.value)} aria-label="Come ha pagato">{METODI.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>}
      </div>
      <p className="piccolo">Totale: <strong>{totale ? euro(totale) : 'gratis'}</strong>{modo === 'pagata' && totale ? ' (va negli Incassi)' : ''}
        {scelto && !s?.contributo_per_posto && s?.contributo_cent ? ' · se per questo allievo c\'è già una prenotazione il contributo non si ripaga' : ''}</p>
      <label className="spunta"><input type="checkbox" checked={forza} onChange={(e) => setForza(e.target.checked)} />
        <span>Aggiungi anche oltre i limiti (posti per allievo finiti o sala piena)</span></label>
      {errore && <div className="errore" role="alert">{errore}{/esauriti|finiti/.test(errore) ? ' Se vuoi aggiungerli lo stesso, spunta «oltre i limiti».' : ''}</div>}
      <div className="azioni">
        <button type="button" className="btn btn-primario" disabled={invio || !sp} onClick={salva}>{invio ? 'Un attimo…' : 'Aggiungi'}</button>
        <button type="button" className="link-btn piccolo" onClick={onChiudi}>chiudi</button>
      </div>
    </section>
  );
}

export default function Biglietteria({ palestraId, tutte, b, spettacoli, allievi, prenotazioni, riepilogo, biglietti = [], stripe }) {
  const router = useRouter();
  const [scheda, setScheda] = useState(spettacoli.length ? 'prenotazioni' : 'spettacoli');
  const [filtro, setFiltro] = useState('da_pagare');
  const [aggiungi, setAggiungi] = useState(false);
  const [sp, setSp] = useState('');
  const [cerca, setCerca] = useState('');
  const [nuova, setNuova] = useState(!b);
  const [imp, setImp] = useState(b ? { titolo: b.titolo, sottotitolo: b.sottotitolo || '', link_pagamento: b.link_pagamento || '', istruzioni_pagamento: b.istruzioni_pagamento || '', giorni_per_pagare: String(b.giorni_per_pagare), paga_in_segreteria: !!b.paga_in_segreteria, scadenza_attiva: b.scadenza_attiva !== false, stripe: b.stripe, locandina_url: b.locandina_url || null, locandina_mobile_url: b.locandina_mobile_url || null } : null);
  const [esitoImp, setEsitoImp] = useState('');
  const aggiorna = () => router.refresh();
  const perId = Object.fromEntries(spettacoli.map((s) => [s.id, s]));
  const prenotati = useMemo(() => {
    const m = {};
    for (const p of prenotazioni) if (p.allievo_id && ['pagata', 'gratis', 'da_pagare'].includes(statoDi(p))) m[p.allievo_id] = (m[p.allievo_id] || 0) + p.posti;
    return m;
  }, [prenotazioni]);
  const q = cerca.trim().toLowerCase();
  // codice dell'ordine (quello nell'email): è il codice della prenotazione "capo"
  const codiceOrdine = Object.fromEntries(prenotazioni.map((p) => [p.id, p.codice]));
  const codiceQ = /^[a-z0-9]{6}$/.test(q) ? q : '';
  const visibili = prenotazioni.filter((p) => {
    const st = statoDi(p);
    const ordine = (codiceOrdine[p.gruppo_id || p.id] || p.codice).toLowerCase();
    // scrivendo un codice si vede tutto l'ordine, qualunque sia lo stato (non serve cambiare filtro)
    if (codiceQ && (ordine === codiceQ || p.codice.toLowerCase() === codiceQ)) return !sp || p.spettacolo_id === sp;
    if (q && filtro !== 'tutte') { /* cercando, si guarda in tutte le prenotazioni */ } else {
    if (filtro === 'da_pagare' && st !== 'da_pagare') return false;
    if (filtro === 'confermate' && !['pagata', 'gratis'].includes(st)) return false;
    if (filtro === 'altre' && !['annullata', 'scaduta'].includes(st)) return false;
    }
    if (sp && p.spettacolo_id !== sp) return false;
    return !q || `${p.nome} ${p.cognome} ${p.email} ${p.codice} ${ordine} ${p.allievo_nome || ''} ${p.telefono || ''} ${(p.partecipanti || []).map((x) => `${x.nome} ${x.cognome}`).join(' ')}`.toLowerCase().includes(q);
  });
  const conta = (f) => prenotazioni.filter((p) => { const st = statoDi(p); return f === 'da_pagare' ? st === 'da_pagare' : f === 'confermate' ? ['pagata', 'gratis'].includes(st) : f === 'altre' ? ['annullata', 'scaduta'].includes(st) : true; }).length;

  async function apriChiudi() {
    const { error } = await supabaseBrowser().from('biglietterie').update({ aperta: !b.aperta }).eq('id', b.id);
    if (!error) aggiorna();
  }
  async function salvaImp() {
    setEsitoImp('');
    const link = imp.link_pagamento.trim();
    if (link && !/^https?:\/\//i.test(link)) { setEsitoImp('Il link di pagamento deve iniziare con https://'); return; }
    const { error } = await supabaseBrowser().from('biglietterie').update({
      titolo: imp.titolo.trim() || b.titolo, sottotitolo: imp.sottotitolo.trim() || null, link_pagamento: link || null,
      istruzioni_pagamento: imp.istruzioni_pagamento.trim() || null, giorni_per_pagare: Math.max(1, Number(imp.giorni_per_pagare) || 4), paga_in_segreteria: !!imp.paga_in_segreteria, scadenza_attiva: !!imp.scadenza_attiva, stripe: !!imp.stripe,
      locandina_url: imp.locandina_url || null, locandina_mobile_url: imp.locandina_mobile_url || null,
    }).eq('id', b.id);
    setEsitoImp(error ? `Non salvato: ${error.message}` : 'Salvato ✓');
    if (!error) aggiorna();
  }
  async function nuovoSpettacolo() {
    const { error } = await supabaseBrowser().from('biglietteria_spettacoli').insert({
      biglietteria_id: b.id, palestra_id: palestraId, titolo: `Evento ${spettacoli.length + 1}`, ordine: spettacoli.length + 1,
      inizio: spettacoli[spettacoli.length - 1]?.inizio || new Date().toISOString(), con_allievi: false, offerta_libera: false,
      contributo_cent: 0, contributo_per_posto: false, posti_per_allievo: 2, max_per_prenotazione: 10, chiuso: false,
    });
    if (!error) aggiorna();
  }
  function esporta() {
    const righe = [['Codice', 'Stato', 'Spettacolo', 'Nome', 'Cognome', 'Email', 'Telefono', 'Allievo', 'Posti', 'Persone', 'Extra', 'Offerta €', 'Totale €', 'Metodo', 'Prenotata', 'Pagata']];
    for (const p of visibili) {
      righe.push([p.codice, STATI[statoDi(p)], perId[p.spettacolo_id]?.titolo, p.nome, p.cognome, p.email, p.telefono, p.allievo_nome, p.posti,
        (p.partecipanti || []).map((x) => `${x.nome} ${x.cognome}`).join(', '), testoExtra(p.extra, p.pizze),
        euroTesto(p.offerta_cent), euroTesto(p.totale_cent), p.metodo, dataBreve(p.created_at), p.pagata_at ? dataBreve(p.pagata_at) : '']);
    }
    const blob = new Blob(['﻿' + righe.map((r) => r.map(csvCella).join(';')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `prenotazioni-${b.slug}.csv`; a.click(); URL.revokeObjectURL(a.href);
  }

  if (nuova || !b) {
    return (
      <main className="pagina-larga bt">
        <div className="intestazione"><h1>Biglietteria saggio</h1></div>
        <Nuova palestraId={palestraId} onFatto={(id) => { setNuova(false); router.push(`/gestione/biglietteria?b=${id}`); router.refresh(); }} />
        {b && <button type="button" className="link-btn" onClick={() => setNuova(false)}>Torna a {b.titolo}</button>}
      </main>
    );
  }

  const linkPubblico = typeof window !== 'undefined' ? `${window.location.origin}/saggio?b=${b.slug}` : `/saggio?b=${b.slug}`;
  return (
    <main className="pagina-larga bt">
      <div className="intestazione bt-testa">
        <div>
          <h1>{b.titolo}</h1>
          <p className="piccolo">
            <span className={`tag ${b.aperta ? 'tag-ok' : 'tag-neutro'}`}>{b.aperta ? 'prenotazioni aperte' : 'chiusa al pubblico'}</span>{' '}
            Link per il pubblico: <a href={`/saggio?b=${b.slug}`} target="_blank" rel="noopener noreferrer">/saggio</a>{' '}
            <button type="button" className="link-btn piccolo" onClick={() => { try { navigator.clipboard.writeText(linkPubblico); } catch { /* niente */ } }}>copia link</button>
          </p>
        </div>
        <div className="azioni">
          <button type="button" className={`btn ${b.aperta ? '' : 'btn-primario'}`} onClick={apriChiudi}>{b.aperta ? 'Chiudi le prenotazioni' : 'Apri le prenotazioni'}</button>
          <Link href="/gestione/biglietteria/ingresso" className="btn" prefetch={false}>Ingresso (QR)</Link>
          {tutte.length > 1 && (
            <select value={b.id} onChange={(e) => router.push(`/gestione/biglietteria?b=${e.target.value}`)} aria-label="Biglietteria">
              {tutte.map((x) => <option key={x.id} value={x.id}>{x.titolo}</option>)}
            </select>
          )}
          <button type="button" className="link-btn piccolo" onClick={() => setNuova(true)}>Nuova biglietteria</button>
        </div>
      </div>

      <div className="bt-riepilogo">
        {riepilogo.map((r) => (
          <div key={r.spettacolo_id} className="bt-tessera">
            <strong>{r.titolo}</strong>
            <span>{r.posti_confermati}{r.capienza != null ? ` / ${r.capienza}` : ''} posti confermati{r.posti_in_attesa ? ` · ${r.posti_in_attesa} da pagare` : ''}</span>
            <span className="piccolo">{r.allievi ? `${r.allievi} allievi in elenco · ` : ''}{r.pizze ? `${r.pizze} extra ordinati · ` : ''}incassato {euro(r.incassato_cent)}{r.da_incassare_cent ? ` · attesi ${euro(r.da_incassare_cent)}` : ''}</span>
            {r.entrati > 0 && <span className="piccolo">entrati {r.entrati}</span>}
          </div>
        ))}
      </div>

      <nav className="bt-schede" aria-label="Sezioni">
        {[['prenotazioni', 'Prenotazioni'], ['registro', 'Registro ingresso'], ['spettacoli', 'Eventi'], ['allievi', 'Elenco allievi'], ['impostazioni', 'Pagamento e testi']].map(([k, t]) => (
          <button key={k} type="button" aria-current={scheda === k ? 'page' : undefined} onClick={() => setScheda(k)}>{t}</button>
        ))}
      </nav>

      {scheda === 'prenotazioni' && (
        <section>
          <div className="azioni bt-filtri">
            {[['da_pagare', 'Da pagare'], ['confermate', 'Confermate'], ['altre', 'Annullate e scadute'], ['tutte', 'Tutte']].map(([k, t]) => (
              <button key={k} type="button" className="bt-filtro" aria-pressed={filtro === k} onClick={() => setFiltro(k)}>{t} ({conta(k)})</button>
            ))}
            <select value={sp} onChange={(e) => setSp(e.target.value)} aria-label="Spettacolo">
              <option value="">Tutti gli spettacoli</option>
              {spettacoli.map((s) => <option key={s.id} value={s.id}>{oraSpettacolo(s.inizio)} · {s.titolo}</option>)}
            </select>
            <input value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca codice (es. PK72EY), nome, persona, email" aria-label="Cerca" />
            <button type="button" className="btn btn-piccolo" onClick={esporta} disabled={!visibili.length}>Esporta CSV</button>
            <button type="button" className="btn btn-primario btn-piccolo" onClick={() => setAggiungi((x) => !x)} disabled={!spettacoli.length}>Aggiungi iscritti a mano</button>
          </div>
          {aggiungi && <AggiungiIscritti spettacoli={spettacoli} allievi={allievi} onChiudi={() => setAggiungi(false)} onFatto={aggiorna} />}
          {q && <p className="piccolo muto">Cercando si guarda in tutte le prenotazioni (pagate, da pagare, annullate). Con il codice dell&apos;email compare tutto l&apos;ordine: ogni evento con le sue persone, e «Modifica» per cambiarle.</p>}
          {filtro === 'da_pagare' && <p className="piccolo muto">Controlla Satispay (o il conto): nella causale c&apos;è il codice. Chi ha prenotato più eventi insieme paga una volta sola: confermandone uno si conferma tutto l&apos;ordine. Trovato il pagamento, premi «Pagamento arrivato»: partono i biglietti per email e l&apos;incasso va negli Incassi.</p>}
          {visibili.length === 0 ? <div className="vuoto">Nessuna prenotazione qui.</div> : (
            <ul className="bt-prenotazioni">{visibili.map((p) => <Riga key={p.id} p={p} s={perId[p.spettacolo_id]} perId={perId}
                ordine={p.gruppo_id ? prenotazioni.filter((x) => x.gruppo_id === p.gruppo_id) : []} onFatto={aggiorna} />)}</ul>
          )}
        </section>
      )}

      {scheda === 'registro' && <Registro key={biglietti.length} b={b} spettacoli={spettacoli} prenotazioni={prenotazioni} biglietti={biglietti} />}

      {scheda === 'spettacoli' && (
        <>
          {spettacoli.map((s) => <Spettacolo key={`${s.id}-${s.inizio}-${s.titolo}`} s={s} nPren={prenotazioni.filter((p) => p.spettacolo_id === s.id).length} onSalvato={aggiorna} />)}
          {spettacoli.length === 0 && <div className="vuoto">Nessun evento ancora: aggiungine uno (o quanti ne servono).</div>}
          <button type="button" className="btn" onClick={nuovoSpettacolo}>Aggiungi un evento</button>
          <p className="piccolo muto">Gli orari sono quelli del giorno scelto: {spettacoli.map((s) => quandoSpettacolo(s.inizio)).join(' · ')}</p>
        </>
      )}

      {scheda === 'allievi' && (
        <>
          <p className="piccolo muto">Il pubblico sceglie spettacolo → gruppo → allievo (vede solo nome e iniziale del cognome) e, se nell&apos;evento è
            attivo, conferma con la data di nascita dell&apos;allievo (si toglie nella scheda Eventi, evento per evento). Ogni allievo ha i suoi posti fino al giorno &quot;posti liberi a tutti&quot; (scheda Spettacoli): da lì in poi chiunque prenota quelli rimasti.</p>
          {spettacoli.some((s) => s.con_allievi)
            ? <Allievi b={b} spettacoli={spettacoli} allievi={allievi} prenotati={prenotati} onFatto={aggiorna} />
            : <div className="vuoto">Nessuno spettacolo con elenco allievi.</div>}
        </>
      )}

      {scheda === 'impostazioni' && imp && (
        <section className="pannello">
          <div className="bt-campi">
            <div className="bt-largo bt-locandine">
              <Immagine url={imp.locandina_url} cartella="biglietteria" etichetta="Locandina (pagina di benvenuto, computer)" onChange={(url) => setImp({ ...imp, locandina_url: url })} />
              <Immagine url={imp.locandina_mobile_url} cartella="biglietteria" etichetta="Locandina per il telefono (facoltativa, verticale)" onChange={(url) => setImp({ ...imp, locandina_mobile_url: url })} />
              <p className="piccolo muto">Chi apre il link vede prima la locandina a tutto schermo: toccandola si apre la prenotazione. Senza quella del telefono, sul telefono si vede la stessa.
                Ricordati di premere «Salva».</p>
            </div>
            <div className="campo bt-largo"><label htmlFor="bi-t">Titolo</label><input id="bi-t" value={imp.titolo} onChange={(e) => setImp({ ...imp, titolo: e.target.value })} /></div>
            <div className="campo bt-largo"><label htmlFor="bi-s">Testo in cima alla pagina (regole)</label><textarea id="bi-s" rows={5} value={imp.sottotitolo} onChange={(e) => setImp({ ...imp, sottotitolo: e.target.value })} /></div>
            <div className="campo bt-largo"><label htmlFor="bi-l">Link di pagamento (es. il link Satispay della scuola)</label>
              <input id="bi-l" value={imp.link_pagamento} onChange={(e) => setImp({ ...imp, link_pagamento: e.target.value })} placeholder="https://…" /></div>
            <div className="campo bt-largo"><label htmlFor="bi-i">Istruzioni per il pagamento</label>
              <textarea id="bi-i" rows={3} value={imp.istruzioni_pagamento} onChange={(e) => setImp({ ...imp, istruzioni_pagamento: e.target.value })}
                        placeholder="es. Paga con Satispay alla scuola Ritmo Metropolitano e scrivi il codice nel messaggio." /></div>
            <label className="spunta bt-largo"><input type="checkbox" checked={!!imp.scadenza_attiva} onChange={(e) => setImp({ ...imp, scadenza_attiva: e.target.checked })} />
              <span>Le prenotazioni non pagate scadono dopo i giorni qui sotto (i posti tornano liberi). Se la togli restano tenute finché le confermi o le annulli tu.
                Gli eventi gratuiti sono sempre confermati subito.</span></label>
            <div className="campo"><label htmlFor="bi-g">Giorni lavorativi per pagare (scade alle 23:59 dell&apos;ultimo; sabati, domeniche e festivi non contano)</label>
              <input id="bi-g" inputMode="numeric" disabled={!imp.scadenza_attiva} value={imp.giorni_per_pagare} onChange={(e) => setImp({ ...imp, giorni_per_pagare: e.target.value })} /></div>
            <label className="spunta bt-largo"><input type="checkbox" checked={!!imp.paga_in_segreteria} onChange={(e) => setImp({ ...imp, paga_in_segreteria: e.target.checked })} />
              <span>Si può pagare anche in segreteria (nel promemoria: «oppure passa in segreteria a saldare la prenotazione entro …, oltre la prenotazione decade»)</span></label>
            <label className="spunta"><input type="checkbox" checked={!!imp.stripe} disabled={!stripe && !imp.stripe} onChange={(e) => setImp({ ...imp, stripe: e.target.checked })} />
              <span>Pagamento anche con carta (Stripe): confermato da solo, biglietti subito{!stripe ? ' — Stripe non è attivo sul sito' : ''}</span></label>
          </div>
          <div className="azioni"><button type="button" className="btn btn-primario" onClick={salvaImp}>Salva</button>{esitoImp && <span className="piccolo">{esitoImp}</span>}</div>
        </section>
      )}
    </main>
  );
}
