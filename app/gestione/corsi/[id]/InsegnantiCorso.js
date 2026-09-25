'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';

// Chi può tenere il corso. Un tocco aggiunge o toglie; negli orari
// queste persone compaiono per prime nella scelta dell'insegnante.
export default function InsegnantiCorso({ palestraId, corsoId, staff, scelti }) {
  const router = useRouter();
  const [attivi, setAttivi] = useState(new Set(scelti));
  const [errore, setErrore] = useState('');
  const [tutti, setTutti] = useState(scelti.length === 0);

  async function cambia(id) {
    setErrore('');
    const db = supabaseBrowser();
    const togli = attivi.has(id);
    const prossimo = new Set(attivi);
    togli ? prossimo.delete(id) : prossimo.add(id);
    setAttivi(prossimo);
    const { error } = togli
      ? await db.from('corsi_insegnanti').delete().eq('corso_id', corsoId).eq('staff_id', id)
      : await db.from('corsi_insegnanti').insert({ corso_id: corsoId, staff_id: id, palestra_id: palestraId });
    if (error) { setAttivi(attivi); setErrore('Modifica non riuscita.'); return; }
    router.refresh();
  }

  const ordinati = [...staff].sort((a, b) =>
    (attivi.has(b.id) - attivi.has(a.id)) || a.nome.localeCompare(b.nome))
    .filter((s) => tutti || attivi.has(s.id));
  const altri = staff.length - attivi.size;

  return (
    <>
      <h2>Insegnanti del corso</h2>
      <p className="piccolo muto" style={{ marginTop: -4 }}>Chi può tenere questo corso.</p>
      {errore && <div className="errore" role="alert">{errore}</div>}
      <div className="pastiglie">
        {ordinati.map((s) => (
          <button key={s.id} type="button" aria-pressed={attivi.has(s.id)} onClick={() => cambia(s.id)}>
            {s.foto_url
              ? <img src={s.foto_url} alt="" />
              : <span className="pastiglia-iniziali">{s.nome.slice(0, 1)}{(s.cognome || '').slice(0, 1)}</span>}
            {`${s.nome} ${s.cognome || ''}`.trim()}
          </button>
        ))}
        {altri > 0 && (
          <button type="button" onClick={() => setTutti(!tutti)} style={{ paddingLeft: 12 }}>
            {tutti ? 'Mostra solo quelli del corso' : `+ aggiungi (${altri} disponibili)`}
          </button>
        )}
      </div>
    </>
  );
}
