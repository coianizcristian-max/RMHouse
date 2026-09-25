'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';

const GIORNI = ['', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

// Sceglie in quali orari del corso va una persona: è ciò che la fa
// comparire negli appelli. Un tocco per orario, poi Salva.
export default function AssegnaGiorni({ iscrizioneId, orari, scelti = [], quanti, compatto }) {
  const router = useRouter();
  const [aperto, setAperto] = useState(!compatto);
  const [sel, setSel] = useState(new Set(scelti));
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState('');
  const cambiato = sel.size !== scelti.length || scelti.some((s) => !sel.has(s));

  if (!orari.length) return <span className="piccolo muto">Il corso non ha orari.</span>;
  if (!aperto) {
    const attuali = orari.filter((o) => scelti.includes(o.id));
    return (
      <span className="assegna-chiuso">
        {attuali.length > 0 && (
          <span className="piccolo">{attuali.map((o) => `${GIORNI[o.giorno_settimana]} ${String(o.ora_inizio).slice(0, 5)}`).join(' · ')}</span>
        )}
        <button type="button" className={`btn btn-piccolo${attuali.length ? '' : ' btn-primario'}`} onClick={() => setAperto(true)}>
          {attuali.length ? 'Cambia giorni' : 'Assegna i giorni'}
        </button>
      </span>
    );
  }

  async function salva() {
    setInvio(true); setErrore('');
    const db = supabaseBrowser();
    const del = await db.from('iscrizioni_orari').delete().eq('iscrizione_id', iscrizioneId);
    const ins = sel.size
      ? await db.from('iscrizioni_orari').insert([...sel].map((orario_id) => ({ iscrizione_id: iscrizioneId, orario_id })))
      : { error: null };
    setInvio(false);
    if (del.error || ins.error) { setErrore('Non salvato, riprova.'); return; }
    router.refresh();
  }

  const toggle = (id) => { const s = new Set(sel); s.has(id) ? s.delete(id) : s.add(id); setSel(s); };

  return (
    <div className="assegna-giorni">
      <div className="pastiglie" style={{ margin: 0 }}>
        {orari.map((o) => (
          <button key={o.id} type="button" aria-pressed={sel.has(o.id)} onClick={() => toggle(o.id)} style={{ paddingLeft: 12 }}>
            {GIORNI[o.giorno_settimana]} {String(o.ora_inizio).slice(0, 5)}
          </button>
        ))}
      </div>
      <div className="azioni" style={{ alignItems: 'center' }}>
        <button type="button" className="btn btn-piccolo btn-primario" disabled={invio || !cambiato} onClick={salva}>
          {invio ? 'Salvo…' : 'Salva giorni'}
        </button>
        {quanti ? <span className="piccolo muto">l'abbonamento prevede {quanti} a settimana</span> : null}
        {errore && <span className="piccolo" style={{ color: 'var(--rosso-scuro)' }}>{errore}</span>}
      </div>
    </div>
  );
}
