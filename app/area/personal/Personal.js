'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase/browser';

const GIORNI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const FASCE = ['mattina', 'pranzo', 'pomeriggio', 'sera'];
const giornoLungo = (iso) => new Date(iso).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Europe/Rome' });
const oraDi = (iso) => new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });

// Lezione privata: tocchi l'insegnante → vedi i suoi orari liberi e ne scegli uno o più;
// se non ha orari pubblicati (o nessuno va bene) dici tu quando sei libero. La segreteria conferma.
export default function Personal({ insegnanti, allievi }) {
  const [chi, setChi] = useState(allievi[0]?.id || '');
  const [prof, setProf] = useState(null);
  const [slot, setSlot] = useState(null);          // null = carico, [] = nessuno
  const [scelti, setScelti] = useState([]);
  const [aMano, setAMano] = useState(false);
  const [giorni, setGiorni] = useState([]);
  const [fasce, setFasce] = useState([]);
  const [nota, setNota] = useState('');
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState('');
  const [fatto, setFatto] = useState(false);
  const pannello = useRef(null);
  const p = insegnanti.find((x) => x.id === prof);
  const alterna = (lista, set, v, max = 99) => set(lista.includes(v) ? lista.filter((x) => x !== v) : lista.length >= max ? lista : [...lista, v]);

  async function scegli(x) {
    setProf(x.id); setScelti([]); setGiorni([]); setFasce([]); setErrore(''); setAMano(!x.disponibile); setSlot(null);
    setTimeout(() => pannello.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    if (x.disponibile) {
      const { data } = await supabaseBrowser().rpc('slot_personal', { p_staff: x.id, p_giorni: 21 });
      setSlot(data || []);
      if (!data?.length) setAMano(true);
    }
  }

  async function invia() {
    if (!aMano && scelti.length === 0) { setErrore('Tocca almeno un orario.'); return; }
    if (aMano && giorni.length === 0 && !nota.trim()) { setErrore('Dicci almeno in che giorni hai tempo.'); return; }
    const quando = aMano
      ? [giorni.length ? giorni.join(', ') : null, fasce.length ? fasce.join(' o ') : null].filter(Boolean).join(' · ') || nota
      : scelti.slice().sort().map((s) => `${giornoLungo(s)} ${oraDi(s)}`).join(' · ');
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().rpc('richiedi_personal_orari', {
      p_allievo: chi, p_staff: prof, p_slot: aMano ? [] : scelti, p_quando: quando, p_nota: nota || null });
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

  // orari raggruppati per giorno
  const perGiorno = {};
  (slot || []).forEach((s) => { const k = new Date(s.inizio).toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }); (perGiorno[k] ||= []).push(s); });

  return (
    <div className="area-casa area-personal">
      <div className="ac-testa"><h1>Lezione privata</h1>
        <p className="ac-nota" style={{ margin: '2px 0 0' }}>Tocca l'insegnante: vedi i suoi orari liberi e scegline uno o più. La segreteria ti conferma.</p>
      </div>
      {allievi.length > 1 && (
        <div className="ac-giorni" role="group" aria-label="Per chi">
          {allievi.map((a) => <button key={a.id} type="button" aria-pressed={chi === a.id} onClick={() => setChi(a.id)}>Per {a.nome}</button>)}
        </div>
      )}

      <div className="pe-griglia">
        {insegnanti.map((x) => (
          <button key={x.id} type="button" className="pe-prof" aria-pressed={prof === x.id} onClick={() => scegli(x)}>
            {x.foto ? <img src={x.foto} alt="" loading="lazy" /> : <span className="pe-iniziale">{x.nome.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>}
            <strong>{x.nome}</strong>
            {x.specialita && <small>{x.specialita}</small>}
            {x.disponibile && <em className="pe-libero">orari liberi</em>}
          </button>
        ))}
      </div>

      {p && (
        <section className="pe-pannello" ref={pannello}>
          <div className="pe-testa">
            {p.foto ? <img src={p.foto} alt="" /> : <span className="pe-iniziale piccola">{p.nome[0]}</span>}
            <span><strong>{p.nome}</strong>{p.specialita && <small>{p.specialita}</small>}</span>
          </div>
          {errore && <div className="errore" role="alert">{errore}</div>}

          {!aMano && slot === null && <p className="ac-nota">Carico gli orari liberi…</p>}
          {!aMano && slot?.length > 0 && (
            <>
              <span className="aq-etichetta">Scegli uno o più orari (fino a 6)</span>
              <div className="pe-giorni">
                {Object.entries(perGiorno).map(([g, lista]) => (
                  <div key={g} className="pe-giorno">
                    <span className="pe-data">{giornoLungo(lista[0].inizio)}</span>
                    <div className="aq-chips">
                      {lista.map((s) => (
                        <button key={s.inizio} type="button" aria-pressed={scelti.includes(s.inizio)} onClick={() => alterna(scelti, setScelti, s.inizio, 6)}>{oraDi(s.inizio)}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" className="link-btn piccolo" onClick={() => setAMano(true)}>Nessun orario va bene? Dicci tu quando puoi</button>
            </>
          )}

          {aMano && (
            <>
              <span className="aq-etichetta">{p.disponibile && slot?.length === 0 ? `${p.nome.split(' ')[0]} non ha orari liberi nelle prossime settimane: dicci` : 'Dicci'} quando puoi</span>
              <div className="aq-chips">{GIORNI.map((g) => <button key={g} type="button" aria-pressed={giorni.includes(g)} onClick={() => alterna(giorni, setGiorni, g)}>{g}</button>)}</div>
              <div className="aq-chips">{FASCE.map((g) => <button key={g} type="button" aria-pressed={fasce.includes(g)} onClick={() => alterna(fasce, setFasce, g)}>{g}</button>)}</div>
              {p.disponibile && slot?.length > 0 && <button type="button" className="link-btn piccolo" onClick={() => setAMano(false)}>Torna agli orari liberi</button>}
            </>
          )}

          <textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Altro da dire? (obiettivo, livello, preferenze…)" />
          <button className="btn btn-primario" disabled={invio} onClick={invia}>
            {invio ? 'Invio…' : !aMano && scelti.length ? `Chiedi ${scelti.length === 1 ? 'questo orario' : `questi ${scelti.length} orari`}` : `Chiedi una lezione con ${p.nome.split(' ')[0]}`}
          </button>
        </section>
      )}
    </div>
  );
}
