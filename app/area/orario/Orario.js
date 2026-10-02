'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { ora } from '@/lib/formato';

const MOTIVI = {
  lezione_al_completo: 'Nel frattempo si è riempita.',
  limite_recuperi_mese: 'Hai già fatto tutti i recuperi di quel mese.',
  lezione_non_disponibile: 'Quella lezione non è più prenotabile.',
  certificato_scaduto: 'Il certificato medico non è valido per quel giorno: caricalo da "Io".',
  lezione_disdetta: 'È la lezione che hai cancellato: scegline un\'altra.',
};

// giorni da mostrare nella fila in alto: due settimane
function giorni(oggi, da = oggi) {
  const out = [];
  const base = new Date(`${da}T12:00:00`);
  for (let i = 0; i < 14; i++) {
    const d = new Date(base); d.setDate(base.getDate() + i);
    out.push({
      iso: d.toISOString().slice(0, 10),
      sett: d.toISOString().slice(0, 10) === oggi ? 'Oggi' : d.toISOString().slice(0, 10) === new Date(new Date(`${oggi}T12:00:00`).getTime() + 86400000).toISOString().slice(0, 10) ? 'Domani' : d.toLocaleDateString('it-IT', { weekday: 'short' }).replace('.', ''),
      num: d.getDate(),
    });
  }
  return out;
}

export default function Orario({ giorno: iniziale, oggi, lezioni: primeLezioni, prenotabili, allievi, sedi = [] }) {
  const router = useRouter();
  const [giorno, setGiorno] = useState(iniziale);
  const [lezioni, setLezioni] = useState(primeLezioni);
  const [disciplina, setDisciplina] = useState('');
  const [sede, setSede] = useState('');
  const [spiega, setSpiega] = useState(null);     // lezione senza abbonamento adatto
  const [avvisati, setAvvisati] = useState([]);   // corsi in partenza per cui ha chiesto l'avviso
  const [carico, setCarico] = useState(false);
  const [chiedo, setChiedo] = useState(null);       // { lezione, opzioni }
  const [invio, setInvio] = useState(false);
  const [avviso, setAvviso] = useState('');
  const [errore, setErrore] = useState('');
  // la fila parte da oggi; scegliendo una data più avanti dal calendario parte da quella settimana
  const [inizioFila, setInizioFila] = useState(() => {
    const ok = (iniziale > oggi && (new Date(iniziale) - new Date(oggi)) / 86400000 >= 14);
    return ok ? iniziale : oggi;
  });
  const fila = useMemo(() => giorni(oggi, inizioFila), [oggi, inizioFila]);
  const calendario = useRef(null);
  function daCalendario(g) {
    if (!g || g < oggi) return;
    if (!fila.some((d) => d.iso === g)) {
      // mostra la settimana della data scelta (dal lunedì, ma non prima di oggi)
      const d = new Date(`${g}T12:00:00`); d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      const lun = d.toISOString().slice(0, 10);
      setInizioFila(lun < oggi ? oggi : lun);
    }
    vaiA(g);
  }
  const nome = (id) => allievi.find((a) => a.id === id)?.nome || '';
  const piu = allievi.length > 1;

  useEffect(() => { setLezioni(primeLezioni); }, [primeLezioni]);

  async function carica(g, s) {
    setChiedo(null); setSpiega(null); setAvviso(''); setErrore(''); setCarico(true);
    const { data } = await supabaseBrowser().rpc('orario_area', { p_giorno: g, p_sede: s || null });
    setLezioni(data || []); setCarico(false);
  }
  function vaiA(g) {
    if (g === giorno) return;
    setGiorno(g); setDisciplina('');
    window.history.replaceState(null, '', `/area/orario?giorno=${g}`);
    carica(g, sede);
  }
  function cambiaSede(s) { setSede(s); setDisciplina(''); carica(giorno, s); }

  async function prenota(l, voce) {
    setInvio(true); setErrore(''); setAvviso('');
    const db = supabaseBrowser();
    const { error } = voce.credito
      ? await db.rpc('prenota_recupero', { p_credito: voce.credito, p_lezione: l.lezione_id })
      : await db.rpc('prenota_lezione', { p_lezione: l.lezione_id, p_allievo: voce.allievo_id });
    setInvio(false); setChiedo(null);
    if (error) {
      const k = Object.keys(MOTIVI).find((m) => error.message?.includes(m));
      setErrore(k ? MOTIVI[k] : 'Prenotazione non riuscita. Riprova.'); return;
    }
    setAvviso(`Prenotazione confermata! ${l.corso} alle ${ora(l.inizio)}${piu ? ` per ${voce.nome}` : ''}.`);
    const { data } = await db.rpc('orario_area', { p_giorno: giorno, p_sede: sede || null });
    setLezioni(data || []);
    router.refresh();
  }

  async function avvisami(l) {
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().rpc('avvisami_partenza', { p_allievo: allievi[0]?.id, p_corso: l.corso_id });
    setInvio(false);
    if (error) { setErrore('Non riuscito. Riprova.'); return; }
    setAvvisati([...avvisati, l.corso_id]);
    setAvviso(`Ti avvisiamo appena ${l.corso} parte.`);
  }

  const discipline = [...new Set(lezioni.map((l) => l.disciplina).filter(Boolean))].sort();
  const visibili = lezioni.filter((l) => !disciplina || l.disciplina === disciplina);
  const adesso = Date.now();

  return (
    <div className="area-casa area-orario">
      <div className="ac-testa or-testa">
        <h1>Orario</h1>
        {sedi.length > 1 && (
          <select value={sede} onChange={(e) => cambiaSede(e.target.value)} aria-label="Sede" className="or-sede">
            <option value="">Tutte le sedi</option>
            {sedi.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
          </select>
        )}
      </div>

      <div className="or-fila">
      <div className="or-giorni" role="tablist" aria-label="Giorno">
        {inizioFila !== oggi && (
          <button type="button" className="or-oggi" onClick={() => { setInizioFila(oggi); vaiA(oggi); }}><span>torna a</span><strong>Oggi</strong></button>
        )}
        {fila.map((d) => (
          <button key={d.iso} type="button" role="tab" aria-selected={d.iso === giorno} onClick={() => vaiA(d.iso)}>
            <span>{d.sett}</span><strong>{d.num}</strong>
          </button>
        ))}
      </div>
        <button type="button" className="or-calendario" aria-label="Scegli una data dal calendario"
                onClick={() => { const c = calendario.current; if (!c) return; if (c.showPicker) { try { c.showPicker(); return; } catch { /* sotto */ } } c.click(); }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M8 2v4M16 2v4M3 10h18" /></svg>
          <input ref={calendario} type="date" min={oggi} value={giorno} onChange={(e) => daCalendario(e.target.value)} tabIndex={-1} aria-hidden="true" />
        </button>
      </div>

      {discipline.length > 1 && (
        <div className="ac-giorni" role="group" aria-label="Disciplina">
          <button type="button" aria-pressed={!disciplina} onClick={() => setDisciplina('')}>Tutte</button>
          {discipline.map((d) => <button key={d} type="button" aria-pressed={disciplina === d} onClick={() => setDisciplina(d)}>{d}</button>)}
        </div>
      )}

      {errore && <div className="errore" role="alert">{errore}</div>}
      {avviso && <div className="avviso-ok" role="status">{avviso}</div>}
      {carico && <p className="ac-nota">Carico…</p>}
      {!carico && visibili.length === 0 && <div className="vuoto">Nessuna lezione in questo giorno.</div>}

      <ul className="ac-lezioni">
        {visibili.map((l) => {
          const liberi = l.capienza ? Math.max(l.capienza - l.occupati, 0) : null;
          const passata = new Date(l.inizio).getTime() < adesso;
          const opzioni = (prenotabili[l.lezione_id] || []).filter((v) => !l.miei.some((m) => m.allievo_id === v.allievo_id));
          const k = l.lezione_id;
          return (
            <li key={k} className={l.stato === 'annullata' || passata ? 'annullata' : ''}>
              <span className="ac-banda" style={{ background: l.colore || 'var(--rosso)' }} />
              <span className="ac-quando"><strong>{ora(l.inizio)}</strong><span>{ora(l.fine)}</span></span>
              <span className="ac-cosa">
                <strong>{l.corso}</strong>
                <span>{[l.insegnante, l.sala].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="ac-azione">
                {l.stato === 'annullata' ? <span className="tag tag-neutro">annullata</span>
                  : l.miei.length > 0 ? <span className="tag tag-ok">{piu ? l.miei.map((m) => nome(m.allievo_id)).join(', ') : 'ci sei'}</span>
                  : l.iscrizioni === 'attesa' ? (avvisati.includes(l.corso_id)
                      ? <span className="tag tag-ok">ti avvisiamo</span>
                      : <button className="btn btn-piccolo or-prenota-no" disabled={invio} onClick={() => setSpiega(spiega === k ? null : k)}>In partenza<small>avvisami</small></button>)
                  : l.iscrizioni === 'chiuse' ? <span className="piccolo muto">iscrizioni chiuse</span>
                  : l.miei.length > 0 ? <span className="tag tag-ok">{piu ? l.miei.map((m) => nome(m.allievo_id)).join(', ') : 'ci sei'}</span>
                  : passata ? null
                  : opzioni.length > 0 && liberi !== 0
                    ? <button className="btn btn-piccolo btn-primario" disabled={invio} onClick={() => setChiedo(chiedo === k ? null : k)}>Prenota</button>
                  : liberi === 0 ? <span className="tag tag-neutro">completa</span>
                  : !l.prenotabile && !l.per_tutti ? <span className="piccolo muto">non prenotabile</span>
                  : <button className="btn btn-piccolo or-prenota-no" onClick={() => setSpiega(spiega === k ? null : k)}>
                      Prenota{liberi != null ? <small>{liberi} posti</small> : null}
                    </button>}
              </span>
              {spiega === k && l.iscrizioni === 'attesa' && (
                <span className="conferma-disdetta">
                  <span><strong>{l.corso}</strong> sta per partire{l.nota_iscrizioni ? `: ${l.nota_iscrizioni.trim().replace(/[.!]?$/, '.')}` : '.'} Ti mandiamo una notifica appena si può prenotare.</span>
                  <span className="azioni">
                    <button className="btn btn-primario btn-piccolo" disabled={invio} onClick={() => { setSpiega(null); avvisami(l); }}>Avvisami quando parte</button>
                    <button className="btn btn-piccolo" onClick={() => setSpiega(null)}>Chiudi</button>
                  </span>
                </span>
              )}
              {spiega === k && l.iscrizioni !== 'attesa' && (
                <span className="conferma-disdetta">
                  <span>Per prenotare <strong>{l.corso}</strong> serve un abbonamento che lo comprenda{piu ? ' (o un recupero valido)' : ' (oppure un recupero valido per questo corso)'}.</span>
                  <span className="azioni">
                    <Link prefetch={false} className="btn btn-primario btn-piccolo" href={`/area/acquista?corso=${l.corso_id}`}>Acquista l'abbonamento</Link>
                    {l.prova && <Link prefetch={false} className="btn btn-piccolo" href="/area/prova">Prova una lezione</Link>}
                    <button className="btn btn-piccolo" onClick={() => setSpiega(null)}>Chiudi</button>
                  </span>
                </span>
              )}
              {chiedo === k && (
                <span className="conferma-disdetta conferma-ok">
                  <span>Prenoti {l.corso} alle {ora(l.inizio)}{opzioni.length === 1 && piu ? ` per ${opzioni[0].nome}` : ''}?
                    {opzioni.length === 1 && opzioni[0].credito ? ' (usa un recupero)' : ''}</span>
                  <span className="azioni">
                    {opzioni.length === 1
                      ? <button className="btn btn-primario btn-piccolo" disabled={invio} onClick={() => prenota(l, opzioni[0])}>{invio ? 'Un attimo…' : 'Sì, prenota'}</button>
                      : opzioni.map((v) => (
                          <button key={v.allievo_id} className="btn btn-primario btn-piccolo" disabled={invio} onClick={() => prenota(l, v)}>
                            {v.nome}{v.credito ? ' (recupero)' : ''}
                          </button>
                        ))}
                    <button className="btn btn-piccolo" onClick={() => setChiedo(null)}>No</button>
                  </span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
