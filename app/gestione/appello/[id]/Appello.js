'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { etaAl } from '@/lib/formato';

const ETICHETTE = { prova: ['In prova', 'tag-rosso'], recupero: ['Recupero', 'tag-attenzione'], ingresso: ['Ingresso', 'tag-neutro'] };

export default function Appello({ lezioneId, palestraId, persone, corsoNome = '', gestione = true }) {
  const router = useRouter();
  const [presenze, setPresenze] = useState(Object.fromEntries(persone.map((p) => [p.allievo_id, p.presente])));
  const [errore, setErrore] = useState('');
  const [cerca, setCerca] = useState('');
  const [aggiungi, setAggiungi] = useState(false);
  const [testoCerca, setTestoCerca] = useState('');
  const [candidati, setCandidati] = useState(null);

  async function cerca2(testo) {
    setCandidati(null);
    const { data } = await supabaseBrowser().rpc('candidati_lezione', { p_lezione: lezioneId, p_cerca: testo });
    setCandidati(data || []);
  }

  async function aggiungiPersona(c) {
    let forza = false;
    if (!c.certificato_ok || c.abbonamento === 'nessun abbonamento') {
      forza = confirm(`${c.nome} ${c.cognome}: ${!c.certificato_ok ? 'certificato non valido' : 'nessun abbonamento attivo'}. Aggiungere lo stesso?`);
      if (!forza) return;
    }
    const tipo = confirm('È un recupero? Premi Annulla per un ingresso normale.') ? 'recupero' : 'ingresso';
    const { error } = await supabaseBrowser().rpc('aggiungi_partecipante', {
      p_lezione: lezioneId, p_allievo: c.allievo_id, p_tipo: tipo, p_forza: forza, p_note: null,
    });
    if (error) {
      setErrore(error.message?.includes('lezione_al_completo')
        ? 'La lezione è al completo: alza i posti da calendario, oppure forza.'
        : 'Non aggiunto: controlla abbonamento e certificato.');
      return;
    }
    setAggiungi(false); router.refresh();
  }

  async function togli(p) {
    if (!confirm(`Togliere ${p.nome} ${p.cognome} da questa lezione?`)) return;
    const { data, error } = await supabaseBrowser().rpc('rimuovi_partecipante', {
      p_lezione: lezioneId, p_allievo: p.allievo_id,
    });
    if (error) { setErrore('Operazione non riuscita.'); return; }
    if (data === 'iscritto_al_corso') {
      setErrore('È iscritto al corso: per toglierlo da tutte le lezioni vai sulla sua scheda.');
      return;
    }
    router.refresh();
  }

  async function messaggio() {
    const testo = prompt('Cosa vuoi scrivere a chi è prenotato a questa lezione?');
    if (!testo?.trim()) return;
    const { data, error } = await supabaseBrowser().rpc('messaggio_lezione', {
      p_lezione: lezioneId, p_oggetto: corsoNome, p_testo: testo.trim(),
    });
    if (error) { setErrore('Messaggio non inviato.'); return; }
    setErrore('');
    alert(`In coda per ${data} persone: partono entro cinque minuti.`);
  }

  function scarica() {
    const righe = [['Cognome', 'Nome', 'Tipo', 'Origine', 'Telefono', 'Email', 'Presente']]
      .concat(persone.map((p) => [p.cognome, p.nome, p.tipo, p.origine || '', p.telefono || '', p.email || '',
        presenze[p.allievo_id] === true ? 'sì' : presenze[p.allievo_id] === false ? 'no' : '']));
    const csv = '\uFEFF' + righe.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'lezione.csv';
    a.click();
  }

  async function segna(allievoId, presente, bloccato) {
    if (presente && bloccato && !confirm('Certificato medico scaduto o mancante. Segnare comunque la presenza?')) return;
    const prima = presenze[allievoId];
    setPresenze({ ...presenze, [allievoId]: presente });
    setErrore('');
    const { error } = await supabaseBrowser().from('presenze').upsert(
      { palestra_id: palestraId, lezione_id: lezioneId, allievo_id: allievoId, presente },
      { onConflict: 'lezione_id,allievo_id' }
    );
    if (error) {
      setPresenze((p) => ({ ...p, [allievoId]: prima }));
      setErrore('Presenza non salvata. Controlla la connessione e riprova.');
    }
  }

  async function tuttiPresenti() {
    const mancanti = persone.filter((p) => presenze[p.allievo_id] == null);
    if (!mancanti.length) return;
    if (!confirm(`Segnare presenti le ${mancanti.length} persone non ancora spuntate?`)) return;
    setPresenze({ ...presenze, ...Object.fromEntries(mancanti.map((p) => [p.allievo_id, true])) });
    const { error } = await supabaseBrowser().from('presenze').upsert(
      mancanti.map((p) => ({ palestra_id: palestraId, lezione_id: lezioneId, allievo_id: p.allievo_id, presente: true })),
      { onConflict: 'lezione_id,allievo_id' }
    );
    if (error) {
      setPresenze({ ...presenze });
      setErrore('Presenze non salvate. Controlla la connessione e riprova.');
    }
  }

  const cicla = (p) => {
    const v = presenze[p.allievo_id];
    segna(p.allievo_id, v !== true, p.bloccato && v !== true);
  };

  if (!persone.length) return <div className="vuoto">Nessun iscritto o prova per questa lezione.</div>;

  const presenti = Object.values(presenze).filter((v) => v === true).length;
  const nProve = persone.filter((p) => p.tipo === 'prova').length;
  const visibili = cerca.trim()
    ? persone.filter((p) => `${p.nome} ${p.cognome}`.toLowerCase().includes(cerca.trim().toLowerCase()))
    : persone;

  return (
    <>
      <p className="piccolo muto">
        {persone.length - nProve} iscritti{nProve > 0 && `, ${nProve} in prova`} · tocca una riga per segnare la presenza
      </p>
      {errore && <div className="errore" role="alert">{errore}</div>}

      {gestione && (
        <div className="filtri" style={{ marginTop: 10 }}>
          <a href="#" onClick={(e) => { e.preventDefault(); setAggiungi(true); cerca2(''); }}>Aggiungi qualcuno</a>
          <a href="#" onClick={(e) => { e.preventDefault(); messaggio(); }}>Scrivi ai prenotati</a>
          <a href="#" onClick={(e) => { e.preventDefault(); scarica(); }}>Scarica la lista</a>
        </div>
      )}

      {aggiungi && (
        <div className="scheda" style={{ marginBottom: 14 }}>
          <div className="campo" style={{ marginBottom: 8 }}>
            <label htmlFor="cerca-cand">Chi vuoi aggiungere?</label>
            <input id="cerca-cand" value={testoCerca} placeholder="Cognome o nome"
                   onChange={(e) => { setTestoCerca(e.target.value); cerca2(e.target.value); }} />
          </div>
          {candidati === null && <p className="piccolo muto">Cerco…</p>}
          {candidati?.length === 0 && <p className="piccolo muto">Nessuno da aggiungere.</p>}
          <ul className="elenco">
            {(candidati || []).map((c) => (
              <li key={c.allievo_id} className="persona">
                <span>
                  {c.cognome} {c.nome}
                  <span className="piccolo muto" style={{ display: 'block' }}>
                    {c.abbonamento}{!c.certificato_ok && ' · certificato scaduto'}
                  </span>
                </span>
                <button className="link-btn piccolo" onClick={() => aggiungiPersona(c)}>Aggiungi</button>
              </li>
            ))}
          </ul>
          <button className="link-btn piccolo" onClick={() => setAggiungi(false)}>Chiudi</button>
        </div>
      )}

      {persone.length > 10 && (
        <div className="campo" style={{ marginTop: 10 }}>
          <label htmlFor="cerca-persona">Cerca</label>
          <input id="cerca-persona" value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cognome o nome" />
        </div>
      )}

      <ul className="elenco">
        {visibili.map((p) => {
          const [etichetta, classe] = ETICHETTE[p.tipo] || [];
          const valore = presenze[p.allievo_id];
          return (
            <li key={p.allievo_id} className="persona appello-riga" onClick={() => cicla(p)}
                style={{
                  cursor: 'pointer',
                  ...(p.tipo === 'prova' ? { background: 'var(--rosso-tenue)', paddingInline: 10 }
                     : p.bloccato ? { borderLeft: '4px solid var(--rosso)', paddingInline: 10 } : {}),
                  ...(valore === true ? { boxShadow: 'inset 3px 0 0 var(--ok)' } : {}),
                  ...(valore === false ? { opacity: .55 } : {}),
                }}>
              <div>
                <span className="persona-nome">{p.cognome} {p.nome}</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  {etichetta && <span className={`tag ${classe}`}>{etichetta}</span>}
                  {etaAl(p.data_nascita) < 18 && <span className="tag tag-neutro">{etaAl(p.data_nascita)} anni</span>}
                  {p.bloccato && <span className="tag tag-rosso">Certificato scaduto</span>}
                  {p.certificato_in_scadenza && <span className="tag tag-attenzione">Certificato in scadenza</span>}
                  {p.quota_mancante && <span className="tag tag-attenzione">Quota da pagare</span>}
                  {p.origine && p.origine !== 'abbonamento' && <span className="tag tag-neutro">da {p.origine}</span>}
                  {gestione && (
                    <button className="link-btn piccolo" onClick={(e) => { e.stopPropagation(); togli(p); }}>togli</button>
                  )}
                </div>
              </div>
              <div className="presenza" role="group" aria-label={`Presenza di ${p.nome} ${p.cognome}`}
                   onClick={(e) => e.stopPropagation()}>
                <button type="button" className="si" aria-pressed={valore === true} onClick={() => segna(p.allievo_id, true, p.bloccato)}>Sì</button>
                <button type="button" className="no" aria-pressed={valore === false} onClick={() => segna(p.allievo_id, false)}>No</button>
              </div>
            </li>
          );
        })}
      </ul>

      {/* riepilogo sempre visibile mentre si scorre l'elenco */}
      <div className="barra-appello">
        <div>
          <strong>{presenti} presenti</strong>
          <span className="muto"> · {Object.values(presenze).filter((v) => v != null).length}/{persone.length} segnati</span>
          <div style={{ height: 5, borderRadius: 3, background: 'var(--linea)', marginTop: 5, overflow: 'hidden', width: 140 }}>
            <div style={{ width: `${Math.round((Object.values(presenze).filter((v) => v != null).length / persone.length) * 100)}%`,
                          height: '100%', background: 'var(--rosso)' }} />
          </div>
        </div>
        <button type="button" className="btn btn-primario" onClick={tuttiPresenti}>Tutti presenti</button>
      </div>
    </>
  );
}
