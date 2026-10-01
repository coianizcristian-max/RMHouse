'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { etaAl, ora, dataBreve } from '@/lib/formato';

const ETICHETTE = { prova: ['In prova', 'tag-rosso'], recupero: ['Recupero', 'tag-attenzione'], ingresso: ['Ingresso', 'tag-neutro'] };

const ERRORI_AVVISO = {
  gia_presente: 'È già segnato presente: togli prima la presenza.',
  lezione_finita: 'La lezione è finita: segna "No" nella presenza.',
  lezione_annullata: 'La lezione è annullata.',
  non_iscritto_a_questa_lezione: 'Non è fra gli iscritti fissi di questa lezione: per prove e recuperi usa "togli".',
  credito_gia_usato: 'Il recupero di questa lezione è già stato usato: non si può tornare indietro.',
  lezione_al_completo: 'Nel frattempo il posto è stato preso.',
};
const erroreAvviso = (e) => ERRORI_AVVISO[Object.keys(ERRORI_AVVISO).find((k) => e?.message?.includes(k))] || 'Operazione non riuscita.';

export default function Appello({ lezioneId, palestraId, persone, corsoNome = '', gestione = true, postazioni = [], avvisati = [], nuove = [], finita = false, recuperoDaSegreteria = true }) {
  const router = useRouter();
  const [presenze, setPresenze] = useState(Object.fromEntries(persone.map((p) => [p.allievo_id, p.presente])));
  // chi arriva dopo (aggiunto in appello) porta con sé la sua presenza
  useEffect(() => {
    setPresenze((attuali) => {
      const nuove = persone.filter((p) => !(p.allievo_id in attuali));
      return nuove.length ? { ...attuali, ...Object.fromEntries(nuove.map((p) => [p.allievo_id, p.presente])) } : attuali;
    });
  }, [persone]);
  const [errore, setErrore] = useState('');
  const [avviso, setAvviso] = useState('');
  const [cerca, setCerca] = useState('');
  const [aggiungi, setAggiungi] = useState(false);
  const [testoCerca, setTestoCerca] = useState('');
  const [candidati, setCandidati] = useState(null);
  const [nuova, setNuova] = useState({ nome: '', telefono: '' });
  const [invio, setInvio] = useState(false);

  // Posti numerati: tocca il posto e scegli chi ci va
  async function assegna(post) {
    const occupata = post.allievo_id;
    if (occupata) {
      if (!confirm(`Liberare ${post.nome} (ora ${post.allievo})?`)) return;
      const { error } = await supabaseBrowser().rpc('libera_postazione', {
        p_lezione: lezioneId, p_postazione: post.postazione_id,
      });
      if (error) setErrore('Operazione non riuscita.'); else router.refresh();
      return;
    }
    const liberi = persone.filter((p) => !postazioni.some((x) => x.allievo_id === p.allievo_id));
    if (liberi.length === 0) { setErrore('Tutti i presenti hanno già un posto.'); return; }
    const elenco = liberi.map((p, i) => `${i + 1}. ${p.cognome} ${p.nome}`).join('\n');
    const scelta = prompt(`Chi va su ${post.nome}?\n\n${elenco}\n\nScrivi il numero:`);
    const n = parseInt(scelta, 10);
    if (!Number.isFinite(n) || n < 1 || n > liberi.length) return;
    const { error } = await supabaseBrowser().rpc('assegna_postazione', {
      p_lezione: lezioneId, p_postazione: post.postazione_id, p_allievo: liberi[n - 1].allievo_id,
    });
    if (error) setErrore('Assegnazione non riuscita.'); else router.refresh();
  }

  async function cerca2(testo) {
    setNuova((n) => ({ ...n, nome: testo }));
    if (testo.trim().length < 2) { setCandidati(null); return; }
    const { data } = await supabaseBrowser().rpc('candidati_appello', { p_lezione: lezioneId, p_cerca: testo });
    setCandidati(data || []);
  }

  // Già registrata: entra in appello e viene segnata presente (usa il recupero se ne ha uno valido)
  async function aggiungiPersona(c) {
    setInvio(true); setErrore(''); setAvviso('');
    const { data, error } = await supabaseBrowser().rpc('aggiungi_in_appello', { p_lezione: lezioneId, p_allievo: c.allievo_id });
    setInvio(false);
    if (error) { setErrore(error.message?.includes('gia_presente') ? 'È già in questa lezione.' : 'Non aggiunta. Riprova.'); return; }
    const come = data === 'recupero' ? 'come recupero' : data === 'iscritto' ? 'di nuovo (aveva disdetto)' : 'come ingresso';
    const problemi = [c.abbonamento === 'nessun abbonamento' && 'senza abbonamento', !c.certificato_ok && 'certificato non valido'].filter(Boolean);
    setAvviso(`${c.nome} ${c.cognome} aggiunta ${come} e segnata presente.${problemi.length ? ` Attenzione: ${problemi.join(' e ')}.` : ''}`);
    setAggiungi(false); setTestoCerca(''); setCandidati(null);
    router.refresh();
  }

  // Non registrata: la segreteria la trova in "Da fare oggi"
  async function segnalaNuova() {
    if (nuova.nome.trim().length < 3) { setErrore('Scrivi nome e cognome.'); return; }
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().rpc('segnala_nuovo_in_appello', {
      p_lezione: lezioneId, p_nome: nuova.nome.trim(), p_telefono: nuova.telefono.trim() || null,
    });
    setInvio(false);
    if (error) { setErrore('Segnalazione non riuscita. Riprova.'); return; }
    setAvviso(`Segnalata alla segreteria: ${nuova.nome.trim()} è nuova e va registrata.`);
    setAggiungi(false); setTestoCerca(''); setCandidati(null); setNuova({ nome: '', telefono: '' });
    router.refresh();
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

  // "Ha avvisato": esce dall'appello, il posto si libera, nasce il recupero se l'abbonamento lo prevede
  async function haAvvisato(p) {
    if (!confirm(recuperoDaSegreteria
      ? `${p.nome} ${p.cognome} ha avvisato che non viene?\nEsce da questo appello, il posto si libera e riceve il recupero (se l'abbonamento lo prevede).`
      : `${p.nome} ${p.cognome} ha avvisato che non viene?\nEsce da questo appello e il posto si libera, ma SENZA recupero: il recupero spetta solo a chi disdice da solo dall'app.`)) return;
    setErrore(''); setAvviso('');
    const { data, error } = await supabaseBrowser().rpc('disdici_lezione', { p_lezione: lezioneId, p_allievo: p.allievo_id });
    if (error) { setErrore(erroreAvviso(error)); return; }
    setAvviso(data?.credito
      ? `${p.nome} ${p.cognome}: segnato, recupero da usare entro il ${dataBreve(data.scadenza)}.`
      : recuperoDaSegreteria
        ? `${p.nome} ${p.cognome}: segnato. Il suo abbonamento non prevede recuperi.`
        : `${p.nome} ${p.cognome}: segnato, il posto è libero. Nessun recupero (solo da app).`);
    router.refresh();
  }

  async function ripristina(a) {
    if (!confirm(`Rimettere ${a.allievi?.nome} ${a.allievi?.cognome} in appello? Il recupero dato per questa lezione viene tolto.`)) return;
    setErrore(''); setAvviso('');
    const { error } = await supabaseBrowser().rpc('ripristina_lezione', { p_lezione: lezioneId, p_allievo: a.allievo_id });
    if (error) { setErrore(erroreAvviso(error)); return; }
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

  const sezioneNuove = nuove.length > 0 && (
    <>
      <h2 className="sezione">Nuove, da registrare <span className="piccolo muto">· {nuove.length}</span></h2>
      <ul className="elenco">
        {nuove.map((n) => (
          <li key={n.id} className="persona">
            <span>{n.testo.replace(/^Nuova persona in appello da registrare: /, '').replace(/ — .*$/, '')}</span>
            <span className={`tag ${n.fatto ? 'tag-ok' : 'tag-attenzione'}`}>{n.fatto ? 'registrata' : 'in segreteria'}</span>
          </li>
        ))}
      </ul>
    </>
  );

  const sezioneAvvisati = avvisati.length > 0 && (
    <>
      <h2 className="sezione">Hanno avvisato <span className="piccolo muto">· {avvisati.length}</span></h2>
      <ul className="elenco avvisati">
        {avvisati.map((a) => (
          <li key={a.allievo_id} className="persona">
            <span>
              <span className="persona-nome">{a.allievi?.cognome} {a.allievi?.nome}</span>
              <span className="piccolo muto" style={{ display: 'block' }}>
                {a.da === 'cliente' ? 'ha disdetto dall\'area clienti' : 'segnato dalla segreteria'} il {dataBreve(a.created_at)} alle {ora(a.created_at)}
              </span>
            </span>
            <span className="avvisato-destra">
              <span className={`tag ${a.credito_id ? 'tag-ok' : 'tag-neutro'}`}>{a.credito_id ? 'recupero dato' : 'senza recupero'}</span>
              {gestione && !finita && <button className="link-btn piccolo" onClick={() => ripristina(a)}>rimetti</button>}
            </span>
          </li>
        ))}
      </ul>
    </>
  );


  const vuota = persone.length === 0;
  const presenti = Object.values(presenze).filter((v) => v === true).length;
  const nProve = persone.filter((p) => p.tipo === 'prova').length;
  const visibili = cerca.trim()
    ? persone.filter((p) => `${p.nome} ${p.cognome}`.toLowerCase().includes(cerca.trim().toLowerCase()))
    : persone;

  return (
    <>
      {vuota ? <div className="vuoto">Nessun iscritto o prova per questa lezione.</div> : <p className="piccolo muto">
        {persone.length - nProve} iscritti{nProve > 0 && `, ${nProve} in prova`} · tocca una riga per segnare la presenza
      </p>}
      {errore && <div className="errore" role="alert">{errore}</div>}
      {avviso && <div className="avviso-ok" role="status">{avviso}</div>}

      {postazioni.length > 0 && (
        <>
          <h2 className="sezione">Posti in sala</h2>
          <div className="posti">
            {postazioni.map((p) => (
              <button key={p.postazione_id} type="button"
                      className={p.allievo_id ? 'posto occupato' : 'posto'}
                      onClick={() => assegna(p)}>
                <span className="etichetta-posto">{p.nome}</span>
                <span className="chi">{p.allievo || 'libero'}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="azioni-riga" style={{ marginBottom: 10 }}>
        <button className="link-btn" aria-pressed={aggiungi} onClick={() => { setAggiungi(!aggiungi); setCandidati(null); setTestoCerca(''); }}>+ Aggiungi una persona</button>
        {gestione && <button className="link-btn" onClick={messaggio}>Scrivi ai prenotati</button>}
        {gestione && <button className="link-btn" onClick={scarica}>Scarica la lista</button>}
      </div>

      {aggiungi && (
        <div className="scheda aggiungi-appello">
          <div className="campo" style={{ marginBottom: 8 }}>
            <label htmlFor="cerca-cand">Chi c'è in più?</label>
            <input id="cerca-cand" value={testoCerca} placeholder="Cognome e nome" autoFocus autoComplete="off"
                   onChange={(e) => { setTestoCerca(e.target.value); cerca2(e.target.value); }} />
          </div>
          {candidati === null && <p className="piccolo muto">Scrivi almeno due lettere.</p>}
          {candidati?.length > 0 && (
            <ul className="elenco">
              {candidati.map((c) => {
                const guai = c.abbonamento === 'nessun abbonamento' || !c.certificato_ok;
                return (
                  <li key={c.allievo_id} className="persona">
                    <span>
                      <span className={`persona-nome${guai ? ' nome-rosso' : ''}`}>{c.cognome} {c.nome}</span>
                      <span className="piccolo muto" style={{ display: 'block' }}>
                        {c.abbonamento}{!c.certificato_ok && ' · certificato non valido'}{c.recupero && ' · ha un recupero'}
                      </span>
                    </span>
                    <button className="btn btn-piccolo btn-primario" disabled={invio} onClick={() => aggiungiPersona(c)}>Aggiungi</button>
                  </li>
                );
              })}
            </ul>
          )}
          {candidati !== null && testoCerca.trim().length >= 3 && (
            <div className="nuova-appello">
              <strong>{candidati.length ? 'Non è nessuno di questi?' : 'Non la trovo: è una persona nuova'}</strong>
              <div className="nuova-campi">
                <input value={nuova.nome} onChange={(e) => setNuova({ ...nuova, nome: e.target.value })} placeholder="Nome e cognome" aria-label="Nome e cognome" />
                <input value={nuova.telefono} onChange={(e) => setNuova({ ...nuova, telefono: e.target.value })} placeholder="Telefono (se c'è)" inputMode="tel" aria-label="Telefono" />
                <button className="btn btn-piccolo" disabled={invio} onClick={segnalaNuova}>Segnala alla segreteria</button>
              </div>
            </div>
          )}
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
                <span className={`persona-nome${p.bloccato || p.quota_mancante ? ' nome-rosso' : ''}`}>{p.cognome} {p.nome}</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  {etichetta && <span className={`tag ${classe}`}>{etichetta}</span>}
                  {p.data_nascita && etaAl(p.data_nascita) < 18 && <span className="tag tag-neutro">{etaAl(p.data_nascita)} anni</span>}
                  {p.bloccato && <span className="tag tag-rosso">Certificato scaduto</span>}
                  {p.certificato_in_scadenza && <span className="tag tag-attenzione">Certificato in scadenza</span>}
                  {p.quota_mancante && <span className="tag tag-attenzione">Quota da pagare</span>}
                  {p.origine && p.origine !== 'abbonamento' && <span className="tag tag-neutro">da {p.origine}</span>}
                  {gestione && p.tipo === 'iscritto' && !finita && valore !== true && (
                    <button className="link-btn piccolo" onClick={(e) => { e.stopPropagation(); haAvvisato(p); }}>ha avvisato</button>
                  )}
                  {gestione && p.tipo !== 'iscritto' && (
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

      {sezioneNuove}
      {sezioneAvvisati}

      {/* riepilogo sempre visibile mentre si scorre l'elenco */}
      {!vuota && <div className="barra-appello">
        <div>
          <strong>{presenti} presenti</strong>
          <span className="muto"> · {Object.values(presenze).filter((v) => v != null).length}/{persone.length} segnati</span>
          <div style={{ height: 5, borderRadius: 3, background: 'var(--linea)', marginTop: 5, overflow: 'hidden', width: 140 }}>
            <div style={{ width: `${Math.round((Object.values(presenze).filter((v) => v != null).length / persone.length) * 100)}%`,
                          height: '100%', background: 'var(--rosso)' }} />
          </div>
        </div>
        <button type="button" className="btn btn-primario" onClick={tuttiPresenti}>Tutti presenti</button>
      </div>}
    </>
  );
}
