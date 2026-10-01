'use client';
import { useState } from 'react';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase/browser';

const GIORNI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const FASCE = ['mattina', 'pranzo', 'pomeriggio', 'sera'];

// Lezione privata: scegli l'insegnante, dici quando sei libero, la segreteria conferma
export default function Personal({ insegnanti, allievi }) {
  const [chi, setChi] = useState(allievi[0]?.id || '');
  const [prof, setProf] = useState(null);
  const [giorni, setGiorni] = useState([]);
  const [fasce, setFasce] = useState([]);
  const [nota, setNota] = useState('');
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState('');
  const [fatto, setFatto] = useState(false);
  const alterna = (lista, set, v) => set(lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);
  const p = insegnanti.find((x) => x.id === prof);

  async function invia() {
    if (!prof) { setErrore('Scegli l\'insegnante.'); return; }
    if (giorni.length === 0 && !nota.trim()) { setErrore('Dicci almeno in che giorni sei libero.'); return; }
    const quando = [giorni.length ? giorni.join(', ') : null, fasce.length ? fasce.join(' o ') : null].filter(Boolean).join(' · ') || nota;
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().rpc('richiedi_personal', { p_allievo: chi, p_staff: prof, p_quando: quando, p_nota: nota || null });
    setInvio(false);
    if (error) { setErrore('Richiesta non inviata. Riprova.'); return; }
    setFatto(true);
  }

  if (fatto) return (
    <div className="area-casa">
      <div className="avviso-ok">Richiesta inviata ✓ La segreteria ti conferma giorno e ora con {p?.nome}: ti arriva la notifica.</div>
      <Link prefetch={false} className="btn" href="/area">Torna alle lezioni</Link>
    </div>
  );

  return (
    <div className="area-casa area-personal">
      <div className="ac-testa"><h1>Lezione privata</h1>
        <p className="ac-nota" style={{ margin: '2px 0 0' }}>Scegli l'insegnante e dicci quando sei libero: la segreteria ti conferma giorno e ora.</p>
      </div>
      {errore && <div className="errore" role="alert">{errore}</div>}
      {allievi.length > 1 && (
        <div className="ac-giorni" role="group" aria-label="Per chi">
          {allievi.map((a) => <button key={a.id} type="button" aria-pressed={chi === a.id} onClick={() => setChi(a.id)}>Per {a.nome}</button>)}
        </div>
      )}

      <div className="pe-griglia">
        {insegnanti.map((x) => (
          <button key={x.id} type="button" className="pe-prof" aria-pressed={prof === x.id} onClick={() => setProf(x.id)}>
            {x.foto ? <img src={x.foto} alt="" loading="lazy" /> : <span className="pe-iniziale">{x.nome[0]}</span>}
            <strong>{x.nome}</strong>
            {x.specialita && <span>{x.specialita}</span>}
          </button>
        ))}
      </div>

      {prof && (
        <section className="pe-quando">
          <span className="aq-etichetta">Quando sei libero?</span>
          <div className="aq-chips">{GIORNI.map((g) => <button key={g} type="button" aria-pressed={giorni.includes(g)} onClick={() => alterna(giorni, setGiorni, g)}>{g}</button>)}</div>
          <div className="aq-chips">{FASCE.map((g) => <button key={g} type="button" aria-pressed={fasce.includes(g)} onClick={() => alterna(fasce, setFasce, g)}>{g}</button>)}</div>
          <textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Altro da dire? (obiettivo, livello, preferenze di orario…)" />
          <button className="btn btn-primario" disabled={invio} onClick={invia}>{invio ? 'Invio…' : `Chiedi una lezione con ${p.nome.split(' ')[0]}`}</button>
        </section>
      )}
    </div>
  );
}
