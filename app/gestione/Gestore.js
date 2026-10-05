'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import SceltaColore from './SceltaColore';

// Editor generico: elenco di righe con aggiunta, modifica ed eliminazione.
// campi: [{ k, etichetta, tipo: 'testo'|'numero'|'euro'|'select'|'check'|'ora'|'data'|'testolungo',
//           opzioni?: [{v,l}], obbligatorio?, aiuto?, meta? }]
// fissi: valori sempre applicati (es. { palestra_id, corso_id })
// riassunto(riga) -> { titolo, dettaglio, tag?, colore? }
// sezione(riga) -> { chiave, titolo }: se c'è, le righe (già in ordine) sono divise da un titoletto
export default function Gestore({ tabella, campi, righe, fissi = {}, riassunto, etichettaNuovo = 'Aggiungi', vuoto = 'Ancora niente qui.', onElimina, sezione }) {
  const router = useRouter();
  const [apri, setApri] = useState(null);       // id della riga in modifica, oppure 'nuovo'
  const [bozza, setBozza] = useState({});
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const [salvato, setSalvato] = useState(null);  // riga appena salvata, per mostrarlo

  // valori di partenza delle righe nuove: le caselle spuntate, salvo "predefinito" diverso
  const vuota = Object.fromEntries(campi.map((c) => [c.k, c.predefinito ?? (c.tipo === 'check' ? true : '')]));

  function apriNuovo() {
    setBozza({ ...vuota, ...(campi.find((c) => c.k === 'ordine') ? { ordine: righe.length + 1 } : {}) });
    setErrore(''); setApri('nuovo');
  }
  function apriModifica(r) {
    setSalvato(null);
    const b = {};
    campi.forEach((c) => {
      const v = r[c.k];
      b[c.k] = c.tipo === 'euro' ? (v == null ? '' : (v / 100).toString()) : v ?? (c.tipo === 'check' ? false : '');
    });
    setBozza(b); setErrore(''); setApri(r.id);
  }

  function valore(c) {
    const v = bozza[c.k];
    if (c.tipo === 'check') return !!v;
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
    const dati = Object.fromEntries(campi.map((c) => [c.k, valore(c)]));
    const db = supabaseBrowser();
    // la modifica chiede indietro la riga: se non torna niente, non è stata salvata
    // (succede quando l'accesso è scaduto: il database non dà errore ma non cambia nulla)
    // una riga nuova non manda i campi lasciati vuoti: così valgono i valori predefiniti del database
    // (es. "Valido dal" di un orario = oggi), invece di un "vuoto" che il database rifiuta
    const nuovi = Object.fromEntries(Object.entries(dati).filter(([, v]) => v !== null));
    const scrivi = () => (apri === 'nuovo'
      ? db.from(tabella).insert({ ...fissi, ...nuovi })
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
    setInvio(false);
    if (error) { setErrore(messaggio(error, campi)); return; }
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

  return (
    <div>
      {errore && !apri && <div className="errore" role="alert">{errore}</div>}
      {salvato === 'nuovo' && <div className="avviso-ok" role="status">Aggiunto ✓</div>}

      {righe.length === 0 && apri !== 'nuovo' && <div className="vuoto">{vuoto}</div>}

      <ul className="elenco">
        {righe.map((r, i) => {
          const sez = sezione?.(r);
          const nuovaSezione = sez && (i === 0 || sezione(righe[i - 1]).chiave !== sez.chiave);
          return [
          nuovaSezione && (
            <li key={`sez-${sez.chiave}`} className="gestore-sezione">
              {sez.titolo} <span>{righe.filter((x) => sezione(x).chiave === sez.chiave).length}</span>
            </li>
          ),
          <li key={r.id}>
            {apri === r.id ? (
              <Modulo campi={campi} bozza={bozza} setBozza={setBozza} salva={salva} annulla={() => { setApri(null); setErrore(''); }} invio={invio} errore={errore} />
            ) : (
              <div className="persona" style={{ alignItems: 'start' }}>
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

      {apri === 'nuovo' ? (
        <div style={{ marginTop: 16 }}>
          <Modulo campi={campi} bozza={bozza} setBozza={setBozza} salva={salva} annulla={() => { setApri(null); setErrore(''); }} invio={invio} errore={errore} />
        </div>
      ) : (
        <button className="btn" style={{ marginTop: 16 }} onClick={apriNuovo}>{etichettaNuovo}</button>
      )}
    </div>
  );
}

function Modulo({ campi, bozza, setBozza, salva, annulla, invio, errore }) {
  const set = (k, v) => setBozza((b) => ({ ...b, [k]: v }));
  const rifErrore = useRef(null);
  // l'errore compare accanto a "Salva" e lo si porta in vista
  useEffect(() => { if (errore) rifErrore.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, [errore]);
  return (
    <form onSubmit={salva} style={{ padding: '14px 0' }}>
      {campi.map((c) => {
        const id = `c-${c.k}`;
        if (c.tipo === 'check') {
          return (
            <label className="spunta" key={c.k}>
              <input type="checkbox" checked={!!bozza[c.k]} onChange={(e) => set(c.k, e.target.checked)} />
              <span>{c.etichetta}{c.aiuto && <span className="piccolo muto" style={{ display: 'block' }}>{c.aiuto}</span>}</span>
            </label>
          );
        }
        return (
          <div className="campo" key={c.k}>
            <label htmlFor={id}>{c.etichetta}</label>
            {c.tipo === 'select' ? (
              <select id={id} value={bozza[c.k] ?? ''} onChange={(e) => set(c.k, e.target.value)}>
                <option value="">{c.vuotoTesto || '— nessuno —'}</option>
                {c.opzioni.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            ) : c.tipo === 'colore' ? (
              <SceltaColore valore={bozza[c.k] || ''} onChange={(v) => setBozza((b) => ({ ...b, [c.k]: v }))} />
            ) : c.tipo === 'testolungo' ? (
              <textarea id={id} value={bozza[c.k] ?? ''} onChange={(e) => set(c.k, e.target.value)} />
            ) : (
              <input id={id} value={bozza[c.k] ?? ''} onChange={(e) => set(c.k, e.target.value)}
                     type={c.tipo === 'ora' ? 'time' : c.tipo === 'data' ? 'date' : 'text'}
                     inputMode={c.tipo === 'euro' ? 'decimal' : c.tipo === 'numero' ? 'numeric' : undefined}
                     placeholder={c.tipo === 'euro' ? '0 = gratis' : undefined} />
            )}
            {c.aiuto && <span className="piccolo muto">{c.aiuto}</span>}
          </div>
        );
      })}
      {errore && <div className="errore" role="alert" ref={rifErrore}>{errore}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-primario" disabled={invio}>{invio ? 'Salvo…' : 'Salva'}</button>
        <button type="button" className="btn" onClick={annulla}>Annulla</button>
      </div>
    </form>
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
