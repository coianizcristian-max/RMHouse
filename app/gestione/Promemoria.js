'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { dataBreve } from '@/lib/formato';

// Le cose da fare oggi (e quelle rimaste indietro): si scrivono, si spuntano
export default function Promemoria({ palestraId, voci, chi, oggi }) {
  const router = useRouter();
  const [testo, setTesto] = useState('');
  const [data, setData] = useState(oggi);
  const [elenco, setElenco] = useState(voci);

  async function aggiungi(e) {
    e.preventDefault();
    if (!testo.trim()) return;
    const { data: nuovo, error } = await supabaseBrowser().from('promemoria')
      .insert({ palestra_id: palestraId, testo: testo.trim(), data, creato_da: chi }).select('*').single();
    if (error) return;
    if (nuovo.data <= oggi) setElenco([...elenco, nuovo]);
    setTesto(''); setData(oggi); router.refresh();
  }

  async function spunta(v) {
    const fatto = !v.fatto;
    setElenco(elenco.map((x) => (x.id === v.id ? { ...x, fatto } : x)));
    await supabaseBrowser().from('promemoria')
      .update({ fatto, fatto_at: fatto ? new Date().toISOString() : null, fatto_da: fatto ? chi : null }).eq('id', v.id);
  }

  async function togli(v) {
    setElenco(elenco.filter((x) => x.id !== v.id));
    await supabaseBrowser().from('promemoria').delete().eq('id', v.id);
  }

  const daFare = elenco.filter((v) => !v.fatto).length;
  return (
    <section className="pannello promemoria">
      <div className="pannello-testa">
        <h2>Da fare oggi {daFare > 0 && <span className="conta-rossa">{daFare}</span>}</h2>
      </div>
      <form className="pm-nuovo" onSubmit={aggiungi}>
        <input value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Es. mandare il promemoria del saggio" aria-label="Nuovo promemoria" />
        <input type="date" value={data} min={oggi} onChange={(e) => setData(e.target.value)} aria-label="Per quando" />
        <button className="btn btn-piccolo btn-primario">Aggiungi</button>
      </form>
      {elenco.length === 0 && <div className="vuoto">Niente in lista. Scrivi qui sopra le cose da ricordare oggi o nei prossimi giorni.</div>}
      <ul className="pm-elenco">
        {elenco.map((v) => (
          <li key={v.id} className={v.fatto ? 'fatto' : ''}>
            <label className="spunta" style={{ margin: 0 }}>
              <input type="checkbox" checked={v.fatto} onChange={() => spunta(v)} />
              <span>
                {v.testo}
                <span className="piccolo muto" style={{ display: 'block' }}>
                  {v.data < oggi ? `rimasto dal ${dataBreve(v.data)}` : 'oggi'}{v.creato_da ? ` · ${v.creato_da}` : ''}
                  {v.fatto && v.fatto_da ? ` · fatto da ${v.fatto_da}` : ''}
                </span>
              </span>
            </label>
            <button className="link-btn piccolo" onClick={() => togli(v)} aria-label="Togli">togli</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
