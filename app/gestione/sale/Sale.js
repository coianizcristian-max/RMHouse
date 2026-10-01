'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { euro } from '@/lib/formato';

export default function Sale({ sale, orari, postazioni = {}, salvato = null }) {
  const router = useRouter();
  const [errore, setErrore] = useState('');

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

      <Link className="btn btn-primario" href="/gestione/sale/nuova">Aggiungi sala</Link>
      {salvato && sale.some((x) => x.id === salvato) && (
        <div className="avviso-ok" role="status" style={{ marginTop: 14 }}>Sala "{sale.find((x) => x.id === salvato).nome}" salvata ✓</div>
      )}

      {sale.length === 0 && <div className="vuoto" style={{ marginTop: 16 }}>Nessuna sala.</div>}

      <div className="griglia-2" style={{ marginTop: 20 }}>
        {sale.map((s) => (
          <div key={s.id} className={`tessera${salvato === s.id ? ' appena-salvata' : ''}`} style={{ padding: 0, overflow: 'hidden' }}>
            {s.foto_url
              ? <img src={s.foto_url} alt="" className="copertina" style={{ borderRadius: 0 }} />
              : <div className="copertina segnaposto senza-foto" style={{ borderRadius: 0 }}>{s.nome.slice(0, 2).toUpperCase()}</div>}
            <div style={{ padding: 14 }}>
              <Link href={`/gestione/sale/${s.id}`} className="titolo-sala">{s.nome}</Link>
              <div className="piccolo muto">
                {s.capienza ? `${s.capienza} posti` : 'capienza non impostata'}
                {s.costo_ora_cent ? ` · ${euro(s.costo_ora_cent)} all'ora` : ''}
                {` · ${usoDi(s.id)} orari`}
              </div>
              {s.attrezzatura && <div className="piccolo" style={{ marginTop: 4 }}>{s.attrezzatura}</div>}
              {s.gestione_postazioni && (
                <div className="piccolo" style={{ marginTop: 6 }}>
                  {(postazioni[s.id] || 0)} posti numerati
                </div>
              )}
              <div className="azioni-riga">
                <Link className="link-btn piccolo" href={`/gestione/sale/${s.id}`}>Modifica</Link>
                <button className="link-btn piccolo" onClick={() => creaPostazioni(s)}>Posti numerati</button>
                <button className="link-btn piccolo pericolo" onClick={() => elimina(s)}>Elimina</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
