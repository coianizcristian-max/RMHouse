'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { dataBreve } from '@/lib/formato';

const TIPO = { iscritto: ['fisso', 'tag-neutro'], ingresso: ['prenotata', 'tag-ok'], recupero: ['recupero', 'tag-ok'], prova: ['prova', 'tag-attenzione'] };
const ERRORI = {
  troppo_tardi: 'Troppo tardi per disdire con il recupero: segnala l\'assenza dall\'appello.',
  gia_presente: 'È già in questa lezione.', lezione_al_completo: 'La lezione è al completo.', lezione_non_trovata: 'Lezione non trovata.',
  certificato_scaduto: 'Il certificato medico non è valido per quella data.', non_autorizzato: 'Servono i permessi di segreteria.',
};
const ora = (iso) => new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
const giorno = (iso) => new Date(iso).toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'Europe/Rome' });
const messaggio = (e) => ERRORI[Object.keys(ERRORI).find((k) => e?.message?.includes(k))] || 'Operazione non riuscita. Riprova.';

// Le prossime lezioni della persona (fisse, prenotate, recuperi, prove), con disdetta e aggiunta a una lezione
export default function ProssimeLezioni({ allievoId, palestraId, lezioni, disdette }) {
  const router = useRouter();
  const [invio, setInvio] = useState(null);
  const [errore, setErrore] = useState('');
  const [aggiungi, setAggiungi] = useState(false);
  const [elenco, setElenco] = useState(null);
  const [filtro, setFiltro] = useState('');
  const disdetteSet = new Set((disdette || []).map((d) => d.lezione_id));

  async function disdici(l) {
    if (!confirm(`Disdire ${l.corso_nome} di ${giorno(l.inizio)} alle ${ora(l.inizio)}? Se le regole lo prevedono, nasce il recupero.`)) return;
    setInvio(l.id); setErrore('');
    const { error } = await supabaseBrowser().rpc('disdici_lezione', { p_lezione: l.id, p_allievo: allievoId });
    setInvio(null);
    if (error) { setErrore(messaggio(error)); return; }
    router.refresh();
  }

  async function apri() {
    setAggiungi(true); setElenco(null); setErrore('');
    const { data } = await supabaseBrowser().from('v_lezioni')
      .select('id, corso_nome, inizio, sala_nome, insegnante_nome, capienza, partecipanti')
      .eq('palestra_id', palestraId).eq('stato', 'programmata').gt('inizio', new Date().toISOString())
      .order('inizio').limit(120);
    setElenco(data || []);
  }

  async function metti(l) {
    setInvio(l.id); setErrore('');
    const { error } = await supabaseBrowser().rpc('aggiungi_in_appello', { p_lezione: l.id, p_allievo: allievoId });
    setInvio(null);
    if (error) { setErrore(messaggio(error)); return; }
    setAggiungi(false); router.refresh();
  }

  const visibili = (elenco || []).filter((l) => !filtro || l.corso_nome.toLowerCase().includes(filtro.toLowerCase()));

  return (
    <>
      {errore && <div className="errore" role="alert">{errore}</div>}
      {lezioni.length === 0 && !aggiungi && <div className="vuoto">Nessuna lezione nei prossimi 30 giorni.</div>}
      {lezioni.length > 0 && (
        <ul className="mini-lista">
          {lezioni.map((l) => {
            const t = TIPO[l.tipo] || ['', 'tag-neutro'];
            const disdetta = disdetteSet.has(l.id);
            return (
              <li key={l.id}>
                <span className="ml-riga">
                  <span className="ml-testo">
                    <strong>{giorno(l.inizio)} · {ora(l.inizio)} · {l.corso_nome}</strong>
                    <span className="piccolo muto">
                      {l.sala_nome || ''}{l.insegnante_nome ? ` · ${l.insegnante_nome}` : ''} · <span className={`tag ${disdetta ? 'tag-neutro' : t[1]}`}>{disdetta ? 'disdetta' : t[0]}</span>
                    </span>
                  </span>
                  <span className="pag-destra">
                    <Link prefetch={false} className="link-btn piccolo" href={`/gestione/appello/${l.id}`}>appello</Link>
                    {!disdetta && <button className="link-btn piccolo" disabled={invio === l.id} onClick={() => disdici(l)}>disdici</button>}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <div className="azioni-riga" style={{ marginTop: 8 }}>
        {!aggiungi && <button className="btn btn-piccolo" onClick={apri}>Aggiungi a una lezione</button>}
      </div>
      {aggiungi && (
        <div className="azione-iscrizione" style={{ marginTop: 8 }}>
          <strong className="ai-titolo">Aggiungi a una lezione</strong>
          <p className="piccolo muto" style={{ marginTop: 0 }}>Se ha un recupero valido per quel corso lo usa, altrimenti entra come ingresso in più. I giorni fissi dell&apos;abbonamento si cambiano da Iscrizioni → Modifica.</p>
          <input placeholder="Filtra per corso…" value={filtro} onChange={(e) => setFiltro(e.target.value)} style={{ marginBottom: 8 }} />
          {elenco === null && <div className="piccolo muto">Carico le lezioni…</div>}
          {elenco !== null && visibili.length === 0 && <div className="vuoto">Nessuna lezione.</div>}
          {visibili.length > 0 && (
            <ul className="mini-lista" style={{ maxHeight: 320, overflow: 'auto' }}>
              {visibili.slice(0, 60).map((l) => (
                <li key={l.id}>
                  <span className="ml-riga">
                    <span className="ml-testo">
                      <strong>{giorno(l.inizio)} · {ora(l.inizio)} · {l.corso_nome}</strong>
                      <span className="piccolo muto">{l.sala_nome || ''}{l.capienza ? ` · ${l.partecipanti}/${l.capienza}` : ''}</span>
                    </span>
                    <button className="btn btn-piccolo btn-primario" disabled={invio === l.id || (l.capienza && l.partecipanti >= l.capienza)} onClick={() => metti(l)}>
                      {l.capienza && l.partecipanti >= l.capienza ? 'piena' : 'Metti qui'}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="azioni" style={{ marginTop: 8 }}><button className="btn btn-piccolo" onClick={() => setAggiungi(false)}>Chiudi</button></div>
        </div>
      )}
    </>
  );
}
