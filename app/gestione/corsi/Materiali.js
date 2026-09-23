'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';

const TIPI = [['video', 'Video'], ['link', 'Link'], ['file', 'File'], ['nota', 'Nota']];

// Materiali che compaiono ai prenotati poco prima della lezione
export default function Materiali({ palestraId, corsoId, righe }) {
  const router = useRouter();
  const [apri, setApri] = useState(false);
  const [f, setF] = useState({ titolo: '', testo: '', url: '', tipo: 'video', minuti_prima: '120' });
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function salva(e) {
    e.preventDefault();
    if (!f.titolo.trim()) { setErrore('Serve un titolo.'); return; }
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().from('materiali').insert({
      palestra_id: palestraId, corso_id: corsoId,
      titolo: f.titolo.trim(), testo: f.testo || null, url: f.url || null, tipo: f.tipo,
      minuti_prima: parseInt(f.minuti_prima, 10) || 120,
    });
    setInvio(false);
    if (error) { setErrore('Salvataggio non riuscito.'); return; }
    setApri(false); setF({ titolo: '', testo: '', url: '', tipo: 'video', minuti_prima: '120' });
    router.refresh();
  }

  async function elimina(r) {
    if (!confirm(`Togliere "${r.titolo}"?`)) return;
    await supabaseBrowser().from('materiali').delete().eq('id', r.id);
    router.refresh();
  }

  return (
    <>
      <h2 className="sezione">Materiali per gli allievi</h2>
      <p className="piccolo muto" style={{ marginTop: -4 }}>
        Compaiono nell'area del cliente poco prima della lezione: una coreografia da ripassare, il video di
        riscaldamento, un avviso sull'abbigliamento.
      </p>

      {errore && <div className="errore" role="alert">{errore}</div>}

      {righe.length === 0 && !apri && <div className="vuoto">Nessun materiale.</div>}

      <ul className="elenco">
        {righe.map((r) => (
          <li key={r.id} className="persona">
            <span>
              {r.titolo}
              <span className="piccolo muto" style={{ display: 'block' }}>
                {(TIPI.find(([v]) => v === r.tipo) || [null, r.tipo])[1]} · visibile da {r.minuti_prima} minuti prima
                {r.url ? ' · con link' : ''}
              </span>
            </span>
            <button className="link-btn piccolo pericolo" onClick={() => elimina(r)}>Togli</button>
          </li>
        ))}
      </ul>

      {apri ? (
        <form onSubmit={salva} style={{ marginTop: 12 }}>
          <div className="campo"><label htmlFor="mt">Titolo</label><input id="mt" value={f.titolo} onChange={set('titolo')} /></div>
          <div className="campo">
            <label htmlFor="mtp">Tipo</label>
            <select id="mtp" value={f.tipo} onChange={set('tipo')}>
              {TIPI.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="mu">Indirizzo</label>
            <input id="mu" value={f.url} onChange={set('url')} placeholder="https://… (YouTube, Drive, PDF)" />
          </div>
          <div className="campo">
            <label htmlFor="mm">Da quanti minuti prima</label>
            <input id="mm" type="number" min="10" step="10" value={f.minuti_prima} onChange={set('minuti_prima')} />
          </div>
          <div className="campo"><label htmlFor="mn">Nota</label><textarea id="mn" value={f.testo} onChange={set('testo')} /></div>
          <div className="azioni">
            <button className="btn btn-primario" disabled={invio}>Aggiungi</button>
            <button type="button" className="btn" onClick={() => setApri(false)}>Annulla</button>
          </div>
        </form>
      ) : (
        <button className="btn" style={{ marginTop: 12 }} onClick={() => setApri(true)}>Aggiungi un materiale</button>
      )}
    </>
  );
}
