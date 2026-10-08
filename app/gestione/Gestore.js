'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import SceltaColore from './SceltaColore';

// Editor generico: elenco di righe con aggiunta, modifica ed eliminazione.
// campi: [{ k, etichetta, tipo: 'testo'|'numero'|'euro'|'select'|'check'|'ora'|'data'|'testolungo',
//           opzioni?: [{v,l}], obbligatorio?, aiuto?, meta?, suggerimenti?: [{nome, colore}], nessuno?, segnaposto?,
//           tipo 'scelta': opzioni [{v,l}] + "+ Nuova…" (nuovaTesto), niente testo libero sbagliato
//           tipo 'etichette': più valori (array di testi) da opzioni [testo] + "+ Nuova…"
//           tipo 'molti': più valori da opzioni [{v,l,g}] (g = titoletto), con ricerca; nessunoTesto = cosa vuol dire nessuno scelto
//           collegati?: { tabella, mia, altra } → il campo non è una colonna: sono le righe di una tabella di collegamento
//                       (es. tipi_abbonamento_corsi: tipo_abbonamento_id + corso_id), scritte dopo la riga principale
//           gruppo? (titolo di sezione: modulo compatto a 4 colonne), larghezza? 1-4, se?(bozza) → mostrarlo o no, righe? }]
// fissi: valori sempre applicati (es. { palestra_id, corso_id })
// riassunto(riga) -> { titolo, dettaglio, tag?, colore? }
// sezione(riga) -> { chiave, titolo }: se c'è, le righe (già in ordine) sono divise da un titoletto
// ordinabile: elenco di nomi (discipline, categorie, sale…) → con più di 6 righe compaiono la ricerca e l'ordine per nome
// finestra: la modifica si apre in una finestra grande sopra l'elenco (si chiude e si resta dov'eri), non sotto la riga;
//           il pulsante per aggiungere compare anche in cima all'elenco. titoloNuovo = titolo della finestra per una riga nuova
export default function Gestore({ tabella, campi, righe, fissi = {}, riassunto, etichettaNuovo = 'Aggiungi', vuoto = 'Ancora niente qui.', onElimina, sezione, ordinabile = false,
  finestra = false, titoloNuovo }) {
  const router = useRouter();
  const [apri, setApri] = useState(null);       // id della riga in modifica, oppure 'nuovo'
  const [bozza, setBozza] = useState({});
  const partenza = useRef('');                  // la bozza com'era all'apertura: per chiedere prima di buttare le modifiche
  const originali = useRef({});                 // valori dei campi "collegati" all'apertura: si scrive solo la differenza
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const [salvato, setSalvato] = useState(null);  // riga appena salvata, per mostrarlo
  // elenchi lunghi: ricerca mentre si scrive e ordine per nome (o per il campo "Ordine", quello che vede il cliente)
  const [cerca, setCerca] = useState('');
  const conOrdine = campi.some((c) => c.k === 'ordine');
  const [ordina, setOrdina] = useState('nome');
  useEffect(() => { try { const v = localStorage.getItem(`rm-ordina-${tabella}`); if (v) setOrdina(v); } catch { /* niente */ } }, [tabella]);
  const cambiaOrdine = (v) => { setOrdina(v); try { localStorage.setItem(`rm-ordina-${tabella}`, v); } catch { /* niente */ } };
  const lungo = ordinabile && righe.length > 6;

  // valori di partenza delle righe nuove: le caselle spuntate, salvo "predefinito" diverso
  const multiplo = (c) => c.tipo === 'etichette' || c.tipo === 'molti';
  const vuota = Object.fromEntries(campi.map((c) => [c.k, c.predefinito ?? (c.tipo === 'check' ? true : multiplo(c) ? [] : '')]));

  function apriNuovo() {
    const b = { ...vuota, ...(campi.find((c) => c.k === 'ordine') ? { ordine: righe.length + 1 } : {}) };
    partenza.current = JSON.stringify(b); originali.current = {};
    setBozza(b); setErrore(''); setApri('nuovo');
  }
  function apriModifica(r) {
    setSalvato(null);
    const b = {};
    campi.forEach((c) => {
      const v = r[c.k];
      b[c.k] = c.tipo === 'euro' ? (v == null ? '' : (v / 100).toString()) : multiplo(c) ? (Array.isArray(v) ? v : []) : v ?? (c.tipo === 'check' ? false : '');
    });
    partenza.current = JSON.stringify(b);
    originali.current = Object.fromEntries(campi.filter((c) => c.collegati).map((c) => [c.k, b[c.k]]));
    setBozza(b); setErrore(''); setApri(r.id);
  }
  const chiudi = () => { setApri(null); setErrore(''); };
  // chiusura con ×, Esc o clic fuori: se qualcosa è cambiato si chiede prima
  const chiudiSeVuoi = () => {
    if (invio) return;
    if (JSON.stringify(bozza) !== partenza.current && !confirm('Hai cambiato qualcosa: chiudere senza salvare?')) return;
    chiudi();
  };

  function valore(c) {
    const v = bozza[c.k];
    if (c.tipo === 'check') return !!v;
    if (multiplo(c)) return Array.isArray(v) ? v : [];
    if (v === '' || v == null) return null;
    if (c.tipo === 'numero') return parseInt(String(v).trim(), 10);
    if (c.tipo === 'euro') return Math.round(numeroEuro(v) * 100);
    return v;
  }

  // controlla i campi prima di salvare: il messaggio dice quale e perché
  function controlla() {
    const mancante = campi.find((c) => c.obbligatorio && (bozza[c.k] === '' || bozza[c.k] == null));
    if (mancante) return `Compila "${mancante.etichetta}".`;
    for (const c of campi) {
      const v = bozza[c.k];
      if (v === '' || v == null) continue;
      if (c.tipo === 'numero' && !/^-?\d+$/.test(String(v).trim())) return `"${c.etichetta}": scrivi un numero intero, senza virgola.`;
      if (c.tipo === 'euro' && !Number.isFinite(numeroEuro(v))) return `"${c.etichetta}": scrivi un importo, per esempio 75 oppure 75,50.`;
    }
    return '';
  }

  async function salva(e) {
    e.preventDefault();
    const problema = controlla();
    if (problema) { setErrore(problema); return; }
    setInvio(true); setErrore('');
    const dati = Object.fromEntries(campi.filter((c) => !c.collegati).map((c) => [c.k, valore(c)]));
    const collegati = campi.filter((c) => c.collegati);
    const db = supabaseBrowser();
    // la modifica chiede indietro la riga: se non torna niente, non è stata salvata
    // (succede quando l'accesso è scaduto: il database non dà errore ma non cambia nulla)
    // una riga nuova non manda i campi lasciati vuoti: così valgono i valori predefiniti del database
    // (es. "Valido dal" di un orario = oggi), invece di un "vuoto" che il database rifiuta
    const nuovi = Object.fromEntries(Object.entries(dati).filter(([, v]) => v !== null));
    // con campi collegati serve l'id della riga nuova
    const scrivi = () => (apri === 'nuovo'
      ? (collegati.length ? db.from(tabella).insert({ ...fissi, ...nuovi }).select('id') : db.from(tabella).insert({ ...fissi, ...nuovi }))
      : db.from(tabella).update(dati).eq('id', apri).select('id'));
    let { data, error } = await scrivi();
    if (!error && apri !== 'nuovo' && !data?.length) {
      await db.auth.refreshSession().catch(() => null);   // si riprova una volta con l'accesso rinnovato
      ({ data, error } = await scrivi());
      if (!error && !data?.length) {
        setInvio(false);
        setErrore('Non salvato: l\'accesso è scaduto. Ricarica la pagina (o esci e rientra) e riprova.');
        return;
      }
    }
    if (error) { setInvio(false); setErrore(messaggio(error, campi)); return; }
    // poi le righe collegate: si tolgono quelle tolte e si aggiungono quelle nuove
    const id = apri === 'nuovo' ? data?.[0]?.id : apri;
    for (const c of collegati) {
      if (!id) break;
      const { tabella: tc, mia, altra } = c.collegati;
      const prima = new Set(originali.current[c.k] || []), dopo = new Set(valore(c));
      const tolti = [...prima].filter((x) => !dopo.has(x)), messi = [...dopo].filter((x) => !prima.has(x));
      let e1 = null, e2 = null;
      if (tolti.length) ({ error: e1 } = await db.from(tc).delete().eq(mia, id).in(altra, tolti));
      if (messi.length) ({ error: e2 } = await db.from(tc).upsert(messi.map((x) => ({ [mia]: id, [altra]: x })), { onConflict: `${mia},${altra}`, ignoreDuplicates: true }));
      if (e1 || e2) {
        // la riga è salvata, il collegamento no: si rilegge com'è davvero e si lascia la finestra aperta per riprovare
        const { data: ora } = await db.from(tc).select(altra).eq(mia, id);
        originali.current = { ...originali.current, [c.k]: (ora || []).map((x) => x[altra]) };
        setInvio(false); setApri(id); router.refresh();
        setErrore(`Salvato, ma "${c.etichetta}" non è stato aggiornato. Premi di nuovo Salva per riprovare.`);
        return;
      }
    }
    setInvio(false);
    setSalvato(apri === 'nuovo' ? 'nuovo' : apri);
    setTimeout(() => setSalvato(null), 4000);
    setApri(null); router.refresh();
  }

  async function elimina(r) {
    if (onElimina) { await onElimina(r, setErrore); router.refresh(); return; }
    const { titolo } = riassunto(r);
    if (!confirm(`Eliminare "${titolo}"? L'operazione non si può annullare.`)) return;
    const { error } = await supabaseBrowser().from(tabella).delete().eq('id', r.id);
    if (error) { setErrore(messaggio(error)); return; }
    router.refresh();
  }

  const norm = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const parole = norm(cerca).split(/\s+/).filter(Boolean);
  const testoDi = (r) => { const x = riassunto(r); return norm(`${x.titolo} ${x.dettaglio || ''} ${x.tag || ''}`); };
  let mostrate = parole.length ? righe.filter((r) => { const t = testoDi(r); return parole.every((p) => t.includes(p)); }) : righe;
  // con le sezioni l'ordine lo decide chi chiama; altrimenti per nome (A→Z) o per il campo "Ordine"
  if (!sezione && lungo) {
    mostrate = [...mostrate].sort(ordina === 'ordine' && conOrdine
      ? (a, b) => ((a.ordine ?? 9999) - (b.ordine ?? 9999)) || String(riassunto(a).titolo).localeCompare(String(riassunto(b).titolo), 'it')
      : (a, b) => String(riassunto(a).titolo).localeCompare(String(riassunto(b).titolo), 'it', { sensitivity: 'base' }));
  }

  const rigaAperta = apri && apri !== 'nuovo' ? righe.find((r) => r.id === apri) : null;

  return (
    <div>
      {errore && !apri && <div className="errore" role="alert">{errore}</div>}
      {salvato === 'nuovo' && <div className="avviso-ok" role="status">Aggiunto ✓</div>}

      {lungo && (
        <div className="gestore-barra">
          <input type="search" value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca…" aria-label="Cerca nell'elenco" />
          {!sezione && conOrdine && (
            <select value={ordina} onChange={(e) => cambiaOrdine(e.target.value)} aria-label="Ordina">
              <option value="nome">Per nome (A→Z)</option>
              <option value="ordine">Come li vede il cliente (campo Ordine)</option>
            </select>
          )}
          <span className="piccolo muto">{parole.length ? `${mostrate.length} su ${righe.length}` : `${righe.length}`}</span>
        </div>
      )}

      {finestra && righe.length > 6 && (
        <div className="gestore-nuovo-alto"><button type="button" className="btn btn-piccolo" onClick={apriNuovo}>+ {etichettaNuovo}</button></div>
      )}

      {righe.length === 0 && (apri !== 'nuovo' || finestra) && <div className="vuoto">{vuoto}</div>}
      {righe.length > 0 && mostrate.length === 0 && <div className="vuoto">Niente con «{cerca}».</div>}

      <ul className="elenco">
        {mostrate.map((r, i) => {
          const sez = sezione?.(r);
          const nuovaSezione = sez && (i === 0 || sezione(mostrate[i - 1]).chiave !== sez.chiave);
          return [
          nuovaSezione && (
            <li key={`sez-${sez.chiave}`} className="gestore-sezione">
              {sez.titolo} <span>{mostrate.filter((x) => sezione(x).chiave === sez.chiave).length}</span>
            </li>
          ),
          <li key={r.id}>
            {apri === r.id && !finestra ? (
              <Modulo campi={campi} bozza={bozza} setBozza={setBozza} salva={salva} annulla={() => { setApri(null); setErrore(''); }} invio={invio} errore={errore} />
            ) : (
              // un clic su qualunque punto della riga apre la modifica (i pulsanti fanno la loro azione)
              <div className={`persona gestore-riga${apri === r.id ? ' aperta' : ''}`} style={{ alignItems: 'start' }} role="button" tabIndex={0}
                   title="Clic per modificare"
                   onClick={(e) => { if (!e.target.closest('button, a, input, select, textarea')) apriModifica(r); }}
                   onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); apriModifica(r); } }}>
                <div>
                  {riassunto(r).colore && (
                    <span aria-hidden="true" style={{
                      display: 'inline-block', width: 12, height: 12, borderRadius: 3,
                      background: riassunto(r).colore, marginRight: 8,
                    }} />
                  )}
                  <span className="persona-nome">{riassunto(r).titolo}</span>
                  {salvato === r.id && <> <span className="tag tag-ok">salvato ✓</span></>}
                  {riassunto(r).tag && <> <span className="tag tag-neutro">{riassunto(r).tag}</span></>}
                  {riassunto(r).dettaglio && <div className="piccolo muto">{riassunto(r).dettaglio}</div>}
                  {ordina === 'ordine' && conOrdine && lungo && !sezione && <div className="piccolo muto">ordine {r.ordine ?? '—'}</div>}
                </div>
                <div className="gestore-azioni">
                  <button className="link-btn" onClick={() => apriModifica(r)}>Modifica</button>
                  <button className="link-btn pericolo" onClick={() => elimina(r)}>Elimina</button>
                </div>
              </div>
            )}
          </li>,
          ];
        })}
      </ul>

      {finestra && apri && (
        <Finestra titolo={rigaAperta ? riassunto(rigaAperta).titolo : apri === 'nuovo' ? (titoloNuovo || etichettaNuovo) : (bozza.nome || '')}
                  sotto={rigaAperta ? riassunto(rigaAperta).dettaglio : ''}
                  larga={campi.some((c) => c.gruppo)} chiudi={chiudiSeVuoi} nuovo={apri === 'nuovo'}>
          <Modulo campi={campi} bozza={bozza} setBozza={setBozza} salva={salva} annulla={chiudi} invio={invio} errore={errore} finestra />
        </Finestra>
      )}

      {apri === 'nuovo' && !finestra ? (
        <div style={{ marginTop: 16 }}>
          <Modulo campi={campi} bozza={bozza} setBozza={setBozza} salva={salva} annulla={() => { setApri(null); setErrore(''); }} invio={invio} errore={errore} />
        </div>
      ) : (
        <button className="btn" style={{ marginTop: 16 }} onClick={apriNuovo}>{etichettaNuovo}</button>
      )}
    </div>
  );
}

// La finestra grande sopra l'elenco: titolo in alto, i campi in mezzo (scorrono se non ci stanno), Salva sempre in vista.
// Si chiude con ×, con Esc o cliccando fuori; la pagina sotto resta ferma dov'era.
function Finestra({ titolo, sotto, larga, chiudi, nuovo, children }) {
  const rif = useRef(null);
  const chiudiRif = useRef(chiudi);
  chiudiRif.current = chiudi;
  useEffect(() => {
    const prima = document.body.style.overflow;
    document.body.style.overflow = 'hidden';            // sotto non scorre
    // riga nuova: si comincia a scrivere dal primo campo; modifica: si guarda prima
    const primo = nuovo ? rif.current?.querySelector('input:not([type=checkbox]), select, textarea') : null;
    (primo || rif.current)?.focus({ preventScroll: true });
    const tasto = (e) => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); chiudiRif.current(); } };
    window.addEventListener('keydown', tasto);
    return () => { document.body.style.overflow = prima; window.removeEventListener('keydown', tasto); };
  }, [nuovo]);
  // clic fuori: solo se il clic comincia e finisce sul fondo (selezionare un testo trascinando fuori non chiude)
  const giuSulFondo = useRef(false);
  return (
    <div className="gf-velo" onMouseDown={(e) => { giuSulFondo.current = e.target === e.currentTarget; }}
         onClick={(e) => { if (giuSulFondo.current && e.target === e.currentTarget) chiudi(); giuSulFondo.current = false; }}>
      <div className={`gf-finestra${larga ? ' larga' : ''}`} role="dialog" aria-modal="true" aria-labelledby="gf-titolo" tabIndex={-1} ref={rif}>
        {/* header e section, non div: la regola generale dei fogli ([role=dialog] > div) qui non deve valere */}
        <header className="gf-testa">
          <div style={{ minWidth: 0 }}>
            <h2 id="gf-titolo">{titolo}</h2>
            {sotto && <div className="piccolo muto gf-sotto">{sotto}</div>}
          </div>
          <button type="button" className="gf-chiudi" onClick={chiudi} aria-label="Chiudi" title="Chiudi (Esc)">×</button>
        </header>
        <section className="gf-corpo">{children}</section>
      </div>
    </div>
  );
}

function Modulo({ campi, bozza, setBozza, salva, annulla, invio, errore, finestra = false }) {
  const aGruppi = campi.some((c) => c.gruppo);
  const set = (k, v) => setBozza((b) => ({ ...b, [k]: v }));
  const rifErrore = useRef(null);
  // l'errore compare accanto a "Salva" e lo si porta in vista
  useEffect(() => { if (errore) rifErrore.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, [errore]);
  const visibili = campi.filter((c) => !c.se || c.se(bozza));

  // un campo; nel modulo a sezioni la nota sta accanto all'etichetta (niente righe in più)
  const campo = (c) => {
    const id = `c-${c.k}`;
    const largo = aGruppi ? ` gm-l${c.larghezza || (c.tipo === 'testolungo' ? 6 : 1)}` : '';
    if (c.tipo === 'check') {
      return (
        <label className={`spunta${aGruppi ? ` gm-check${largo}` : ''}`} key={c.k} title={aGruppi ? c.aiuto : undefined}>
          <input type="checkbox" checked={!!bozza[c.k]} onChange={(e) => set(c.k, e.target.checked)} />
          <span>{c.etichetta}{c.aiuto && !aGruppi && <span className="piccolo muto" style={{ display: 'block' }}>{c.aiuto}</span>}
            {c.aiuto && aGruppi && <span className="gm-aiuto"> {c.aiuto}</span>}</span>
        </label>
      );
    }
    return (
      <div className={`campo${largo}`} key={c.k}>
        <label htmlFor={id}>{c.etichetta}{aGruppi && c.aiuto && <span className="gm-aiuto" title={c.aiuto}> · {c.aiuto}</span>}</label>
        {c.tipo === 'select' ? (
          <select id={id} value={bozza[c.k] ?? ''} onChange={(e) => set(c.k, e.target.value)}>
            <option value="">{c.vuotoTesto || '— nessuno —'}</option>
            {c.opzioni.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
        ) : c.tipo === 'molti' ? (
          <SceltaMolti id={id} valore={Array.isArray(bozza[c.k]) ? bozza[c.k] : []} opzioni={c.opzioni || []} nessunoTesto={c.nessunoTesto}
                       onChange={(v) => set(c.k, v)} />
        ) : c.tipo === 'etichette' ? (
          <Etichette id={id} valore={Array.isArray(bozza[c.k]) ? bozza[c.k] : []} opzioni={c.opzioni || []} nuovaTesto={c.nuovaTesto}
                     onChange={(v) => set(c.k, v)} />
        ) : c.tipo === 'scelta' ? (
          <SceltaONuova id={id} valore={bozza[c.k] ?? ''} opzioni={c.opzioni} vuotoTesto={c.vuotoTesto} nuovaTesto={c.nuovaTesto}
                        onChange={(v) => set(c.k, v)} />
        ) : c.tipo === 'colore' ? (
          <SceltaColore valore={bozza[c.k] || ''} onChange={(v) => setBozza((b) => ({ ...b, [c.k]: v }))} />
        ) : c.tipo === 'testolungo' ? (
          <textarea id={id} value={bozza[c.k] ?? ''} onChange={(e) => set(c.k, e.target.value)} rows={c.righe || undefined} />
        ) : (
          <>
          {c.suggerimenti?.length > 0 && (
            // valori già usati (es. i gruppi del corso): un tocco e il campo è compilato
            <div className="oc-gruppi-scelta" role="group" aria-label={`${c.etichetta}: quelli già usati`}>
              {c.suggerimenti.map((x) => (
                <button key={x.nome} type="button" className="oc-gruppo-chip" style={{ '--g': x.colore || 'var(--testo-2)' }}
                        aria-pressed={String(bozza[c.k] ?? '').trim().toLowerCase() === x.nome.toLowerCase()}
                        onClick={() => set(c.k, x.nome)}>{x.nome}</button>
              ))}
              {c.nessuno && (
                <button type="button" className="oc-gruppo-chip nessuno" aria-pressed={!String(bozza[c.k] ?? '').trim()}
                        onClick={() => set(c.k, '')}>{c.nessuno}</button>
              )}
            </div>
          )}
          <input id={id} value={bozza[c.k] ?? ''} onChange={(e) => set(c.k, e.target.value)}
                 autoComplete={c.suggerimenti ? 'off' : undefined}
                 placeholder={c.suggerimenti?.length ? (c.segnaposto || 'oppure scrivi') : c.tipo === 'euro' ? '0 = gratis' : c.segnaposto}
                 type={c.tipo === 'ora' ? 'time' : c.tipo === 'data' ? 'date' : 'text'}
                 inputMode={c.tipo === 'euro' ? 'decimal' : c.tipo === 'numero' ? 'numeric' : undefined} />
          </>
        )}
        {c.aiuto && !aGruppi && <span className="piccolo muto">{c.aiuto}</span>}
      </div>
    );
  };

  // modulo a sezioni: a sinistra il nome della sezione, a destra i suoi campi su 6 colonne
  const sezioni = [];
  if (aGruppi) for (const c of visibili) {
    const ultima = sezioni[sezioni.length - 1];
    if (ultima && ultima.nome === (c.gruppo || '')) ultima.campi.push(c); else sezioni.push({ nome: c.gruppo || '', campi: [c] });
  }

  return (
    <form onSubmit={salva} style={aGruppi || finestra ? undefined : { padding: '14px 0' }}
          className={[aGruppi && 'gestore-modulo a-gruppi', finestra && 'gf-modulo'].filter(Boolean).join(' ') || undefined}>
      {aGruppi ? sezioni.map((z) => (
        <div key={z.nome} className="gm-sez">
          <div className="gm-sezione">{z.nome}</div>
          <div className={`gm-campi${z.campi.every((c) => c.tipo === 'check') ? ' solo-spunte' : ''}`}>{z.campi.map(campo)}</div>
        </div>
      )) : visibili.map(campo)}
      {errore && <div className="errore" role="alert" ref={rifErrore}>{errore}</div>}
      <div style={{ display: 'flex', gap: 10 }} className={[aGruppi && 'gm-azioni', finestra && 'gf-azioni'].filter(Boolean).join(' ') || undefined}>
        <button className="btn btn-primario" disabled={invio}>{invio ? 'Salvo…' : 'Salva'}</button>
        <button type="button" className="btn" onClick={annulla}>Annulla</button>
        {finestra && <span className="piccolo muto gf-tasti">Esc per chiudere</span>}
      </div>
    </form>
  );
}

// Più valori da un elenco (es. le famiglie di un abbonamento): si toccano quelli che valgono; uno nuovo si scrive e si aggiunge
function Etichette({ id, valore, opzioni = [], onChange, nuovaTesto = '+ Nuova…' }) {
  const [nuova, setNuova] = useState('');
  const [apri, setApri] = useState(false);
  const scelte = valore.map((v) => v.toLowerCase());
  const tutte = [...opzioni];
  for (const v of valore) if (!tutte.some((o) => o.toLowerCase() === v.toLowerCase())) tutte.push(v);
  const toggle = (o) => onChange(scelte.includes(o.toLowerCase()) ? valore.filter((v) => v.toLowerCase() !== o.toLowerCase()) : [...valore, o]);
  const aggiungi = () => {
    const n = nuova.trim().replace(/\s+/g, ' ');
    if (!n) return;
    if (!scelte.includes(n.toLowerCase())) onChange([...valore, tutte.find((o) => o.toLowerCase() === n.toLowerCase()) || n]);
    setNuova(''); setApri(false);
  };
  return (
    <div className="etichette-scelta" id={id}>
      {tutte.map((o) => (
        <button key={o} type="button" className="oc-gruppo-chip" style={{ '--g': 'var(--nero)' }} aria-pressed={scelte.includes(o.toLowerCase())} onClick={() => toggle(o)}>{o}</button>
      ))}
      {apri ? (
        <span className="etichette-nuova">
          <input value={nuova} onChange={(e) => setNuova(e.target.value)} placeholder="nome della nuova" autoFocus autoComplete="off"
                 onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); aggiungi(); } if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setApri(false); setNuova(''); } }} />
          <button type="button" className="btn btn-piccolo btn-primario" onClick={aggiungi}>Aggiungi</button>
          <button type="button" className="link-btn piccolo" onClick={() => { setApri(false); setNuova(''); }}>annulla</button>
        </span>
      ) : (
        <button type="button" className="oc-gruppo-chip nessuno" onClick={() => setApri(true)}>{nuovaTesto}</button>
      )}
    </div>
  );
}

// Più valori da un elenco lungo (es. i corsi compresi in un abbonamento): a gruppi (g), in ordine fisso, con la ricerca
function SceltaMolti({ id, valore, opzioni = [], onChange, nessunoTesto = 'Nessuno scelto' }) {
  const [cerca, setCerca] = useState('');
  const [soloScelti, setSoloScelti] = useState(false);
  const scelti = new Set(valore);
  const norm = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const parole = norm(cerca).split(/\s+/).filter(Boolean);
  const mostrate = opzioni.filter((o) => (!soloScelti || scelti.has(o.v)) && parole.every((p) => norm(`${o.l} ${o.g || ''}`).includes(p)));
  const blocchi = [...new Set(mostrate.map((o) => o.g || ''))].sort((a, b) => a.localeCompare(b, 'it'))
    .map((g) => ({ g, voci: mostrate.filter((o) => (o.g || '') === g).sort((a, b) => a.l.localeCompare(b.l, 'it', { numeric: true })) }));
  const toggle = (v) => onChange(scelti.has(v) ? valore.filter((x) => x !== v) : [...valore, v]);
  // con la ricerca: "tutti questi" sceglie (o toglie) quelli che si vedono
  const tuttiVisti = mostrate.length > 0 && mostrate.every((o) => scelti.has(o.v));
  const tuttiQuesti = () => onChange(tuttiVisti ? valore.filter((v) => !mostrate.some((o) => o.v === v)) : [...new Set([...valore, ...mostrate.map((o) => o.v)])]);
  return (
    <div className="molti" id={id}>
      <div className="molti-barra">
        <strong className={valore.length ? '' : 'molti-nessuno'}>{valore.length ? `${valore.length} ${valore.length === 1 ? 'scelto' : 'scelti'}` : nessunoTesto}</strong>
        {opzioni.length > 10 && (
          <input type="search" value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca…" aria-label="Cerca nell'elenco"
                 onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); if (e.key === 'Escape' && cerca) { e.preventDefault(); e.stopPropagation(); setCerca(''); } }} />
        )}
        {valore.length > 0 && (
          <label className="spunta piccolo"><input type="checkbox" checked={soloScelti} onChange={(e) => setSoloScelti(e.target.checked)} /> solo quelli scelti</label>
        )}
        {parole.length > 0 && mostrate.length > 0 && (
          <button type="button" className="link-btn piccolo" onClick={tuttiQuesti}>{tuttiVisti ? 'togli questi' : `scegli questi ${mostrate.length}`}</button>
        )}
        {valore.length > 0 && !parole.length && (
          <button type="button" className="link-btn piccolo pericolo" onClick={() => { if (confirm('Togliere tutti quelli scelti?')) onChange([]); }}>togli tutti</button>
        )}
      </div>
      {mostrate.length === 0 && <div className="piccolo muto">Niente{cerca ? ` con «${cerca}»` : ''}.</div>}
      {blocchi.map(({ g, voci }) => (
        <div key={g} className="molti-blocco">
          {g && <div className="molti-titolo">{g}</div>}
          <div className="molti-voci">
            {voci.map((o) => (
              <button key={o.v} type="button" className="oc-gruppo-chip" style={{ '--g': 'var(--nero)' }} aria-pressed={scelti.has(o.v)} onClick={() => toggle(o.v)}>{o.l}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Si sceglie un valore già usato; uno nuovo solo con "+ Nuova…" (es. la famiglia di un abbonamento): niente doppioni scritti male
function SceltaONuova({ id, valore, opzioni = [], onChange, vuotoTesto = '— nessuna —', nuovaTesto = '+ Nuova…' }) {
  const [nuova, setNuova] = useState(!!valore && !opzioni.some((o) => o.v === valore));
  if (nuova) {
    return (
      <span className="scelta-nuova">
        <input id={id} value={valore} onChange={(e) => onChange(e.target.value)} placeholder="Scrivi il nome nuovo" autoComplete="off" autoFocus={!valore} />
        <button type="button" className="link-btn piccolo" onClick={() => { onChange(''); setNuova(false); }} title="Torna all'elenco">elenco</button>
      </span>
    );
  }
  return (
    <select id={id} value={valore} onChange={(e) => { if (e.target.value === '__nuova__') { setNuova(true); onChange(''); } else onChange(e.target.value); }}>
      <option value="">{vuotoTesto}</option>
      {opzioni.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      <option value="__nuova__">{nuovaTesto}</option>
    </select>
  );
}

// "75", "75,50", "1.200,50", "€ 75" → numero; altrimenti NaN
function numeroEuro(v) {
  let t = String(v).replace(/[€\s]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(t) ? parseFloat(t) : NaN;
}

function messaggio(error, campi = []) {
  const m = error.message || '';
  // dice quale campo non va, con il nome che si vede nel modulo
  const colonna = m.match(/column "([a-z_]+)"/)?.[1] || m.match(/constraint "[a-z_]+?_([a-z_]+)_check"/)?.[1];
  const campo = campi.find((c) => c.k === colonna || (colonna && c.k.endsWith(colonna)) || (colonna && colonna.endsWith(c.k)));
  if (m.includes('not-null') && campo) return `Compila "${campo.etichetta}".`;
  if (m.includes('check constraint') && campo) return `Il valore di "${campo.etichetta}" non va bene.`;
  if (m.includes('duplicate key')) return 'Esiste già una riga con questo nome.';
  if (m.includes('violates foreign key') || m.includes('still referenced')) return 'Non si può eliminare: è collegata ad altri dati.';
  if (m.includes('row-level security')) return 'Non hai i permessi per questa operazione.';
  if (m.includes('JWT') || error.code === 'PGRST301' || error.status === 401) return 'Non salvato: l\'accesso è scaduto. Ricarica la pagina (o esci e rientra) e riprova.';
  return 'Salvataggio non riuscito. Controlla i dati e riprova.';
}
