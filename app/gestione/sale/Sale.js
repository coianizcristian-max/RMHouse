'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { euro } from '@/lib/formato';

export default function Sale({ sale, orari, postazioni = {}, salvato = null, palestraId }) {
  const router = useRouter();
  const [errore, setErrore] = useState('');
  // "Cambia l'ordine": si trascinano le sale (o si usano le frecce) e si salva; è l'ordine usato ovunque
  const [ordinando, setOrdinando] = useState(null);   // null = elenco normale, altrimenti l'elenco che si sta ordinando
  const [trascina, setTrascina] = useState(null);
  const [invio, setInvio] = useState(false);
  const sposta = (da, a) => setOrdinando((l) => {
    if (a < 0 || a >= l.length || da === a) return l;
    const n = [...l]; const [x] = n.splice(da, 1); n.splice(a, 0, x); return n;
  });
  async function salvaOrdine() {
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().rpc('ordina_sale', { p_palestra: palestraId, p_ids: ordinando.map((x) => x.id) });
    setInvio(false);
    if (error) { setErrore('Ordine non salvato. Riprova.'); return; }
    window.location.reload();   // ricarica intera: l'aggiornamento "morbido" a volte mostrava ancora l'ordine vecchio
  }

  const usoDi = (id) => orari.filter((o) => o.sala_id === id).length;

  // Crea in un colpo le postazioni numerate: Pertica 1, Pertica 2…
  async function creaPostazioni(s) {
    const quante = prompt(`Quanti posti numerati ha "${s.nome}"?`, postazioni[s.id] || s.capienza || 6);
    if (quante === null) return;
    const n = parseInt(quante, 10);
    if (!Number.isFinite(n) || n < 1) { setErrore('Scrivi un numero.'); return; }
    const prefisso = prompt('Come si chiamano? (Pertica, Tessuto, Tappetino…)', 'Pertica') || 'Postazione';
    const { error } = await supabaseBrowser().rpc('crea_postazioni', {
      p_sala: s.id, p_quante: n, p_prefisso: prefisso.trim(),
    });
    if (error) { setErrore('Non è stato possibile crearli.'); return; }
    router.refresh();
  }

  async function elimina(s) {
    if (usoDi(s.id) > 0) { setErrore(`"${s.nome}" è usata da ${usoDi(s.id)} orari: cambia prima quelli.`); return; }
    if (!confirm(`Eliminare "${s.nome}"?`)) return;
    const { error } = await supabaseBrowser().from('sale').delete().eq('id', s.id);
    if (error) { setErrore('Non si può eliminare: è collegata ad altri dati.'); return; }
    router.refresh();
  }

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Struttura</div>
        <h1>Sale</h1>
        <p>Dove si svolgono le lezioni: capienza, attrezzatura e costo orario per i margini.</p>
      </div>

      {errore && <div className="errore" role="alert">{errore}</div>}

      <div className="azioni-riga">
        <Link prefetch={false} className="btn btn-primario" href="/gestione/sale/nuova">Aggiungi sala</Link>
        {!ordinando && sale.length > 1 && <button type="button" className="btn" onClick={() => setOrdinando(sale)}>Cambia l&apos;ordine</button>}
      </div>

      {ordinando && (
        <div className="ordina-sale">
          <p className="piccolo muto" style={{ marginTop: 0 }}>
            Trascina le sale (o usa le frecce) nell&apos;ordine che vuoi: è quello usato qui, nella giornata per sale, negli affitti e sul sito.
          </p>
          <ol>
            {ordinando.map((x, i) => (
              <li key={x.id} draggable onDragStart={() => setTrascina(i)} onDragEnd={() => setTrascina(null)}
                  onDragOver={(e) => { e.preventDefault(); if (trascina !== null && trascina !== i) { sposta(trascina, i); setTrascina(i); } }}
                  className={trascina === i ? 'trascinata' : ''}>
                <span className="os-maniglia" aria-hidden="true">⋮⋮</span>
                <span className="os-num">{i + 1}</span>
                <strong>{x.nome}</strong>
                <span className="os-frecce">
                  <button type="button" className="link-btn" aria-label={`Sposta su ${x.nome}`} disabled={i === 0} onClick={() => sposta(i, i - 1)}>↑</button>
                  <button type="button" className="link-btn" aria-label={`Sposta giù ${x.nome}`} disabled={i === ordinando.length - 1} onClick={() => sposta(i, i + 1)}>↓</button>
                </span>
              </li>
            ))}
          </ol>
          <div className="azioni">
            <button type="button" className="btn btn-primario" disabled={invio} onClick={salvaOrdine}>{invio ? 'Salvo…' : 'Salva l\'ordine'}</button>
            <button type="button" className="btn" onClick={() => setOrdinando(null)}>Annulla</button>
          </div>
        </div>
      )}
      {salvato && sale.some((x) => x.id === salvato) && (
        <div className="avviso-ok" role="status" style={{ marginTop: 14 }}>Sala "{sale.find((x) => x.id === salvato).nome}" salvata ✓</div>
      )}

      {sale.length === 0 && <div className="vuoto" style={{ marginTop: 16 }}>Nessuna sala.</div>}

      {!ordinando && <div className="griglia-2" style={{ marginTop: 20 }}>
        {sale.map((s) => (
          <div key={s.id} className={`tessera${salvato === s.id ? ' appena-salvata' : ''}`} style={{ padding: 0, overflow: 'hidden' }}>
            {s.foto_url
              ? <img src={s.foto_url} alt="" className="copertina" style={{ borderRadius: 0 }} />
              : <div className="copertina segnaposto senza-foto" style={{ borderRadius: 0 }}>{s.nome.slice(0, 2).toUpperCase()}</div>}
            <div style={{ padding: 14 }}>
              <Link prefetch={false} href={`/gestione/sale/${s.id}`} className="titolo-sala">{s.nome}</Link>
              <div className="piccolo muto">
                {s.capienza ? `${s.capienza} posti` : 'capienza non impostata'}
                {s.costo_ora_cent ? ` · ${euro(s.costo_ora_cent)} all'ora` : ''}
                {` · ${usoDi(s.id)} orari`}
              </div>
              <div style={{ marginTop: 6 }}>
                {s.affittabile === false
                  ? <span className="tag tag-neutro">non affittabile</span>
                  : <span className="tag tag-ok">affittabile</span>}
              </div>
              {s.attrezzatura && <div className="piccolo" style={{ marginTop: 4 }}>{s.attrezzatura}</div>}
              {s.gestione_postazioni && (
                <div className="piccolo" style={{ marginTop: 6 }}>
                  {(postazioni[s.id] || 0)} posti numerati
                </div>
              )}
              <div className="azioni-riga">
                <Link prefetch={false} className="link-btn piccolo" href={`/gestione/sale/${s.id}`}>Modifica</Link>
                <button className="link-btn piccolo" onClick={() => creaPostazioni(s)}>Posti numerati</button>
                <button className="link-btn piccolo pericolo" onClick={() => elimina(s)}>Elimina</button>
              </div>
            </div>
          </div>
        ))}
      </div>}
    </>
  );
}
