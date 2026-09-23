'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';

// Editor generico: elenco di righe con aggiunta, modifica ed eliminazione.
// campi: [{ k, etichetta, tipo: 'testo'|'numero'|'euro'|'select'|'check'|'ora'|'data'|'testolungo',
//           opzioni?: [{v,l}], obbligatorio?, aiuto?, meta? }]
// fissi: valori sempre applicati (es. { palestra_id, corso_id })
// riassunto(riga) -> { titolo, dettaglio, tag?, colore? }
export default function Gestore({ tabella, campi, righe, fissi = {}, riassunto, etichettaNuovo = 'Aggiungi', vuoto = 'Ancora niente qui.' }) {
  const router = useRouter();
  const [apri, setApri] = useState(null);       // id della riga in modifica, oppure 'nuovo'
  const [bozza, setBozza] = useState({});
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);

  const vuota = Object.fromEntries(campi.map((c) => [c.k, c.tipo === 'check' ? true : '']));

  function apriNuovo() {
    setBozza({ ...vuota, ...(campi.find((c) => c.k === 'ordine') ? { ordine: righe.length + 1 } : {}) });
    setErrore(''); setApri('nuovo');
  }
  function apriModifica(r) {
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
    if (c.tipo === 'numero') return Number.isFinite(+v) ? parseInt(v, 10) : null;
    if (c.tipo === 'euro') return Math.round(parseFloat(String(v).replace(',', '.')) * 100);
    return v;
  }

  async function salva(e) {
    e.preventDefault();
    const mancante = campi.find((c) => c.obbligatorio && (bozza[c.k] === '' || bozza[c.k] == null));
    if (mancante) { setErrore(`Compila "${mancante.etichetta}".`); return; }
    setInvio(true); setErrore('');
    const dati = Object.fromEntries(campi.map((c) => [c.k, valore(c)]));
    const db = supabaseBrowser();
    const { error } = apri === 'nuovo'
      ? await db.from(tabella).insert({ ...fissi, ...dati })
      : await db.from(tabella).update(dati).eq('id', apri);
    setInvio(false);
    if (error) { setErrore(messaggio(error)); return; }
    setApri(null); router.refresh();
  }

  async function elimina(r) {
    const { titolo } = riassunto(r);
    if (!confirm(`Eliminare "${titolo}"? L'operazione non si può annullare.`)) return;
    const { error } = await supabaseBrowser().from(tabella).delete().eq('id', r.id);
    if (error) { setErrore(messaggio(error)); return; }
    router.refresh();
  }

  return (
    <div>
      {errore && <div className="errore" role="alert">{errore}</div>}

      {righe.length === 0 && apri !== 'nuovo' && <div className="vuoto">{vuoto}</div>}

      <ul className="elenco">
        {righe.map((r) => (
          <li key={r.id}>
            {apri === r.id ? (
              <Modulo campi={campi} bozza={bozza} setBozza={setBozza} salva={salva} annulla={() => setApri(null)} invio={invio} />
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
                  {riassunto(r).tag && <> <span className="tag tag-neutro">{riassunto(r).tag}</span></>}
                  {riassunto(r).dettaglio && <div className="piccolo muto">{riassunto(r).dettaglio}</div>}
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="link-btn" onClick={() => apriModifica(r)}>Modifica</button>
                  <button className="link-btn pericolo" onClick={() => elimina(r)}>Elimina</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {apri === 'nuovo' ? (
        <div style={{ marginTop: 16 }}>
          <Modulo campi={campi} bozza={bozza} setBozza={setBozza} salva={salva} annulla={() => setApri(null)} invio={invio} />
        </div>
      ) : (
        <button className="btn" style={{ marginTop: 16 }} onClick={apriNuovo}>{etichettaNuovo}</button>
      )}
    </div>
  );
}

function Modulo({ campi, bozza, setBozza, salva, annulla, invio }) {
  const set = (k, v) => setBozza((b) => ({ ...b, [k]: v }));
  return (
    <form onSubmit={salva} style={{ padding: '14px 0' }}>
      {campi.map((c) => {
        const id = `c-${c.k}`;
        if (c.tipo === 'check') {
          return (
            <label className="spunta" key={c.k}>
              <input type="checkbox" checked={!!bozza[c.k]} onChange={(e) => set(c.k, e.target.checked)} />
              <span>{c.etichetta}</span>
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
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input id={c.k} type="color" value={/^#[0-9a-f]{6}$/i.test(bozza[c.k] || '') ? bozza[c.k] : '#f40000'}
                       onChange={(e) => setBozza({ ...bozza, [c.k]: e.target.value })}
                       style={{ width: 52, height: 36, padding: 0, border: '1px solid var(--linea)', borderRadius: 8 }} />
                <span className="piccolo muto">{bozza[c.k] || 'nessun colore'}</span>
              </div>
            ) : c.tipo === 'testolungo' ? (
              <textarea id={id} value={bozza[c.k] ?? ''} onChange={(e) => set(c.k, e.target.value)} />
            ) : (
              <input id={id} value={bozza[c.k] ?? ''} onChange={(e) => set(c.k, e.target.value)}
                     type={c.tipo === 'ora' ? 'time' : c.tipo === 'data' ? 'date' : c.tipo === 'numero' ? 'number' : 'text'}
                     inputMode={c.tipo === 'euro' ? 'decimal' : undefined}
                     placeholder={c.tipo === 'euro' ? '0 = gratis' : undefined} />
            )}
            {c.aiuto && <span className="piccolo muto">{c.aiuto}</span>}
          </div>
        );
      })}
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-primario" disabled={invio}>{invio ? 'Salvo…' : 'Salva'}</button>
        <button type="button" className="btn" onClick={annulla}>Annulla</button>
      </div>
    </form>
  );
}

function messaggio(error) {
  const m = error.message || '';
  if (m.includes('duplicate key')) return 'Esiste già una riga con questo nome.';
  if (m.includes('violates foreign key') || m.includes('still referenced')) return 'Non si può eliminare: è collegata ad altri dati.';
  if (m.includes('row-level security')) return 'Non hai i permessi per questa operazione.';
  return 'Salvataggio non riuscito. Controlla i dati e riprova.';
}
