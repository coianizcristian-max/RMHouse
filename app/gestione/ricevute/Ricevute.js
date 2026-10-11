'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { euro, dataBreve } from '@/lib/formato';
import EmettiFattura from '../EmettiFattura';

const METODI = [['contanti', 'Contanti'], ['pos', 'POS'], ['bonifico', 'Bonifico'], ['satispay', 'Satispay'], ['online', 'Online'], ['assegno', 'Assegno'], ['altro', 'Altro']];
const DOCUMENTI = [['ricevuta', 'Ricevute'], ['fattura', 'Fatture'], ['nota_credito', 'Note di credito']];
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const CAUSALI = { abbonamento: 'Abbonamenti', quota_iscrizione: 'Quote annuali', prova: 'Prove', workshop: 'Workshop', affitto: 'Affitto sale', altro: 'Altro' };
const ISO = (d) => d.toISOString().slice(0, 10);

// icone piccole delle azioni (una riga sola, niente spazio in più)
const I = {
  stampa: <path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2M7 14h10v7H7z" />,
  pdf: <path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" />,
  invia: <path d="m3 11 18-8-8 18-2-8-8-2Z" />,
  modifica: <path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4ZM13.5 6.5l4 4" />,
  rimborso: <path d="M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" />,
  annulla: <><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></>,
};
const Icona = ({ n }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{I[n]}</svg>
);
const valore = (r) => (r.annullata ? 0 : (r.tipo_documento === 'nota_credito' ? -1 : 1) * (r.importo_cent + r.iva_cent));

export default function Ricevute({ palestraId, righeIniziali, mancantiIniziali, tipi, dal, al, oggi, meseStagione = 9, vistaIniziale = 'elenco', errore: erroreIniziale = '' }) {
  const router = useRouter();
  const [vista, setVista] = useState(vistaIniziale);
  const [f, setF] = useState({ dal, al, metodi: [], tipo: '', documenti: [], cliente: null });
  const [righe, setRighe] = useState(righeIniziali);
  const [mancanti, setMancanti] = useState(mancantiIniziali);
  const [carico, setCarico] = useState(false);
  const [errore, setErrore] = useState(erroreIniziale);
  const [avviso, setAvviso] = useState('');
  const [invio, setInvio] = useState(false);
  const [scelti, setScelti] = useState([]);
  const [fattura, setFattura] = useState(null);
  const [aperta, setAperta] = useState(null);    // { id, cosa: 'invia' | 'modifica' }
  const primo = useRef(true);

  // i filtri si applicano subito (si rilegge dal database)
  const chiave = JSON.stringify([f.dal, f.al, f.metodi, f.tipo, f.documenti, f.cliente?.id]);
  useEffect(() => {
    if (primo.current) { primo.current = false; return undefined; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.dal) || !/^\d{4}-\d{2}-\d{2}$/.test(f.al) || f.dal > f.al) return undefined;
    let vivo = true;
    const t = setTimeout(async () => {
      setCarico(true);
      const db = supabaseBrowser();
      const [{ data, error }, { data: m }] = await Promise.all([
        db.rpc('cerca_ricevute', {
          p_palestra: palestraId, p_dal: f.dal, p_al: f.al, p_metodi: f.metodi.length ? f.metodi : null,
          p_tipi: f.tipo ? [f.tipo] : null, p_documenti: f.documenti.length ? f.documenti : null,
          p_allievo: f.cliente?.tipo === 'allievo' ? f.cliente.id : null, p_account: f.cliente?.tipo === 'account' ? f.cliente.id : null,
        }),
        db.rpc('ricevute_mancanti', { p_palestra: palestraId, p_dal: f.dal, p_al: f.al }),
      ]);
      if (!vivo) return;
      setCarico(false);
      if (error) { setErrore('Non riesco a leggere le ricevute: riprova.'); return; }
      setErrore(''); setRighe(Array.isArray(data) ? data : []); setMancanti(m || []);
      try { window.history.replaceState(null, '', `/gestione/ricevute?dal=${f.dal}&al=${f.al}${vista === 'statistiche' ? '&vista=statistiche' : ''}`); } catch { /* niente */ }
    }, 250);
    return () => { vivo = false; clearTimeout(t); };
  }, [chiave]); // eslint-disable-line react-hooks/exhaustive-deps

  async function ricarica() {
    const { data } = await supabaseBrowser().rpc('cerca_ricevute', {
      p_palestra: palestraId, p_dal: f.dal, p_al: f.al, p_metodi: f.metodi.length ? f.metodi : null, p_tipi: f.tipo ? [f.tipo] : null,
      p_documenti: f.documenti.length ? f.documenti : null, p_allievo: f.cliente?.tipo === 'allievo' ? f.cliente.id : null,
      p_account: f.cliente?.tipo === 'account' ? f.cliente.id : null,
    });
    if (Array.isArray(data)) setRighe(data);
    const { data: m } = await supabaseBrowser().rpc('ricevute_mancanti', { p_palestra: palestraId, p_dal: f.dal, p_al: f.al });
    setMancanti(m || []);
    router.refresh();
  }

  // periodi pronti
  const o = new Date(`${oggi}T12:00:00Z`); const y = o.getUTCFullYear(), mm = o.getUTCMonth();
  const annoStag = mm + 1 >= meseStagione ? y : y - 1;
  const periodi = [
    ['Questo mese', ISO(new Date(Date.UTC(y, mm, 1))), oggi],
    ['Mese scorso', ISO(new Date(Date.UTC(y, mm - 1, 1))), ISO(new Date(Date.UTC(y, mm, 0)))],
    ['Ultimi 60 giorni', ISO(new Date(Date.UTC(y, mm, o.getUTCDate() - 60))), oggi],
    [`Stagione ${annoStag}/${String(annoStag + 1).slice(2)}`, ISO(new Date(Date.UTC(annoStag, meseStagione - 1, 1))), oggi],
    [`Anno ${y}`, `${y}-01-01`, oggi],
    [`Anno ${y - 1}`, `${y - 1}-01-01`, `${y - 1}-12-31`],
  ];
  const tocca = (k, v) => setF((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((z) => z !== v) : [...x[k], v] }));
  const filtriAttivi = f.metodi.length + f.documenti.length + (f.tipo ? 1 : 0) + (f.cliente ? 1 : 0);

  // ------------------------------------------------------------ azioni (come prima)
  async function emetti(ids) {
    if (ids.length === 0) return;
    if (!confirm(`Emettere ${ids.length} ricevute? La numerazione è progressiva e non si può riusare.`)) return;
    setInvio(true); setErrore(''); setAvviso('');
    const { data, error } = await supabaseBrowser().rpc('emetti_ricevute_blocco', { p_pagamenti: ids });
    setInvio(false);
    if (error) { setErrore('Emissione non riuscita.'); return; }
    setAvviso(`Emesse ${data.emesse} ricevute${(data.saltate || []).length ? `, ${data.saltate.length} saltate` : ''}.`);
    setScelti([]); ricarica();
  }
  async function notaCredito(r) {
    const totale = (r.importo_cent + r.iva_cent) / 100;
    const doc = r.tipo_documento === 'fattura' ? 'fattura' : 'ricevuta';
    const importo = prompt(`${doc === 'fattura' ? 'Nota di credito (storno) sulla fattura' : 'Rimborso sulla ricevuta'} n. ${r.numero}/${r.anno}: quanto (€), IVA compresa? Massimo ${totale.toFixed(2).replace('.', ',')}`,
      totale.toFixed(2).replace('.', ','));
    if (!importo) return;
    const motivo = prompt(`Motivo ${doc === 'fattura' ? 'dello storno' : 'del rimborso'} (va stampato sulla nota di credito):`);
    if (!motivo) return;
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().rpc('emetti_nota_credito', {
      p_ricevuta: r.id, p_importo_cent: Math.round(parseFloat(importo.replace(',', '.')) * 100), p_motivo: motivo,
    });
    setInvio(false);
    if (error) { setErrore(error.message?.includes('importo_non_valido') ? 'Importo non valido: non può superare quanto resta della ricevuta.' : 'Nota di credito non emessa.'); return; }
    setAvviso(doc === 'fattura' ? 'Nota di credito emessa: scarica il suo XML e caricalo come la fattura.' : 'Nota di credito emessa.'); ricarica();
  }
  async function annulla(r) {
    const motivo = prompt(`Perché annulli ${r.tipo_documento === 'fattura' ? 'la fattura' : 'la ricevuta'} n. ${r.numero}? Il numero resta occupato.${r.tipo_documento === 'fattura' ? " Se l'XML è già stato trasmesso NON annullarla: serve una nota di credito." : ''}`);
    if (!motivo) return;
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().rpc('annulla_ricevuta', { p_id: r.id, p_motivo: motivo });
    setInvio(false);
    if (error) { setErrore('Annullamento non riuscito.'); return; }
    ricarica();
  }

  // ------------------------------------------------------------ conti per le tessere e le statistiche
  const stat = useMemo(() => {
    const valide = righe.filter((r) => !r.annullata);
    const ric = valide.filter((r) => r.tipo_documento !== 'nota_credito');
    const nc = valide.filter((r) => r.tipo_documento === 'nota_credito');
    const totale = valide.reduce((t, r) => t + valore(r), 0);
    const per = (chiaveDi) => {
      const m = new Map();
      for (const r of valide) { const k = chiaveDi(r); const x = m.get(k) || { n: 0, cent: 0 }; x.n += r.tipo_documento === 'nota_credito' ? 0 : 1; x.cent += valore(r); m.set(k, x); }
      return [...m.entries()].map(([k, v]) => ({ k, ...v })).sort((a, b) => b.cent - a.cent);
    };
    const mesi = per((r) => r.data.slice(0, 7)).sort((a, b) => a.k.localeCompare(b.k));
    const numeri = ric.filter((r) => r.tipo_documento === 'ricevuta').map((r) => r.numero);
    return {
      n: ric.length, totale, media: ric.length ? Math.round(ric.reduce((t, r) => t + r.importo_cent + r.iva_cent, 0) / ric.length) : 0,
      annullate: righe.filter((r) => r.annullata).length, nc: nc.length, ncCent: nc.reduce((t, r) => t + r.importo_cent + r.iva_cent, 0),
      fatture: ric.filter((r) => r.tipo_documento === 'fattura'), iva: valide.reduce((t, r) => t + (r.tipo_documento === 'nota_credito' ? -r.iva_cent : r.iva_cent), 0),
      dal: numeri.length ? Math.min(...numeri) : null, al: numeri.length ? Math.max(...numeri) : null,
      mesi, metodi: per((r) => r.metodo || 'non indicato'), tipi: per((r) => r.tipo_nome || (CAUSALI[r.causale] || 'Altro')),
      causali: per((r) => CAUSALI[r.causale] || (r.tipo_documento === 'fattura' ? 'Fatture' : 'Altro')),
    };
  }, [righe]);
  const daScaricare = stat.fatture.filter((r) => !r.xml_scaricato_at);

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Conti</div>
        <h1>Ricevute, fatture e note di credito</h1>
        <p>Cerca per periodo, come hanno pagato, abbonamento, documento o cliente (scrivendo il genitore escono anche quelle dei figli).
          Su ogni documento: stampa, PDF, reinvia, modifica, rimborso, annulla.</p>
      </div>

      <div className="linguette-pagina ric-linguette" role="tablist">
        <button type="button" role="tab" aria-selected={vista === 'elenco'} className={vista === 'elenco' ? 'attiva' : ''} onClick={() => setVista('elenco')}>Elenco</button>
        <button type="button" role="tab" aria-selected={vista === 'statistiche'} className={vista === 'statistiche' ? 'attiva' : ''} onClick={() => setVista('statistiche')}>Statistiche</button>
      </div>

      <section className="ric-filtri" aria-label="Filtri">
        <div className="pastiglie ric-periodi">
          {periodi.map(([t, d1, d2]) => (
            <button key={t} type="button" className="stato-pillola" aria-pressed={f.dal === d1 && f.al === d2} onClick={() => setF((x) => ({ ...x, dal: d1, al: d2 }))}>{t}</button>
          ))}
          <span className="ric-date">
            <input type="date" value={f.dal} onChange={(e) => setF((x) => ({ ...x, dal: e.target.value }))} aria-label="Dal" />
            <span className="muto">→</span>
            <input type="date" value={f.al} onChange={(e) => setF((x) => ({ ...x, al: e.target.value }))} aria-label="Al" />
          </span>
        </div>
        <div className="ric-riga-filtri">
          <ClienteFiltro palestraId={palestraId} valore={f.cliente} onScegli={(c) => setF((x) => ({ ...x, cliente: c }))} />
          <select value={f.tipo} onChange={(e) => setF((x) => ({ ...x, tipo: e.target.value }))} aria-label="Tipo di abbonamento">
            <option value="">Tutti gli abbonamenti</option>
            {tipi.filter((t) => !t.archiviato).map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            {tipi.some((t) => t.archiviato) && (
              <optgroup label="Archiviati">{tipi.filter((t) => t.archiviato).map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}</optgroup>
            )}
          </select>
        </div>
        <div className="pastiglie ric-chips">
          {METODI.map(([k, t]) => <button key={k} type="button" className="stato-pillola" aria-pressed={f.metodi.includes(k)} onClick={() => tocca('metodi', k)}>{t}</button>)}
          <span className="ric-sep" aria-hidden="true" />
          {DOCUMENTI.map(([k, t]) => <button key={k} type="button" className="stato-pillola" aria-pressed={f.documenti.includes(k)} onClick={() => tocca('documenti', k)}>{t}</button>)}
          {filtriAttivi > 0 && <button type="button" className="link-btn piccolo" onClick={() => setF((x) => ({ ...x, metodi: [], documenti: [], tipo: '', cliente: null }))}>togli i filtri</button>}
          <span className="ric-carico" aria-live="polite">{carico ? 'Cerco…' : `${righe.length} documenti`}</span>
          {f.cliente && righe.some(minore) && (
            <a className="link-btn piccolo" href={`/api/dichiarazioni/pdf?ricevute=${righe.filter(minore).slice(0, 300).map((r) => r.id).join(',')}`}
               title="Una dichiarazione per ogni ricevuta dei ragazzi in questo elenco">730 di queste ({righe.filter(minore).length})</a>
          )}
          {f.cliente?.tipo === 'allievo' && righe.some(minore) && (
            <a className="link-btn piccolo" href={`/api/dichiarazioni/pdf?anno=${String(f.al).slice(0, 4)}&allievo=${f.cliente.id}`}
               title="Una sola dichiarazione con tutto quello che ha versato nell'anno">730 dell&apos;anno {String(f.al).slice(0, 4)}</a>
          )}
          <a className="link-btn piccolo" href={`/api/incassi/csv?dal=${f.dal}&al=${f.al}`}>CSV per il commercialista</a>
        </div>
      </section>

      {errore && <div className="errore" role="alert">{errore}</div>}
      {avviso && <div className="avviso-ok" role="status">{avviso}</div>}

      <div className="kpi-home ric-kpi">
        <div className="tessera tessera-rossa"><div className="etichetta">Documenti</div><div className="cifra">{stat.n}</div>
          <div className="sotto">{stat.dal ? `ricevute dalla n. ${stat.dal} alla n. ${stat.al}` : '—'}</div></div>
        <div className="tessera"><div className="etichetta">Totale netto</div><div className="cifra">{euro(stat.totale)}</div>
          <div className="sotto">media {euro(stat.media)}</div></div>
        <div className="tessera"><div className="etichetta">Note di credito</div><div className="cifra">{stat.nc}</div>
          <div className="sotto">{euro(stat.ncCent)} · {stat.annullate} annullati</div></div>
        <div className="tessera"><div className="etichetta">Fatture</div><div className="cifra">{stat.fatture.length}</div>
          <div className="sotto">IVA {euro(stat.iva)}{daScaricare.length ? ` · ${daScaricare.length} XML da scaricare` : ''}</div></div>
        <div className="tessera tessera-nera"><div className="etichetta">Incassi senza ricevuta</div><div className="cifra">{mancanti.length}</div>
          <div className="sotto">{filtriAttivi ? 'nel periodo, per tutti' : 'nel periodo'}</div></div>
      </div>

      {vista === 'statistiche' ? <Statistiche stat={stat} /> : (
        <>
          {mancanti.length > 0 && !filtriAttivi && (
            <>
              <h2 className="sezione">Da emettere</h2>
              <div className="azioni-riga" style={{ marginBottom: 10 }}>
                <button className="btn" onClick={() => setScelti(scelti.length === mancanti.length ? [] : mancanti.map((m) => m.pagamento_id))}>
                  {scelti.length === mancanti.length ? 'Togli la spunta a tutti' : 'Spunta tutti'}
                </button>
                <button className="btn btn-primario" disabled={invio || scelti.length === 0} onClick={() => emetti(scelti)}>Emetti {scelti.length} ricevute</button>
              </div>
              <ul className="elenco">
                {mancanti.map((m) => (
                  <li key={m.pagamento_id} className="persona">
                    <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <label className="spunta" style={{ margin: 0 }}>
                        <input type="checkbox" checked={scelti.includes(m.pagamento_id)} aria-label={`Ricevuta per ${m.descrizione}`}
                               onChange={() => setScelti((v) => (v.includes(m.pagamento_id) ? v.filter((x) => x !== m.pagamento_id) : [...v, m.pagamento_id]))} />
                        <span />
                      </label>
                      <span>{m.descrizione}<span className="piccolo muto" style={{ display: 'block' }}>{dataBreve(m.data)} · {m.cliente} · {m.metodo || 'metodo non indicato'}</span></span>
                    </span>
                    <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <strong>{euro(m.importo_cent)}</strong>
                      <button className="link-btn piccolo" disabled={invio} onClick={() => emetti([m.pagamento_id])}>ricevuta</button>
                      <button className="link-btn piccolo" onClick={() => setFattura(fattura === m.pagamento_id ? null : m.pagamento_id)}>fattura</button>
                    </span>
                    {fattura === m.pagamento_id && <div style={{ gridColumn: '1 / -1' }}><EmettiFattura pagamentoId={m.pagamento_id} onChiudi={() => { setFattura(null); ricarica(); }} /></div>}
                  </li>
                ))}
              </ul>
            </>
          )}

          <h2 className="sezione">Emesse</h2>
          {righe.length === 0 && <div className="vuoto">Nessun documento con questi filtri.</div>}
          <ul className="ric-elenco">
            {righe.map((r) => (
              <RigaRicevuta key={r.id} r={r} invio={invio} aperta={aperta?.id === r.id ? aperta.cosa : null}
                            onApri={(cosa) => setAperta(aperta?.id === r.id && aperta.cosa === cosa ? null : { id: r.id, cosa })}
                            onRimborso={() => notaCredito(r)} onAnnulla={() => annulla(r)} onFatto={(msg) => { setAvviso(msg); setAperta(null); ricarica(); }}
                            onXml={() => setTimeout(ricarica, 1500)} />
            ))}
          </ul>
          {righe.length >= 5000 && <p className="piccolo muto">Mostro i primi 5000: restringi il periodo.</p>}
        </>
      )}

      <p className="piccolo muto" style={{ marginTop: 18 }}>
        Modifica: nomi, codice fiscale, indirizzo, descrizione e metodo si correggono sulla stessa ricevuta; se cambia l&apos;importo
        la ricevuta viene annullata (il numero resta, annullato) e se ne fa una nuova. Per un abbonamento la modifica si fa dallo
        Sportello, con tutti i dati già caricati. Le fatture già trasmesse non si modificano: si stornano con la nota di credito.
        Ricevute, fatture e note di credito hanno numerazioni separate, ripartono da 1 ogni anno, senza buchi.
      </p>
    </>
  );
}

// per la dichiarazione del 730: ragazzi dai 5 ai 18 anni alla data della ricevuta (query 158 dà la data di nascita)
function minore(r) {
  if (!r.nascita || r.annullata || r.tipo_documento === 'nota_credito') return false;
  const [a, m, g] = r.nascita.split('-').map(Number); const [A, M, G] = String(r.data).split('-').map(Number);
  const eta = A - a - (M < m || (M === m && G < g) ? 1 : 0);
  return eta >= 5 && eta < 19;
}

// ---------------------------------------------------------------- una riga dell'elenco con le sue azioni
function RigaRicevuta({ r, invio, aperta, onApri, onRimborso, onAnnulla, onFatto, onXml }) {
  const fattura = r.tipo_documento === 'fattura' || (r.tipo_documento === 'nota_credito' && r.rif_tipo === 'fattura');
  const ricevuta = r.tipo_documento === 'ricevuta';
  const nc = r.tipo_documento === 'nota_credito';
  const modificabile = !r.annullata && ricevuta;
  const linkModifica = modificabile && r.iscrizione_id && r.allievo_id ? `/gestione/sportello?persona=${r.allievo_id}&modifica=${r.iscrizione_id}` : null;
  return (
    <li className={`ric-riga${r.annullata ? ' annullata' : ''}`}>
      <div className="ric-testo">
        <div className="ric-titolo">
          {nc && <span className="tag tag-attenzione">nota di credito</span>}
          {r.tipo_documento === 'fattura' && <span className="tag tag-tenue">fattura</span>}
          <strong>{r.codice ? `${r.codice} ` : ''}n. {r.numero}/{r.anno}</strong>
          <span className="ric-chi">{r.intestatario}{r.cliente && r.cliente !== r.intestatario ? <span className="muto"> · per {r.cliente}</span> : null}</span>
        </div>
        <div className="piccolo muto ric-sotto">
          {dataBreve(r.data)} · {r.descrizione} · {r.metodo || 'metodo non indicato'}
          {r.annullata && <b className="ric-annullata"> · ANNULLATA: {r.motivo_annullo}</b>}
        </div>
      </div>
      <div className="ric-destra">
        <strong className="ric-importo" style={{ textDecoration: r.annullata ? 'line-through' : 'none' }}>{nc ? '−' : ''}{euro(r.importo_cent + r.iva_cent)}</strong>
        <span className="ric-azioni" role="group" aria-label={`Azioni sulla ${nc ? 'nota di credito' : fattura ? 'fattura' : 'ricevuta'} n. ${r.numero}`}>
          <Link prefetch={false} className="ric-ico" href={`/gestione/ricevute/${r.id}`} target="_blank" data-tip="Stampa" aria-label="Stampa"><Icona n="stampa" /></Link>
          {minore(r) && <a className="ric-ico ric-730" href={`/api/dichiarazioni/pdf?ricevute=${r.id}`} data-tip="Dichiarazione per il 730 (PDF)" aria-label="Dichiarazione per il 730">730</a>}
          <a className="ric-ico" href={`/api/ricevute/${r.id}/pdf`} data-tip="Scarica il PDF" aria-label="Scarica il PDF"><Icona n="pdf" /></a>
          <button type="button" className="ric-ico" disabled={r.annullata} aria-pressed={aperta === 'invia'} onClick={() => onApri('invia')} data-tip="Reinvia (email o WhatsApp)" aria-label="Reinvia"><Icona n="invia" /></button>
          {linkModifica
            ? <Link prefetch={false} className="ric-ico" href={linkModifica} data-tip="Modifica (apre lo Sportello con l'abbonamento)" aria-label="Modifica"><Icona n="modifica" /></Link>
            : <button type="button" className="ric-ico" disabled={!modificabile} aria-pressed={aperta === 'modifica'} onClick={() => onApri('modifica')}
                      data-tip={modificabile ? 'Modifica' : fattura ? 'Le fatture si correggono con la nota di credito' : 'Non modificabile'} aria-label="Modifica"><Icona n="modifica" /></button>}
          <button type="button" className="ric-ico" disabled={invio || r.annullata || nc} onClick={onRimborso} data-tip={fattura ? 'Nota di credito (storno)' : 'Rimborso (nota di credito)'} aria-label="Rimborso"><Icona n="rimborso" /></button>
          <button type="button" className="ric-ico pericolo" disabled={invio || r.annullata} onClick={onAnnulla} data-tip="Annulla" aria-label="Annulla"><Icona n="annulla" /></button>
          {fattura && !r.annullata && (
            <a className={`ric-xml${r.xml_scaricato_at ? '' : ' xml-nuovo'}`} href={`/api/fatture/xml/${r.id}`} onClick={onXml}
               data-tip={r.xml_scaricato_at ? 'XML già scaricato' : 'XML da scaricare e caricare sul portale'}>XML</a>
          )}
        </span>
      </div>
      {aperta === 'invia' && <Reinvia r={r} onFatto={onFatto} />}
      {aperta === 'modifica' && <ModificaRicevuta r={r} onFatto={onFatto} />}
    </li>
  );
}

function Reinvia({ r, onFatto }) {
  const [email, setEmail] = useState(r.email || '');
  const [invio, setInvio] = useState(false);
  const [msg, setMsg] = useState('');
  const link = typeof window !== 'undefined' && r.token ? `${window.location.origin}/ricevuta/${r.token}` : '';
  const tipo = r.tipo_documento === 'nota_credito' ? 'nota di credito' : r.tipo_documento === 'fattura' ? 'fattura' : 'ricevuta';
  const testo = `Ciao${r.nome_account ? ` ${r.nome_account}` : ''}, ecco la ${tipo} n. ${r.numero}/${r.anno} del ${dataBreve(r.data)} di ${euro(r.importo_cent + r.iva_cent)} (${r.descrizione}). La apri, la stampi o la scarichi in PDF da qui: ${link}`;
  const tel = String(r.telefono || '').replace(/\D/g, '').replace(/^0+/, '');
  const wa = `https://wa.me/${tel ? (tel.startsWith('39') && tel.length > 10 ? tel : `39${tel}`) : ''}?text=${encodeURIComponent(testo)}`;
  async function manda(e) {
    e.preventDefault();
    setInvio(true); setMsg('');
    const { data, error } = await supabaseBrowser().rpc('invia_ricevuta_email', { p_id: r.id, p_email: email.trim() || null });
    setInvio(false);
    if (error) { setMsg(error.message?.includes('email_mancante') ? 'Manca un indirizzo email valido.' : 'Invio non riuscito.'); return; }
    onFatto(`Ricevuta n. ${r.numero}/${r.anno} in partenza a ${data} (arriva entro pochi minuti).`);
  }
  return (
    <form className="ric-pannello" onSubmit={manda}>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="indirizzo email" aria-label="Email" required />
      <button className="btn btn-piccolo btn-primario" disabled={invio}>{invio ? 'Invio…' : 'Manda per email'}</button>
      <a className="btn btn-piccolo" href={wa} target="_blank" rel="noreferrer">WhatsApp</a>
      {msg && <span className="piccolo" style={{ color: 'var(--rosso-scuro)' }}>{msg}</span>}
    </form>
  );
}

// le ricevute che non sono di un abbonamento: dati sulla stessa ricevuta, importo con ricevuta nuova
function ModificaRicevuta({ r, onFatto }) {
  const totale = r.importo_cent + r.iva_cent;
  const [m, setM] = useState({ intestatario: r.intestatario || '', codice_fiscale: r.codice_fiscale || '', indirizzo: r.indirizzo || '',
    descrizione: r.descrizione || '', metodo: r.metodo || 'contanti', importo: (totale / 100).toFixed(2).replace('.', ',') });
  const [invio, setInvio] = useState(false);
  const [msg, setMsg] = useState('');
  const cent = Math.round(parseFloat(String(m.importo).replace(',', '.')) * 100);
  const cambiaImporto = Number.isFinite(cent) && cent !== totale;
  const set = (k) => (e) => setM((x) => ({ ...x, [k]: e.target.value }));
  async function salva(e) {
    e.preventDefault();
    if (!Number.isFinite(cent) || cent <= 0) { setMsg('Controlla l\'importo.'); return; }
    if (!confirm(cambiaImporto
      ? `Cambia l'importo da ${euro(totale)} a ${euro(cent)}: la ricevuta n. ${r.numero}/${r.anno} viene ANNULLATA e se ne fa una nuova. Procedere?`
      : `Viene modificata la ricevuta n. ${r.numero}/${r.anno}. Procedere?`)) return;
    setInvio(true); setMsg('');
    const { data, error } = await supabaseBrowser().rpc('modifica_ricevuta', { p_id: r.id, p: {
      intestatario: m.intestatario, codice_fiscale: m.codice_fiscale, indirizzo: m.indirizzo, descrizione: m.descrizione, metodo: m.metodo,
      importo_cent: cent } });
    setInvio(false);
    if (error) {
      setMsg(error.message?.includes('modifica_ricevuta') ? 'Manca la query 155 in Supabase.' : error.message?.includes('senza_incasso') ? 'Questa ricevuta non ha un incasso: l\'importo non si può cambiare.' : 'Modifica non riuscita.');
      return;
    }
    onFatto(data?.nuova ? `Ricevuta n. ${r.numero}/${r.anno} annullata e sostituita da una nuova con ${euro(cent)}.` : `Ricevuta n. ${r.numero}/${r.anno} modificata.`);
  }
  return (
    <form className="ric-pannello ric-modifica" onSubmit={salva}>
      <div className="campo"><label>Intestatario</label><input value={m.intestatario} onChange={set('intestatario')} /></div>
      <div className="campo"><label>Codice fiscale</label><input value={m.codice_fiscale} onChange={(e) => setM((x) => ({ ...x, codice_fiscale: e.target.value.toUpperCase().replace(/\s/g, '').slice(0, 16) }))} /></div>
      <div className="campo ric-largo"><label>Indirizzo</label><input value={m.indirizzo} onChange={set('indirizzo')} /></div>
      <div className="campo ric-largo"><label>Descrizione</label><input value={m.descrizione} onChange={set('descrizione')} /></div>
      <div className="campo"><label>Pagato con</label>
        <select value={m.metodo} onChange={set('metodo')}>{METODI.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
      <div className="campo"><label>Importo €</label><input inputMode="decimal" value={m.importo} onChange={set('importo')} /></div>
      {cambiaImporto && <p className="ric-avviso ric-largo" role="alert">Attenzione: cambiando l&apos;importo la ricevuta n. {r.numero}/{r.anno} viene annullata e se ne fa una nuova con un nuovo numero.</p>}
      <div className="ric-largo azioni-riga">
        <button className="btn btn-piccolo btn-primario" disabled={invio}>{invio ? 'Salvo…' : 'Salva la modifica'}</button>
        {msg && <span className="piccolo" style={{ color: 'var(--rosso-scuro)' }}>{msg}</span>}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- filtro cliente: allievi e chi paga per altri
function ClienteFiltro({ palestraId, valore, onScegli }) {
  const [testo, setTesto] = useState('');
  const [esiti, setEsiti] = useState([]);
  useEffect(() => {
    if (testo.trim().length < 2) { setEsiti([]); return undefined; }
    let vivo = true;
    const t = setTimeout(async () => {
      const { data } = await supabaseBrowser().rpc('cerca_clienti_ricevute', { p_palestra: palestraId, p_testo: testo });
      if (vivo) setEsiti(Array.isArray(data) ? data : []);
    }, 250);
    return () => { vivo = false; clearTimeout(t); };
  }, [testo, palestraId]);
  if (valore) {
    return (
      <span className="ric-cliente-scelto">
        <b>{valore.testo}</b> <span className="muto piccolo">{valore.tipo === 'account' ? 'e i figli' : String(valore.sotto || '').split(' · ')[0]}</span>
        <button type="button" className="ric-togli" onClick={() => onScegli(null)} aria-label="Togli il cliente">×</button>
      </span>
    );
  }
  return (
    <div className="ric-cliente">
      <input type="search" value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Cliente o genitore" aria-label="Cliente" />
      {esiti.length > 0 && (
        <ul className="ric-esiti" role="listbox">
          {esiti.map((x) => (
            <li key={`${x.tipo}-${x.id}`}>
              <button type="button" role="option" aria-selected="false" onClick={() => { onScegli(x); setTesto(''); setEsiti([]); }}>
                <b>{x.testo}</b> <span className="muto piccolo">{x.sotto} · {x.n ? `${x.n} ${x.n === 1 ? 'documento' : 'documenti'}` : 'nessun documento'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- statistiche delle ricevute (stessi filtri)
function Barre({ titolo, righe, etichetta = (k) => k, max = 12 }) {
  const top = righe.slice(0, max);
  const m = Math.max(1, ...top.map((x) => Math.abs(x.cent)));
  const tot = righe.reduce((t, x) => t + x.cent, 0);
  return (
    <section className="pannello ric-barre">
      <h3>{titolo}</h3>
      {top.length === 0 ? <p className="muto piccolo">Niente nel periodo.</p> : (
        <ul>
          {top.map((x) => (
            <li key={x.k}>
              <span className="ric-b-nome">{etichetta(x.k)}</span>
              <span className="ric-b-barra"><span style={{ width: `${Math.max(2, Math.round((Math.abs(x.cent) / m) * 100))}%` }} /></span>
              <span className="ric-b-val"><b>{euro(x.cent)}</b> <span className="muto">{x.n} · {tot ? Math.round((x.cent / tot) * 100) : 0}%</span></span>
            </li>
          ))}
        </ul>
      )}
      {righe.length > max && <p className="piccolo muto">e altri {righe.length - max}</p>}
    </section>
  );
}
function Statistiche({ stat }) {
  const nomeMese = (k) => `${MESI[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`;
  const metodo = (k) => METODI.find(([x]) => x === k)?.[1] || k;
  return (
    <div className="ric-stat">
      <Barre titolo="Per mese" righe={stat.mesi} etichetta={nomeMese} max={24} />
      <Barre titolo="Come hanno pagato" righe={stat.metodi} etichetta={metodo} />
      <Barre titolo="Per tipo di abbonamento" righe={stat.tipi} max={15} />
      <Barre titolo="Per causale" righe={stat.causali} />
    </div>
  );
}
