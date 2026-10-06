'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { dataBreve, ora } from '@/lib/formato';
import { whatsappLink } from '../sportello/campi';

// Prenotati della lezione dentro il foglio del palinsesto, con le azioni veloci di ogni persona
// (come "Gestione prenotazioni" di APP Titolare): presente, non viene (recupero), WhatsApp, togli, scheda.
// I nomi arrivano già col palinsesto; telefoni, certificato e cancellati si caricano solo quando si apre (3 letture).
const TIPI = { recupero: ['recupero', 'tag-attenzione'], ingresso: ['ingresso', 'tag-neutro'], prova: ['in prova', 'tag-rosso'] };
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const ERRORI = {
  gia_presente: 'È già segnata presente: togli prima la presenza.',
  lezione_finita: 'La lezione è finita: usa la presenza (✓) invece di "non viene".',
  non_iscritto_a_questa_lezione: 'Non è fra gli iscritti fissi: per prove e recuperi usa "togli".',
  credito_gia_usato: 'Il recupero di questa lezione è già stato usato.',
  lezione_al_completo: 'Nel frattempo il posto è stato preso.',
  non_autorizzato: 'Non hai i permessi per questa lezione.',
};
const errore = (e) => ERRORI[Object.keys(ERRORI).find((k) => e?.message?.includes(k))] || 'Operazione non riuscita.';

export default function PrenotatiLezione({ lezione, persone, corsoNome, onCambiato }) {
  const id = lezione.lezione_id;
  const [dett, setDett] = useState(null);         // allievo_id → { telefono, titolare, origine, prenotato_il, bloccato, quota_mancante }
  const [presenze, setPresenze] = useState({});
  const [avvisati, setAvvisati] = useState([]);
  const [cerca, setCerca] = useState('');
  const [vediCancellati, setVediCancellati] = useState(false);
  const [msg, setMsg] = useState({ t: '', errore: false });
  const [occupato, setOccupato] = useState('');

  async function leggi() {
    const db = supabaseBrowser();
    const [{ data: pren }, { data: app }, { data: avv }] = await Promise.all([
      db.from('v_prenotati').select('allievo_id, telefono, email, titolare_nome, titolare_cognome, origine, prenotato_il, presente').eq('lezione_id', id),
      db.from('v_appello').select('allievo_id, bloccato, quota_mancante, certificato_in_scadenza').eq('lezione_id', id),
      db.from('assenze_avvisate').select('allievo_id, da, created_at, credito_id, allievi ( nome, cognome )').eq('lezione_id', id).order('created_at'),
    ]);
    const m = {};
    for (const p of pren || []) m[p.allievo_id] = { ...p };
    for (const a of app || []) m[a.allievo_id] = { ...(m[a.allievo_id] || {}), ...a };
    setDett(m);
    setPresenze(Object.fromEntries((pren || []).map((p) => [p.allievo_id, p.presente])));
    setAvvisati(avv || []);
  }
  useEffect(() => { leggi(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const ordinati = useMemo(() => [...persone].sort((a, b) => `${a.cognome} ${a.nome}`.localeCompare(`${b.cognome} ${b.nome}`, 'it')), [persone]);
  const q = norm(cerca.trim());
  const visibili = q ? ordinati.filter((p) => norm(`${p.cognome} ${p.nome} ${p.nome} ${p.cognome}`).includes(q)) : ordinati;
  const iniziata = new Date(lezione.inizio).getTime() - Date.now() < 30 * 60 * 1000;
  const finita = new Date(lezione.fine) < new Date();

  const fatto = async (t) => { setMsg({ t, errore: false }); await leggi(); onCambiato?.(); };
  const sbaglio = (e) => setMsg({ t: errore(e), errore: true });

  async function presente(p) {
    const v = presenze[p.allievo_id] !== true;
    if (v && dett?.[p.allievo_id]?.bloccato && !confirm('Certificato medico scaduto o mancante. Segnare comunque la presenza?')) return;
    setPresenze((x) => ({ ...x, [p.allievo_id]: v }));
    const { error } = await supabaseBrowser().rpc('segna_presenze', { p_lezione: id, p_allievi: [p.allievo_id], p_presente: v });
    if (error) { setPresenze((x) => ({ ...x, [p.allievo_id]: !v })); sbaglio(error); }
  }

  async function nonViene(p) {
    if (!confirm(`${p.nome} ${p.cognome} non viene a questa lezione?\nIl posto si libera e, se l'abbonamento lo prevede, riceve il recupero.`)) return;
    setOccupato(p.allievo_id);
    const { data, error } = await supabaseBrowser().rpc('disdici_lezione', { p_lezione: id, p_allievo: p.allievo_id });
    setOccupato('');
    if (error) { sbaglio(error); return; }
    fatto(data?.credito ? `${p.nome} ${p.cognome}: posto liberato, recupero entro il ${dataBreve(data.scadenza)}.` : `${p.nome} ${p.cognome}: posto liberato (senza recupero).`);
  }

  async function togli(p) {
    if (!confirm(`Togliere ${p.nome} ${p.cognome} da questa lezione?`)) return;
    setOccupato(p.allievo_id);
    const { data, error } = await supabaseBrowser().rpc('rimuovi_partecipante', { p_lezione: id, p_allievo: p.allievo_id });
    setOccupato('');
    if (error) { sbaglio(error); return; }
    if (data === 'iscritto_al_corso') {
      setMsg({ t: 'Ha l\'iscrizione al corso: usa "non viene" per questa lezione, o la sua scheda per toglierla da tutte.', errore: true });
      return;
    }
    fatto(`${p.nome} ${p.cognome} tolta dalla lezione.`);
  }

  async function rimetti(a) {
    if (!confirm(`Rimettere ${a.allievi?.nome} ${a.allievi?.cognome} nella lezione? Il recupero dato per questa lezione viene tolto.`)) return;
    const { error } = await supabaseBrowser().rpc('ripristina_lezione', { p_lezione: id, p_allievo: a.allievo_id });
    if (error) { sbaglio(error); return; }
    fatto(`${a.allievi?.nome} ${a.allievi?.cognome} di nuovo prenotata.`);
  }

  async function messaggio() {
    const testo = prompt(`Messaggio per i ${ordinati.length} prenotati di ${corsoNome} (${dataBreve(lezione.inizio)} ${ora(lezione.inizio)}):`);
    if (!testo?.trim()) return;
    const { data, error } = await supabaseBrowser().rpc('messaggio_lezione', { p_lezione: id, p_oggetto: corsoNome, p_testo: testo.trim() });
    if (error) { sbaglio(error); return; }
    setMsg({ t: `Messaggio in coda per ${data} persone: parte entro cinque minuti (notifica o email).`, errore: false });
  }

  function scarica() {
    const righe = [['Cognome', 'Nome', 'Tipo', 'Telefono', 'Email', 'Chi paga', 'Presente']].concat(ordinati.map((p) => {
      const d = dett?.[p.allievo_id] || {};
      return [p.cognome, p.nome, p.tipo, d.telefono || '', d.email || '', [d.titolare_nome, d.titolare_cognome].filter(Boolean).join(' '),
        presenze[p.allievo_id] === true ? 'sì' : presenze[p.allievo_id] === false ? 'no' : ''];
    }));
    const csv = '﻿' + righe.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `${corsoNome} ${lezione.inizio.slice(0, 10)}.csv`.replace(/[\\/:*?"<>|]/g, '-');
    a.click();
  }

  return (
    <div className="pl">
      <div className="pl-barra">
        <input type="search" value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca per nome" aria-label="Cerca fra i prenotati" />
        <button type="button" className="btn btn-piccolo" onClick={messaggio} disabled={!ordinati.length}>Messaggio a tutti</button>
        <button type="button" className="btn btn-piccolo" onClick={scarica} disabled={!ordinati.length || !dett}>Scarica lista</button>
        <button type="button" className={`btn btn-piccolo${vediCancellati ? ' btn-primario' : ''}`} aria-pressed={vediCancellati}
                onClick={() => setVediCancellati(!vediCancellati)} disabled={!avvisati.length}>
          Cancellati{avvisati.length ? ` (${avvisati.length})` : ''}
        </button>
      </div>
      {msg.t && <p className={`piccolo ${msg.errore ? 'pl-errore' : 'pl-ok'}`} role="status">{msg.t}</p>}

      {ordinati.length === 0 && <p className="piccolo muto" style={{ margin: '8px 4px' }}>Nessun prenotato.</p>}
      <ul className="pl-elenco">
        {visibili.map((p) => {
          const d = dett?.[p.allievo_id] || {};
          const tel = d.telefono;
          const pres = presenze[p.allievo_id];
          const problemi = [d.bloccato && 'certificato non valido', d.quota_mancante && 'quota da pagare'].filter(Boolean);
          return (
            <li key={p.allievo_id} className={occupato === p.allievo_id ? 'occupato' : ''}>
              {p.foto_url
                ? <img src={p.foto_url} alt="" className={p.tipo === 'prova' ? 'pal-faccia prova' : 'pal-faccia'} />
                : <span className={p.tipo === 'prova' ? 'pal-faccia prova' : 'pal-faccia'}>{((p.nome?.[0] || '') + (p.cognome?.[0] || '')).toUpperCase()}</span>}
              <div className="pl-chi">
                <div className="pl-nome">
                  <Link prefetch={false} href={`/gestione/persone/${p.allievo_id}`}>{p.cognome} {p.nome}</Link>
                  {TIPI[p.tipo] && <span className={`tag ${TIPI[p.tipo][1]}`}>{TIPI[p.tipo][0]}</span>}
                  {problemi.length > 0 && <span className="pl-attenzione" title={problemi.join(' · ')} aria-label={problemi.join(' · ')}>⚠ {problemi.join(' · ')}</span>}
                </div>
                <div className="piccolo muto pl-info">
                  {[d.titolare_nome && `${d.titolare_nome} ${d.titolare_cognome || ''}`.trim() !== `${p.nome} ${p.cognome}` ? `paga ${d.titolare_nome}` : null,
                    tel, d.prenotato_il && d.origine !== 'abbonamento' ? `prenotato il ${dataBreve(d.prenotato_il)} ${ora(d.prenotato_il)}` : null,
                    d.origine === 'abbonamento' ? 'con l\'abbonamento' : d.origine ? `da ${d.origine}` : null].filter(Boolean).join(' · ') || ' '}
                </div>
              </div>
              <div className="pl-azioni">
                {iniziata && (
                  <button type="button" className={`pl-btn pl-presente${pres === true ? ' si' : pres === false ? ' no' : ''}`} onClick={() => presente(p)}
                          title={pres === true ? 'Presente: tocca per togliere' : 'Segna presente'} aria-pressed={pres === true}>✓</button>
                )}
                {!finita && (
                  <button type="button" className="pl-btn pl-nonviene" onClick={() => nonViene(p)} title="Non viene: libera il posto (con recupero se previsto)" aria-label={`${p.nome} ${p.cognome} non viene`}>−</button>
                )}
                {tel && (
                  <a className="pl-btn pl-wa" href={whatsappLink(tel, `Ciao ${p.nome}, `)} target="_blank" rel="noreferrer" title={`WhatsApp a ${tel}`} aria-label={`WhatsApp a ${p.nome} ${p.cognome}`}>
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z"/></svg>
                  </a>
                )}
                <button type="button" className="pl-btn pl-togli" onClick={() => togli(p)} title="Togli dalla lezione" aria-label={`Togli ${p.nome} ${p.cognome}`}>
                  <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>
                </button>
              </div>
            </li>
          );
        })}
        {q && visibili.length === 0 && <li className="piccolo muto">Nessuno con &quot;{cerca}&quot;.</li>}
      </ul>

      {vediCancellati && avvisati.length > 0 && (
        <ul className="pl-elenco pl-cancellati">
          {avvisati.map((a) => (
            <li key={a.allievo_id}>
              <span className="pal-faccia">{((a.allievi?.nome?.[0] || '') + (a.allievi?.cognome?.[0] || '')).toUpperCase()}</span>
              <div className="pl-chi">
                <div className="pl-nome"><Link prefetch={false} href={`/gestione/persone/${a.allievo_id}`}>{a.allievi?.cognome} {a.allievi?.nome}</Link>
                  <span className="tag tag-neutro">non viene</span></div>
                <div className="piccolo muto">avvisato il {dataBreve(a.created_at)} {ora(a.created_at)}{a.da ? ` · da ${a.da}` : ''}{a.credito_id ? ' · con recupero' : ''}</div>
              </div>
              {!finita && <div className="pl-azioni"><button type="button" className="btn btn-piccolo" onClick={() => rimetti(a)}>Rimetti</button></div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
