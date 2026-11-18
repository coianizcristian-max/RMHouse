'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { euro, dataBreve } from '@/lib/formato';
import { oraSpettacolo, quandoSpettacolo } from '@/lib/biglietteria';
import { leggiCsv, leggiData } from '@/lib/csv';
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

// ---------------------------------------------------------------- creazione (con i 3 eventi del saggio di Natale)
function Nuova({ palestraId, onFatto }) {
  const [titolo, setTitolo] = useState('Saggio di Natale');
  const [data, setData] = useState('2026-12-20');
  const [liberi, setLiberi] = useState('2026-12-08');
  const [pizza, setPizza] = useState('2026-12-12');
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  async function crea() {
    setInvio(true); setErrore('');
    const db = supabaseBrowser();
    const slug = `${titolo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${data.slice(0, 4)}`;
    const { data: b, error } = await db.from('biglietterie').insert({ palestra_id: palestraId, slug, titolo, sottotitolo: REGOLE, aperta: false }).select('id').single();
    if (error) { setInvio(false); setErrore(error.message.includes('duplicate') ? 'Esiste già una biglietteria con questo nome e anno.' : `Non riuscito: ${error.message}`); return; }
    const alle = (hm) => new Date(`${data}T${hm}:00`).toISOString();
    const base = { biglietteria_id: b.id, palestra_id: palestraId };
    const { error: e2 } = await db.from('biglietteria_spettacoli').insert([
      { ...base, ordine: 1, titolo: 'Christmas Aerial e Pole Dance show', inizio: alle('15:30'), con_allievi: true, posti_per_allievo: 2, liberi_dal: liberi || null, contributo_cent: 1000 },
      { ...base, ordine: 2, titolo: 'Christmas Streetdance show', inizio: alle('18:00'), con_allievi: true, posti_per_allievo: 2, liberi_dal: liberi || null, contributo_cent: 1000 },
      { ...base, ordine: 3, titolo: 'Party con DJ set', inizio: alle('19:00'), con_allievi: false, contributo_cent: 0, offerta_libera: true, pizza_cent: 800, pizza_entro: pizza || null },
    ]);
    setInvio(false);
    if (e2) { setErrore(`Spettacoli non creati: ${e2.message}`); return; }
    onFatto(b.id);
  }
  return (
    <section className="pannello bt-nuova">
      <h2>Nuova biglietteria</h2>
      <p className="piccolo muto">Crea i 3 eventi del saggio con le regole di Erika (si possono cambiare dopo): 15:30 aerea e pole, 18:00 street
        (2 posti per allievo, contributo 10 €), 19:00 party (ingresso libero, raccolta fondi facoltativa, pizza 8 €). Nasce chiusa: la apri quando è pronta.</p>
      <div className="bt-campi">
        <div className="campo"><label htmlFor="bn-t">Titolo</label><input id="bn-t" value={titolo} onChange={(e) => setTitolo(e.target.value)} /></div>
        <div className="campo"><label htmlFor="bn-d">Giorno del saggio</label><input id="bn-d" type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
        <div className="campo"><label htmlFor="bn-l">Posti liberi a tutti dal</label><input id="bn-l" type="date" value={liberi} onChange={(e) => setLiberi(e.target.value)} /></div>
        <div className="campo"><label htmlFor="bn-p">Pizza prenotabile entro</label><input id="bn-p" type="date" value={pizza} onChange={(e) => setPizza(e.target.value)} /></div>
      </div>
      {errore && <div className="errore" role="alert">{errore}</div>}
      <button type="button" className="btn btn-primario" disabled={invio || !titolo.trim() || !data} onClick={crea}>{invio ? 'Un attimo…' : 'Crea la biglietteria'}</button>
    </section>
  );
}

// ---------------------------------------------------------------- uno spettacolo (modifica)
function Spettacolo({ s, nPren, onSalvato }) {
  const [v, setV] = useState({
    titolo: s.titolo, descrizione: s.descrizione || '', inizio: perInput(s.inizio), con_allievi: s.con_allievi, posti_per_allievo: String(s.posti_per_allievo),
    liberi_dal: s.liberi_dal || '', capienza: s.capienza == null ? '' : String(s.capienza), max_per_prenotazione: String(s.max_per_prenotazione),
    contributo: euroTesto(s.contributo_cent), contributo_per_posto: s.contributo_per_posto, offerta_libera: s.offerta_libera,
    pizza: euroTesto(s.pizza_cent), pizza_entro: s.pizza_entro || '', chiuso: s.chiuso,
  });
  const [esito, setEsito] = useState('');
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  async function salva() {
    setEsito('');
    if (!v.titolo.trim() || !v.inizio) { setEsito('Titolo e data/ora servono.'); return; }
    const { error } = await supabaseBrowser().from('biglietteria_spettacoli').update({
      titolo: v.titolo.trim(), descrizione: v.descrizione.trim() || null, inizio: daInput(v.inizio), con_allievi: v.con_allievi,
      posti_per_allievo: Math.max(1, Number(v.posti_per_allievo) || 2), liberi_dal: v.liberi_dal || null,
      capienza: v.capienza === '' ? null : Math.max(0, Number(v.capienza) || 0), max_per_prenotazione: Math.max(1, Number(v.max_per_prenotazione) || 10),
      contributo_cent: centDa(v.contributo) || 0, contributo_per_posto: v.contributo_per_posto, offerta_libera: v.offerta_libera,
      pizza_cent: centDa(v.pizza), pizza_entro: v.pizza_entro || null, chiuso: v.chiuso,
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
          </>
        )}
        <div className="campo"><label>Max posti per prenotazione</label><input inputMode="numeric" value={v.max_per_prenotazione} onChange={set('max_per_prenotazione')} /></div>
        <label className="spunta"><input type="checkbox" checked={v.offerta_libera} onChange={set('offerta_libera')} /><span>offerta libera per la raccolta fondi</span></label>
        <div className="campo"><label>Pizza € (vuoto = niente)</label><input inputMode="decimal" value={v.pizza} onChange={set('pizza')} /></div>
        <div className="campo"><label>Pizza entro il</label><input type="date" value={v.pizza_entro} onChange={set('pizza_entro')} /></div>
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
function Riga({ p, s, onFatto }) {
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
        {s ? `${oraSpettacolo(s.inizio)} ${s.titolo}` : ''} · {p.posti} {p.posti === 1 ? 'posto' : 'posti'}{p.pizze ? ` · ${p.pizze} pizz${p.pizze === 1 ? 'a' : 'e'}` : ''}
        {p.allievo_nome ? ` · per ${p.allievo_nome}` : ''} · <strong>{p.totale_cent ? euro(p.totale_cent) : 'gratis'}</strong>
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
                    onClick={() => chiama('biglietteria_conferma', { p_prenotazione: p.id, p_metodo: metodo }, 'Confermata: biglietti mandati per email ✓')}>
              Pagamento arrivato: manda i biglietti</button>
          </>
        )}
        {(st === 'pagata' || st === 'gratis') && (
          <>
            <a className="btn btn-piccolo" href={`/biglietti/${p.token}`} target="_blank" rel="noopener noreferrer">Biglietti</a>
            <button type="button" className="link-btn piccolo" disabled={invio} onClick={() => chiama('biglietteria_reinvia', { p_prenotazione: p.id }, 'Email rimessa in coda ✓')}>Rimanda email</button>
          </>
        )}
        {st !== 'annullata' && (
          <button type="button" className="link-btn piccolo pericolo" disabled={invio} onClick={() => {
            if (confirm(`Annullare la prenotazione ${p.codice} di ${p.nome} ${p.cognome}? I biglietti non varranno più.${p.stato === 'pagata' ? ' L\'incasso resta: se va restituito, fallo a parte.' : ''}`)) {
              chiama('biglietteria_annulla', { p_prenotazione: p.id }, 'Annullata');
            }
          }}>Annulla</button>
        )}
        {msg && <span className="piccolo" role="status">{msg}</span>}
      </div>
    </li>
  );
}

const csvCella = (v) => { const t = String(v ?? ''); return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };

// ---------------------------------------------------------------- la pagina
export default function Biglietteria({ palestraId, tutte, b, spettacoli, allievi, prenotazioni, riepilogo, stripe }) {
  const router = useRouter();
  const [scheda, setScheda] = useState('prenotazioni');
  const [filtro, setFiltro] = useState('da_pagare');
  const [sp, setSp] = useState('');
  const [cerca, setCerca] = useState('');
  const [nuova, setNuova] = useState(!b);
  const [imp, setImp] = useState(b ? { titolo: b.titolo, sottotitolo: b.sottotitolo || '', link_pagamento: b.link_pagamento || '', istruzioni_pagamento: b.istruzioni_pagamento || '', giorni_per_pagare: String(b.giorni_per_pagare), stripe: b.stripe } : null);
  const [esitoImp, setEsitoImp] = useState('');
  const aggiorna = () => router.refresh();
  const perId = Object.fromEntries(spettacoli.map((s) => [s.id, s]));
  const prenotati = useMemo(() => {
    const m = {};
    for (const p of prenotazioni) if (p.allievo_id && ['pagata', 'gratis', 'da_pagare'].includes(statoDi(p))) m[p.allievo_id] = (m[p.allievo_id] || 0) + p.posti;
    return m;
  }, [prenotazioni]);
  const q = cerca.trim().toLowerCase();
  const visibili = prenotazioni.filter((p) => {
    const st = statoDi(p);
    if (filtro === 'da_pagare' && st !== 'da_pagare') return false;
    if (filtro === 'confermate' && !['pagata', 'gratis'].includes(st)) return false;
    if (filtro === 'altre' && !['annullata', 'scaduta'].includes(st)) return false;
    if (sp && p.spettacolo_id !== sp) return false;
    return !q || `${p.nome} ${p.cognome} ${p.email} ${p.codice} ${p.allievo_nome || ''} ${p.telefono || ''}`.toLowerCase().includes(q);
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
      istruzioni_pagamento: imp.istruzioni_pagamento.trim() || null, giorni_per_pagare: Math.max(1, Number(imp.giorni_per_pagare) || 4), stripe: !!imp.stripe,
    }).eq('id', b.id);
    setEsitoImp(error ? `Non salvato: ${error.message}` : 'Salvato ✓');
    if (!error) aggiorna();
  }
  async function nuovoSpettacolo() {
    const { error } = await supabaseBrowser().from('biglietteria_spettacoli').insert({
      biglietteria_id: b.id, palestra_id: palestraId, titolo: 'Nuovo spettacolo', ordine: spettacoli.length + 1,
      inizio: spettacoli[0]?.inizio || new Date().toISOString(), con_allievi: false,
    });
    if (!error) aggiorna();
  }
  function esporta() {
    const righe = [['Codice', 'Stato', 'Spettacolo', 'Nome', 'Cognome', 'Email', 'Telefono', 'Allievo', 'Posti', 'Pizze', 'Offerta €', 'Totale €', 'Metodo', 'Prenotata', 'Pagata']];
    for (const p of visibili) {
      righe.push([p.codice, STATI[statoDi(p)], perId[p.spettacolo_id]?.titolo, p.nome, p.cognome, p.email, p.telefono, p.allievo_nome, p.posti, p.pizze,
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
            <span className="piccolo">{r.allievi ? `${r.allievi} allievi in elenco · ` : ''}{r.pizze ? `${r.pizze} pizze · ` : ''}incassato {euro(r.incassato_cent)}{r.da_incassare_cent ? ` · attesi ${euro(r.da_incassare_cent)}` : ''}</span>
            {r.entrati > 0 && <span className="piccolo">entrati {r.entrati}</span>}
          </div>
        ))}
      </div>

      <nav className="bt-schede" aria-label="Sezioni">
        {[['prenotazioni', 'Prenotazioni'], ['spettacoli', 'Spettacoli'], ['allievi', 'Elenco allievi'], ['impostazioni', 'Pagamento e testi']].map(([k, t]) => (
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
            <input value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca nome, codice, email" aria-label="Cerca" />
            <button type="button" className="btn btn-piccolo" onClick={esporta} disabled={!visibili.length}>Esporta CSV</button>
          </div>
          {filtro === 'da_pagare' && <p className="piccolo muto">Controlla Satispay (o il conto): nella causale c&apos;è il codice. Trovato il pagamento, premi «Pagamento arrivato»: partono i biglietti per email e l&apos;incasso va negli Incassi.</p>}
          {visibili.length === 0 ? <div className="vuoto">Nessuna prenotazione qui.</div> : (
            <ul className="bt-prenotazioni">{visibili.map((p) => <Riga key={p.id} p={p} s={perId[p.spettacolo_id]} onFatto={aggiorna} />)}</ul>
          )}
        </section>
      )}

      {scheda === 'spettacoli' && (
        <>
          {spettacoli.map((s) => <Spettacolo key={`${s.id}-${s.inizio}-${s.titolo}`} s={s} nPren={prenotazioni.filter((p) => p.spettacolo_id === s.id).length} onSalvato={aggiorna} />)}
          <button type="button" className="btn" onClick={nuovoSpettacolo}>Aggiungi uno spettacolo</button>
          <p className="piccolo muto">Gli orari sono quelli del giorno scelto: {spettacoli.map((s) => quandoSpettacolo(s.inizio)).join(' · ')}</p>
        </>
      )}

      {scheda === 'allievi' && (
        <>
          <p className="piccolo muto">Il pubblico sceglie spettacolo → gruppo → allievo (vede solo nome e iniziale del cognome) e conferma con la data di
            nascita dell&apos;allievo. Ogni allievo ha i suoi posti fino al giorno &quot;posti liberi a tutti&quot; (scheda Spettacoli): da lì in poi chiunque prenota quelli rimasti.</p>
          {spettacoli.some((s) => s.con_allievi)
            ? <Allievi b={b} spettacoli={spettacoli} allievi={allievi} prenotati={prenotati} onFatto={aggiorna} />
            : <div className="vuoto">Nessuno spettacolo con elenco allievi.</div>}
        </>
      )}

      {scheda === 'impostazioni' && imp && (
        <section className="pannello">
          <div className="bt-campi">
            <div className="campo bt-largo"><label htmlFor="bi-t">Titolo</label><input id="bi-t" value={imp.titolo} onChange={(e) => setImp({ ...imp, titolo: e.target.value })} /></div>
            <div className="campo bt-largo"><label htmlFor="bi-s">Testo in cima alla pagina (regole)</label><textarea id="bi-s" rows={5} value={imp.sottotitolo} onChange={(e) => setImp({ ...imp, sottotitolo: e.target.value })} /></div>
            <div className="campo bt-largo"><label htmlFor="bi-l">Link di pagamento (es. il link Satispay della scuola)</label>
              <input id="bi-l" value={imp.link_pagamento} onChange={(e) => setImp({ ...imp, link_pagamento: e.target.value })} placeholder="https://…" /></div>
            <div className="campo bt-largo"><label htmlFor="bi-i">Istruzioni per il pagamento</label>
              <textarea id="bi-i" rows={3} value={imp.istruzioni_pagamento} onChange={(e) => setImp({ ...imp, istruzioni_pagamento: e.target.value })}
                        placeholder="es. Paga con Satispay alla scuola Ritmo Metropolitano e scrivi il codice nel messaggio." /></div>
            <div className="campo"><label htmlFor="bi-g">Giorni per pagare (poi i posti si liberano)</label>
              <input id="bi-g" inputMode="numeric" value={imp.giorni_per_pagare} onChange={(e) => setImp({ ...imp, giorni_per_pagare: e.target.value })} /></div>
            <label className="spunta"><input type="checkbox" checked={!!imp.stripe} disabled={!stripe && !imp.stripe} onChange={(e) => setImp({ ...imp, stripe: e.target.checked })} />
              <span>Pagamento anche con carta (Stripe): confermato da solo, biglietti subito{!stripe ? ' — Stripe non è attivo sul sito' : ''}</span></label>
          </div>
          <div className="azioni"><button type="button" className="btn btn-primario" onClick={salvaImp}>Salva</button>{esitoImp && <span className="piccolo">{esitoImp}</span>}</div>
        </section>
      )}
    </main>
  );
}
