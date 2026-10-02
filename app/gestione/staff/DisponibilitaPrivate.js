'use client';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';

const GIORNI = ['', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];

// Quando un insegnante fa lezioni private: le fasce settimanali che i clienti vedono nell'app
// (le ore in cui ha già lezione o una privata confermata spariscono da sole)
export default function DisponibilitaPrivate({ staffId, palestraId, nome }) {
  const [righe, setRighe] = useState(null);
  const [nuova, setNuova] = useState({ giorno: '2', dalle: '14:00', alle: '18:00', durata: '60' });
  const [errore, setErrore] = useState('');
  const db = supabaseBrowser();
  async function carica() {
    const { data } = await db.from('disponibilita_staff').select('id, giorno_settimana, ora_inizio, ora_fine, durata_min')
      .eq('staff_id', staffId).order('giorno_settimana').order('ora_inizio');
    setRighe(data || []);
  }
  useEffect(() => { carica(); }, [staffId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function aggiungi() {
    if (nuova.alle <= nuova.dalle) { setErrore('L\'ora di fine dev\'essere dopo quella di inizio.'); return; }
    setErrore('');
    const { error } = await db.from('disponibilita_staff').insert({ palestra_id: palestraId, staff_id: staffId,
      giorno_settimana: Number(nuova.giorno), ora_inizio: nuova.dalle, ora_fine: nuova.alle, durata_min: Number(nuova.durata) });
    if (error) { setErrore('Non salvata. Riprova.'); return; }
    carica();
  }
  async function togli(id) { await db.from('disponibilita_staff').delete().eq('id', id); carica(); }
  const ore = (t) => String(t).slice(0, 5);

  return (
    <section className="scheda disp-private">
      <h2>Lezioni private</h2>
      <p className="piccolo muto">Quando {nome || 'questa persona'} è disponibile per le lezioni private. Nell'app i clienti vedono gli orari liberi delle prossime 3 settimane (tolte le ore in cui ha già lezione) e ne scelgono uno o più; la richiesta arriva in "Richieste dall'app".</p>
      {righe === null ? <p className="muto">Carico…</p> : righe.length === 0
        ? <p className="muto piccolo">Nessuna disponibilità: nell'app i clienti potranno solo dire quando sono liberi.</p>
        : (
          <ul className="disp-elenco">
            {righe.map((r) => (
              <li key={r.id}><strong>{GIORNI[r.giorno_settimana]}</strong> dalle {ore(r.ora_inizio)} alle {ore(r.ora_fine)} <span className="muto">· lezioni da {r.durata_min} min</span>
                <button type="button" className="link-btn piccolo pericolo" onClick={() => togli(r.id)}>togli</button></li>
            ))}
          </ul>
        )}
      <div className="disp-nuova">
        <select value={nuova.giorno} onChange={(e) => setNuova({ ...nuova, giorno: e.target.value })} aria-label="Giorno">
          {GIORNI.slice(1).map((g, i) => <option key={g} value={i + 1}>{g}</option>)}
        </select>
        <input type="time" value={nuova.dalle} onChange={(e) => setNuova({ ...nuova, dalle: e.target.value })} aria-label="Dalle" step="900" />
        <input type="time" value={nuova.alle} onChange={(e) => setNuova({ ...nuova, alle: e.target.value })} aria-label="Alle" step="900" />
        <select value={nuova.durata} onChange={(e) => setNuova({ ...nuova, durata: e.target.value })} aria-label="Durata della lezione">
          {[30, 45, 60, 90].map((d) => <option key={d} value={d}>{d} min</option>)}
        </select>
        <button type="button" className="btn btn-piccolo" onClick={aggiungi}>+ Aggiungi</button>
      </div>
      {errore && <div className="errore" role="alert">{errore}</div>}
    </section>
  );
}
