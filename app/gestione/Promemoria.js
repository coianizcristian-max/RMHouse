'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { dataBreve, ora } from '@/lib/formato';

const GRUPPI = [['tutti', 'Tutto lo staff'], ['insegnante', 'Gli insegnanti'], ['segreteria', 'La segreteria'], ['admin', "L'amministrazione"]];

// Le cose da fare oggi (e quelle rimaste indietro).
// Di base sono per segreteria e amministrazione; si possono assegnare a una persona o a un gruppo:
// chi le riceve le vede nella sua home e riceve la notifica. Nei compiti di gruppo ognuno spunta il suo.
export default function Promemoria({ palestraId, voci, oggi, gestione = true, staff = [] }) {
  const router = useRouter();
  const [testo, setTesto] = useState('');
  const [data, setData] = useState(oggi);
  const [per, setPer] = useState('');
  const [elenco, setElenco] = useState(voci);
  const [errore, setErrore] = useState('');

  async function ricarica() {
    const { data: x } = await supabaseBrowser().rpc('promemoria_miei', { p_palestra: palestraId });
    if (x) setElenco(x);
  }

  async function aggiungi(e) {
    e.preventDefault();
    if (!testo.trim()) return;
    setErrore('');
    const riga = { palestra_id: palestraId, testo: testo.trim(), data,
      per_staff: per.startsWith('s:') ? per.slice(2) : null, per_ruolo: per.startsWith('r:') ? per.slice(2) : null };
    const { error } = await supabaseBrowser().from('promemoria').insert(riga);
    if (error) { setErrore('Non salvato. Riprova.'); return; }
    setTesto(''); setData(oggi); setPer('');
    await ricarica(); router.refresh();
  }

  async function spunta(v, tutti = false) {
    const fatto = tutti ? true : !v.fatto;
    setElenco(elenco.map((x) => (x.id === v.id ? { ...x, fatto } : x)));
    const { error } = await supabaseBrowser().rpc('spunta_promemoria', { p_id: v.id, p_fatto: fatto, p_tutti: tutti });
    if (error) setErrore('Non salvato. Riprova.');
    await ricarica();
  }

  async function togli(v) {
    if (!confirm(`Togliere "${v.testo.slice(0, 80)}"?\nNon si può recuperare.`)) return;
    setElenco(elenco.filter((x) => x.id !== v.id));
    await supabaseBrowser().from('promemoria').delete().eq('id', v.id);
    router.refresh();
  }

  const daFare = elenco.filter((v) => !v.fatto).length;
  if (!gestione && elenco.length === 0) return null;
  const quandoFatto = (t) => (t ? `${dataBreve(t) === dataBreve(new Date().toISOString()) ? '' : `il ${dataBreve(t)} `}alle ${ora(t)}` : '');

  return (
    <section className="pannello promemoria">
      <div className="pannello-testa">
        <h2>{gestione ? 'Da fare oggi' : 'Da fare per te'} {daFare > 0 && <span className="conta-rossa">{daFare}</span>}</h2>
      </div>
      {gestione && (
        <form className="pm-nuovo" onSubmit={aggiungi}>
          <input value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Es. mandare il promemoria del saggio" aria-label="Nuovo promemoria" />
          <input type="date" value={data} min={oggi} onChange={(e) => setData(e.target.value)} aria-label="Per quando" />
          <select value={per} onChange={(e) => setPer(e.target.value)} aria-label="Per chi" className={per ? 'scelto' : ''}>
            <option value="">Segreteria e amministrazione</option>
            <optgroup label="A un gruppo">
              {GRUPPI.map(([k, t]) => <option key={k} value={`r:${k}`}>{t}</option>)}
            </optgroup>
            <optgroup label="A una persona">
              {staff.map((s) => <option key={s.id} value={`s:${s.id}`}>{s.nome}</option>)}
            </optgroup>
          </select>
          <button className="btn btn-piccolo btn-primario">Aggiungi</button>
        </form>
      )}
      {per && <p className="piccolo muto" style={{ margin: '-4px 0 8px' }}>Lo vedrà nella sua home e riceverà una notifica.</p>}
      {errore && <div className="errore" role="alert">{errore}</div>}
      {elenco.length === 0 && <div className="vuoto">Niente in lista. Scrivi qui sopra le cose da ricordare oggi o nei prossimi giorni.</div>}
      <ul className="pm-elenco">
        {elenco.map((v) => {
          // nel gruppo: spunto il mio. Fuori dal gruppo (segreteria che guarda): spuntare = chiudere per tutti
          const fuoriGruppo = v.gruppo && !v.mio;
          return (
            <li key={v.id} className={v.fatto ? 'fatto' : ''}>
              <label className="spunta" style={{ margin: 0 }}>
                <input type="checkbox" checked={v.fatto} onChange={() => (fuoriGruppo && !v.fatto ? spunta(v, true) : spunta(v))}
                       disabled={!gestione && !v.mio} aria-label={fuoriGruppo ? 'Chiudi per tutti' : 'Fatto'} />
                <span>
                  <span className="pm-testo">{v.testo}</span>
                  <span className="pm-meta">
                    {v.per_nome && <span className={`pm-per${v.per_staff ? ' persona' : ''}`}>per {v.per_nome}</span>}
                    <span>{v.data < oggi ? `rimasto dal ${dataBreve(v.data)}` : 'oggi'}{v.creato_da ? ` · da ${v.creato_da}` : ''}</span>
                    {v.gruppo && !v.fatto && (
                      <span title={v.gruppo_chi || ''}>{v.gruppo_fatti} su {v.gruppo_totale} {v.gruppo_fatti === 1 ? "l'ha fatto" : "l'hanno fatto"}{v.gruppo_chi ? `: ${v.gruppo_chi}` : ''}</span>
                    )}
                    {v.fatto && v.fatto_da && <span className="pm-fatto">fatto da {v.fatto_da} {quandoFatto(v.fatto_at)}</span>}
                    {v.fatto && !v.fatto_da && v.gruppo && <span className="pm-fatto">fatto da tutti</span>}
                  </span>
                </span>
              </label>
              {gestione && (
                <span className="pm-azioni">
                  {v.gruppo && v.mio && !v.fatto && <button className="link-btn piccolo" onClick={() => spunta(v, true)}>chiudi per tutti</button>}
                  <button className="link-btn piccolo" onClick={() => togli(v)} aria-label="Togli">togli</button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
