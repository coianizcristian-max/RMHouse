'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';

// "Cosa insegna": le discipline (o un'area intera, che comprende anche le discipline aggiunte dopo).
// Un tocco aggiunge o toglie e si salva subito. Quando si sceglie chi tiene un corso, negli orari, nelle sostituzioni,
// queste persone vengono proposte per prime.
export default function CompetenzeStaff({ palestraId, staffId, nome, categorie = [], discipline = [], righe = [] }) {
  const router = useRouter();
  const [k, setK] = useState(righe);
  const [errore, setErrore] = useState('');
  const [lavoro, setLavoro] = useState(false);

  const aree = [
    ...categorie.map((c) => ({ ...c, discipline: discipline.filter((d) => d.categoria_id === c.id) })),
    { id: null, nome: 'Altro', discipline: discipline.filter((d) => !d.categoria_id || !categorie.some((c) => c.id === d.categoria_id)) },
  ].filter((a) => a.discipline.length > 0);
  const haArea = (id) => k.some((x) => x.categoria_id === id);
  const haDisc = (id) => k.some((x) => x.disciplina_id === id);

  async function esegui(fn) {
    setErrore(''); setLavoro(true);
    const prima = k;
    const { error, nuove } = await fn();
    setLavoro(false);
    if (error) { setK(prima); setErrore(error.message?.includes('staff_competenze') ? 'Manca la query 156 in Supabase.' : 'Modifica non riuscita.'); return; }
    if (nuove) setK(nuove);
    router.refresh();
  }

  function toccaDisciplina(d) {
    const db = supabaseBrowser();
    if (haDisc(d.id)) {
      setK((xs) => xs.filter((x) => x.disciplina_id !== d.id));
      return esegui(async () => db.from('staff_competenze').delete().eq('staff_id', staffId).eq('disciplina_id', d.id));
    }
    return esegui(async () => {
      const { data, error } = await db.from('staff_competenze').insert({ palestra_id: palestraId, staff_id: staffId, disciplina_id: d.id })
        .select('id, disciplina_id, categoria_id').single();
      return { error, nuove: error ? null : [...k, data] };
    });
  }

  function toccaArea(a) {
    const db = supabaseBrowser();
    if (haArea(a.id)) {
      setK((xs) => xs.filter((x) => x.categoria_id !== a.id));
      return esegui(async () => db.from('staff_competenze').delete().eq('staff_id', staffId).eq('categoria_id', a.id));
    }
    // tutta l'area: le singole discipline dell'area non servono più
    const ids = a.discipline.map((d) => d.id);
    return esegui(async () => {
      if (ids.length) {
        const { error: e1 } = await db.from('staff_competenze').delete().eq('staff_id', staffId).in('disciplina_id', ids);
        if (e1) return { error: e1 };
      }
      const { data, error } = await db.from('staff_competenze').insert({ palestra_id: palestraId, staff_id: staffId, categoria_id: a.id })
        .select('id, disciplina_id, categoria_id').single();
      return { error, nuove: error ? null : [...k.filter((x) => !ids.includes(x.disciplina_id)), data] };
    });
  }

  return (
    <section className="pannello competenze" aria-label="Cosa insegna">
      <h2>Cosa insegna</h2>
      <p className="piccolo muto" style={{ marginTop: -4 }}>
        Tocca le discipline di {nome || 'questa persona'}, oppure &quot;tutta l&apos;area&quot;. Si salva da solo.
        Quando si sceglie l&apos;insegnante di un corso (orari, sostituzioni) chi insegna quella disciplina viene proposto per primo.
      </p>
      {errore && <div className="errore" role="alert">{errore}</div>}
      {aree.length === 0 && <p className="muto">Non ci sono ancora discipline: si creano in Struttura → Corsi.</p>}
      <div className="cmp-aree">
        {aree.map((a) => {
          const tutta = a.id && haArea(a.id);
          return (
            <div key={a.id || 'altro'} className={`cmp-area${tutta ? ' tutta' : ''}`}>
              <div className="cmp-testa">
                <b>{a.nome}</b>
                {a.id && (
                  <button type="button" className="stato-pillola" aria-pressed={!!tutta} disabled={lavoro} onClick={() => toccaArea(a)}>
                    {tutta ? '✓ tutta l\'area' : 'tutta l\'area'}
                  </button>
                )}
              </div>
              <div className="cmp-discipline">
                {a.discipline.map((d) => (
                  <button key={d.id} type="button" className="stato-pillola" aria-pressed={!!tutta || haDisc(d.id)} disabled={lavoro || !!tutta}
                          onClick={() => toccaDisciplina(d)}>{d.nome}</button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
