'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { gruppoColorato, mappaGruppi, chiaveGruppo } from '@/lib/gruppi';

const GIORNI = ['', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

// Sceglie in quali orari del corso va una persona: è ciò che la fa
// comparire negli appelli. Un tocco per orario, poi Salva.
export default function AssegnaGiorni({ iscrizioneId, orari, scelti = [], quanti, compatto }) {
  const router = useRouter();
  const [aperto, setAperto] = useState(!compatto);
  const [sel, setSel] = useState(new Set(scelti));
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState('');
  const colori = mappaGruppi(orari);   // colore di ogni gruppo del corso
  const cambiato = sel.size !== scelti.length || scelti.some((s) => !sel.has(s));
  // i giorni a settimana dell'abbonamento (es. "2 volte"): non se ne possono segnare di più
  const max = quanti > 0 ? quanti : null;
  const troppi = max != null && sel.size > max;
  const [avviso, setAvviso] = useState('');

  if (!orari.length) return <span className="piccolo muto">Il corso non ha orari.</span>;
  if (!aperto) {
    const attuali = orari.filter((o) => scelti.includes(o.id));
    return (
      <span className="assegna-chiuso">
        {attuali.length > 0 && (
          <span className="piccolo">{attuali.map((o) => `${GIORNI[o.giorno_settimana]} ${String(o.ora_inizio).slice(0, 5)}`).join(' · ')}
            {gruppoColorato(attuali, orari) && <span className="tag-gruppo" style={{ '--g': gruppoColorato(attuali, orari).colore, marginLeft: 6 }}>{gruppoColorato(attuali, orari).nome}</span>}</span>
        )}
        {max != null && scelti.length > max && <span className="tag tag-rosso" title="Ha più giorni di quelli che l'abbonamento prevede">{scelti.length} giorni su {max}</span>}
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

  const toggle = (id) => {
    setAvviso('');
    if (sel.has(id)) { const s = new Set(sel); s.delete(id); setSel(s); return; }
    if (max === 1) { setSel(new Set([id])); return; }                 // "1 volta": il nuovo giorno prende il posto
    if (max != null && sel.size >= max) { setAvviso(`L'abbonamento prevede ${max} giorni a settimana: togline prima uno.`); return; }
    setSel(new Set([...sel, id]));
  };

  return (
    <div className="assegna-giorni">
      <div className="pastiglie" style={{ margin: 0 }}>
        {orari.map((o) => (
          <button key={o.id} type="button" aria-pressed={sel.has(o.id)} onClick={() => toggle(o.id)}
                  style={{ paddingLeft: 12, ...(colori[chiaveGruppo(o.gruppo)] ? { borderLeft: `5px solid ${colori[chiaveGruppo(o.gruppo)].colore}` } : {}) }}>
            {GIORNI[o.giorno_settimana]} {String(o.ora_inizio).slice(0, 5)}{o.gruppo ? <span className="muto"> · {colori[chiaveGruppo(o.gruppo)]?.nome || o.gruppo}</span> : null}
          </button>
        ))}
      </div>
      <div className="azioni" style={{ alignItems: 'center' }}>
        <button type="button" className="btn btn-piccolo btn-primario" disabled={invio || !cambiato || troppi} onClick={salva}>
          {invio ? 'Salvo…' : 'Salva giorni'}
        </button>
        {max ? <span className={`piccolo ${troppi ? 'ag-troppi' : 'muto'}`}><b>{sel.size}/{max}</b> · l&apos;abbonamento prevede {max} {max === 1 ? 'giorno' : 'giorni'} a settimana{troppi ? `: togline ${sel.size - max}` : ''}</span> : null}
        {avviso && <span className="piccolo ag-troppi" role="alert">{avviso}</span>}
        {errore && <span className="piccolo" style={{ color: 'var(--rosso-scuro)' }}>{errore}</span>}
      </div>
    </div>
  );
}
