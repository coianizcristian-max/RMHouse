'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import CalendarioScelta from './CalendarioScelta';
import { euro, ora, dataBreve, giornoLungo, spostaGiorni, oggiISO } from '@/lib/formato';

const MINUTI = (iso) => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes(); };
const ERRORI = {
  sala_occupata: 'Non posso confermare: in quella fascia la sala è già occupata.',
  non_autorizzato: 'Non hai i permessi per questa operazione.',
};

export default function Spazi({ palestraId, giorno, richieste, prossime, agenda, sale, pacchetti, numeri }) {
  const router = useRouter();
  const [sezione, setSezione] = useState(richieste.length ? 'richieste' : 'agenda');
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const [nuova, setNuova] = useState(false);
  const [f, setF] = useState({
    sala_id: '', titolo: '', data: giorno, ora: '18:00', fine_ora: '20:00', tipo: 'noleggio',
    contatto: '', telefono: '', email: '', ospiti: '', prezzo: '', incassato: '', metodo: 'contanti', note: '',
  });
  const [verifica, setVerifica] = useState(null);      // null = non ancora controllato
  const [controllo, setControllo] = useState(false);

  const quando = (data, orario) => new Date(`${data}T${orario}:00`);

  // Controlla la fascia e calcola il prezzo dal listino, mentre si compila
  async function controlla(dati = f) {
    if (!dati.sala_id || !dati.data || !dati.ora || !dati.fine_ora) { setVerifica(null); return; }
    setControllo(true);
    const { data, error } = await supabaseBrowser().rpc('verifica_spazio', {
      p_palestra: palestraId, p_sala: dati.sala_id,
      p_inizio: quando(dati.data, dati.ora).toISOString(),
      p_fine: quando(dati.data, dati.fine_ora).toISOString(),
      p_escludi: null,
    });
    setControllo(false);
    if (error) { setVerifica(null); return; }
    setVerifica(data);
    // se il prezzo non è stato scritto a mano, si propone quello del listino
    if (data?.prezzo_cent != null && !dati.prezzo) {
      setF((v) => ({ ...v, prezzo: (data.prezzo_cent / 100).toString() }));
    }
  }

  function cambia(k, v) {
    const dati = { ...f, [k]: v };
    setF(dati);
    if (['sala_id', 'data', 'ora', 'fine_ora'].includes(k)) controlla(dati);
  }

  async function decidi(p, stato, chiediMotivo) {
    let motivo = null;
    if (chiediMotivo) {
      motivo = prompt('Motivo (lo vede il cliente nell\'email):', 'In quella fascia la sala è già impegnata.');
      if (motivo === null) return;
    }
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().rpc('conferma_spazio', {
      p_prenotazione: p.id, p_stato: stato, p_motivo: motivo,
    });
    setInvio(false);
    if (error) {
      const k = Object.keys(ERRORI).find((x) => error.message?.includes(x));
      setErrore(ERRORI[k] || 'Operazione non riuscita.');
      return;
    }
    router.refresh();
  }

  async function creaPrenotazione(e) {
    e.preventDefault();
    if (!f.sala_id || !f.titolo) { setErrore('Servono la sala e un titolo.'); return; }
    const inizio = quando(f.data, f.ora);
    const fine = quando(f.data, f.fine_ora);
    if (fine <= inizio) { setErrore("L'ora di fine deve venire dopo quella di inizio."); return; }

    setInvio(true); setErrore('');
    const soldi = (v) => (v ? Math.round(parseFloat(String(v).replace(',', '.')) * 100) : 0);
    const { error } = await supabaseBrowser().rpc('crea_prenotazione_spazio', {
      p: {
        palestra_id: palestraId, sala_id: f.sala_id, tipo: f.tipo, titolo: f.titolo,
        contatto_nome: f.contatto || null, email: f.email || null, telefono: f.telefono || null,
        ospiti: f.ospiti || null, note: f.note || null,
        inizio: inizio.toISOString(), fine: fine.toISOString(),
        prezzo_cent: f.prezzo === '' ? null : soldi(f.prezzo),
        incassato_cent: soldi(f.incassato), metodo: f.metodo,
        stato: 'confermata',
      },
    });
    setInvio(false);
    if (error) {
      setErrore(error.message?.includes('sala_occupata')
        ? 'In quella fascia la sala è già occupata: guarda il calendario qui sotto.'
        : 'Salvataggio non riuscito.');
      return;
    }
    // resta sul giorno appena prenotato, così la si vede comparire
    setNuova(false); setVerifica(null);
    if (f.data !== giorno) router.push(`/gestione/spazi?giorno=${f.data}`);
    else router.refresh();
  }

  async function incassa(p) {
    const v = prompt('Quanto hai incassato finora? (€)', (p.incassato_cent / 100).toString());
    if (v === null) return;
    const { error } = await supabaseBrowser().from('prenotazioni_spazi')
      .update({ incassato_cent: Math.round(parseFloat(v.replace(',', '.') || '0') * 100) }).eq('id', p.id);
    if (error) { setErrore('Aggiornamento non riuscito.'); return; }
    router.refresh();
  }

  // agenda del giorno: una colonna per sala
  const conOrario = agenda.filter((a) => a.sala_id);
  const dalle = conOrario.length ? Math.floor(Math.min(...conOrario.map((a) => MINUTI(a.inizio))) / 60) * 60 : 480;
  const alle = conOrario.length ? Math.ceil(Math.max(...conOrario.map((a) => MINUTI(a.fine))) / 60) * 60 : 1380;
  const px = 1.1;
  const altezza = (alle - dalle) * px;

  const stile = (a) => {
    if (a.tipo === 'lezione') return { background: 'var(--carta)', color: 'var(--testo-2)', border: '1px solid var(--linea)' };
    if (a.tipo === 'evento') return { background: 'var(--nero)', color: '#fff', border: '1px solid var(--nero)' };
    if (a.stato === 'opzione') return { background: 'var(--attenzione-tenue)', color: 'var(--attenzione)', border: '1px dashed var(--attenzione)' };
    return { background: 'var(--rosso)', color: '#fff', border: '1px solid var(--rosso)' };
  };

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Calendari</div>
        <h1>Sale e affitti</h1>
        <p>Chi usa le sale, quando, e quanto rende. Prenoti tu al banco o arriva dal sito.</p>
      </div>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', marginBottom: 14 }}>
        <div className="scheda"><div className="piccolo muto">Da rispondere</div>
          <div style={{ fontSize: 24, fontWeight: 850, color: numeri.da_rispondere > 0 ? 'var(--rosso)' : 'var(--nero)' }}>{numeri.da_rispondere ?? 0}</div></div>
        <div className="scheda"><div className="piccolo muto">Confermate (mese)</div>
          <div style={{ fontSize: 24, fontWeight: 850 }}>{numeri.confermate ?? 0}</div></div>
        <div className="scheda"><div className="piccolo muto">Ore affittate</div>
          <div style={{ fontSize: 24, fontWeight: 850 }}>{numeri.ore ?? 0}</div></div>
        <div className="scheda"><div className="piccolo muto">Ricavi del mese</div>
          <div style={{ fontSize: 24, fontWeight: 850 }}>{euro(numeri.ricavi_cent || 0)}</div></div>
      </div>

      {errore && <div className="errore" role="alert">{errore}</div>}

      <div className="filtri">
        {[['richieste', `Richieste${richieste.length ? ` (${richieste.length})` : ''}`],
          ['agenda', 'Agenda sale'], ['prossime', 'Prenotate']].map(([k, l]) => (
          <a key={k} href="#" onClick={(e) => { e.preventDefault(); setSezione(k); }}
             aria-current={sezione === k ? 'true' : undefined}>{l}</a>
        ))}
        <Link href="/gestione/spazi/listino">Listino e pacchetti</Link>
      </div>

      {/* ---------- Richieste da confermare ---------- */}
      {sezione === 'richieste' && (
        richieste.length === 0 ? <div className="vuoto">Nessuna richiesta in attesa.</div> : (
          <ul className="elenco">
            {richieste.map((p) => (
              <li key={p.id} style={{ padding: '14px 4px' }}>
                <div className="persona" style={{ padding: 0, alignItems: 'start' }}>
                  <div>
                    <span className="persona-nome">{p.titolo}</span>
                    <div className="piccolo muto" style={{ textTransform: 'capitalize' }}>
                      {giornoLungo(p.inizio)}, {ora(p.inizio)}–{ora(p.fine)} · {p.sale?.nome}
                      {p.ospiti ? ` · ${p.ospiti} invitati` : ''}
                    </div>
                    <div className="piccolo muto">
                      {p.contatto_nome} · <a href={`tel:${p.telefono}`}>{p.telefono}</a> · <a href={`mailto:${p.email}`}>{p.email}</a>
                    </div>
                    {p.note && <div className="piccolo" style={{ marginTop: 4 }}>“{p.note}”</div>}
                  </div>
                  <span className="tag tag-tenue">{euro(p.prezzo_cent)}</span>
                </div>
                <div className="azioni" style={{ marginTop: 10 }}>
                  <button className="btn btn-primario" disabled={invio} onClick={() => decidi(p, 'confermata')}>Conferma</button>
                  <button className="btn" disabled={invio} onClick={() => decidi(p, 'opzione')}>Tieni in opzione</button>
                  <button className="btn" disabled={invio} onClick={() => decidi(p, 'annullata', true)}>Rifiuta</button>
                </div>
              </li>
            ))}
          </ul>
        )
      )}

      {/* ---------- Agenda delle sale ---------- */}
      {sezione === 'agenda' && (
        <>
          <div className="giorno-nav">
            <Link className="btn" href={`/gestione/spazi?giorno=${spostaGiorni(giorno, -1)}`} aria-label="Giorno precedente">‹</Link>
            <h2 style={{ fontSize: 17, margin: 0, textTransform: 'capitalize' }}>{giornoLungo(giorno + 'T12:00:00')}</h2>
            <Link className="btn" href={`/gestione/spazi?giorno=${spostaGiorni(giorno, 1)}`} aria-label="Giorno successivo">›</Link>
          </div>
          {giorno !== oggiISO() && <p className="piccolo" style={{ marginTop: -4 }}><Link href={`/gestione/spazi?giorno=${oggiISO()}`}>Torna a oggi</Link></p>}

          <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: `42px repeat(${Math.max(sale.length, 1)}, minmax(120px, 1fr))`, minWidth: 320 }}>
              <div />
              {sale.map((s) => (
                <div key={s.id} style={{ textAlign: 'center', padding: '6px 2px', fontWeight: 700, fontSize: 13, borderBottom: '1px solid var(--linea)' }}>
                  {s.nome}
                </div>
              ))}
              <div style={{ position: 'relative', height: altezza }}>
                {Array.from({ length: (alle - dalle) / 60 + 1 }, (_, i) => (
                  <div key={i} className="piccolo muto" style={{ position: 'absolute', top: i * 60 * px - 6, fontSize: 11 }}>
                    {String(dalle / 60 + i).padStart(2, '0')}:00
                  </div>
                ))}
              </div>
              {sale.map((s) => (
                <div key={s.id} style={{ position: 'relative', height: altezza, borderLeft: '1px solid var(--linea)' }}>
                  {Array.from({ length: (alle - dalle) / 60 + 1 }, (_, i) => (
                    <div key={i} style={{ position: 'absolute', top: i * 60 * px, left: 0, right: 0, borderTop: '1px solid var(--linea)', opacity: .6 }} />
                  ))}
                  {agenda.filter((a) => a.sala_id === s.id).map((a) => (
                    <div key={a.id + a.tipo} style={{
                      position: 'absolute', top: (MINUTI(a.inizio) - dalle) * px, left: 2, right: 2,
                      height: Math.max((MINUTI(a.fine) - MINUTI(a.inizio)) * px - 2, 30),
                      borderRadius: 6, padding: '4px 6px', fontSize: 11, lineHeight: 1.2, overflow: 'hidden', ...stile(a),
                    }}>
                      <strong style={{ display: 'block' }}>{ora(a.inizio)}–{ora(a.fine)}</strong>
                      {a.titolo}
                      {a.contatto && <div style={{ opacity: .85 }}>{a.contatto}</div>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <p className="piccolo muto">
            Grigio: lezioni dei corsi. Rosso: sala affittata. Nero: evento o festa. Tratteggiato: opzione non ancora confermata.
          </p>

          {nuova ? (
            <form onSubmit={creaPrenotazione} style={{ marginTop: 16 }}>
              <h3>Nuova prenotazione</h3>

              <div className="campo">
                <label htmlFor="s">Sala</label>
                <select id="s" value={f.sala_id} onChange={(e) => cambia('sala_id', e.target.value)}>
                  <option value="">— scegli —</option>
                  {sale.map((s) => <option key={s.id} value={s.id}>{s.nome}{s.capienza ? ` (${s.capienza} posti)` : ''}</option>)}
                </select>
              </div>
              <div className="campo">
                <label htmlFor="tp">Tipo</label>
                <select id="tp" value={f.tipo} onChange={(e) => cambia('tipo', e.target.value)}>
                  <option value="noleggio">Affitto a terzi</option>
                  <option value="evento">Evento o festa</option>
                  <option value="interno">Uso interno (prove, manutenzione)</option>
                </select>
              </div>

              <div className="campo">
                <label htmlFor="d">Giorno</label>
                <input id="d" type="date" value={f.data} onChange={(e) => cambia('data', e.target.value)} />
                <span className="piccolo muto">
                  <a href="#" onClick={(ev) => { ev.preventDefault(); router.push(`/gestione/spazi?giorno=${f.data}`); }}>
                    Guarda il calendario di questo giorno
                  </a>
                </span>
              </div>
              <div className="riga-2">
                <div className="campo"><label htmlFor="o">Dalle</label>
                  <input id="o" type="time" value={f.ora} onChange={(e) => cambia('ora', e.target.value)} /></div>
                <div className="campo"><label htmlFor="of">Alle</label>
                  <input id="of" type="time" value={f.fine_ora} onChange={(e) => cambia('fine_ora', e.target.value)} /></div>
              </div>

              <CalendarioScelta
                palestraId={palestraId} sale={sale} data={f.data} salaId={f.sala_id}
                dalle={f.ora} alle={f.fine_ora}
                onScegli={({ sala_id, ora: o, fine_ora: fo }) => {
                  const dati = { ...f, sala_id, ora: o, fine_ora: fo };
                  setF(dati); controlla(dati);
                }} />

              {/* esito della verifica, mentre si compila */}
              {controllo && <p className="piccolo muto">Controllo la disponibilità…</p>}
              {!controllo && verifica && (
                verifica.ok ? (
                  <div className="errore" style={{ background: 'var(--ok-tenue)', color: 'var(--ok)' }}>
                    Sala libera in quella fascia
                    {verifica.prezzo_cent != null && ` · da listino ${euro(verifica.prezzo_cent)}`}
                  </div>
                ) : (
                  <div className="errore">
                    <strong>Occupata:</strong>{' '}
                    {(verifica.conflitti || []).map((c, i) => (
                      <span key={i}>{i > 0 && ' · '}{c.dalle}–{c.alle} {c.titolo} ({c.tipo})</span>
                    ))}
                    {(verifica.conflitti || []).length === 0 && (verifica.motivo || 'controlla gli orari')}
                  </div>
                )
              )}

              <div className="campo">
                <label htmlFor="ti">Titolo</label>
                <input id="ti" value={f.titolo} onChange={(e) => cambia('titolo', e.target.value)}
                       placeholder="Es. Corso salsa esterno, Festa Bianchi, Prove saggio" />
              </div>
              <div className="riga-2">
                <div className="campo"><label htmlFor="c">Chi</label>
                  <input id="c" value={f.contatto} onChange={(e) => cambia('contatto', e.target.value)}
                         placeholder="Nome del referente" /></div>
                <div className="campo"><label htmlFor="te">Telefono</label>
                  <input id="te" type="tel" value={f.telefono} onChange={(e) => cambia('telefono', e.target.value)} /></div>
              </div>
              <div className="riga-2">
                <div className="campo"><label htmlFor="em">Email</label>
                  <input id="em" type="email" value={f.email} onChange={(e) => cambia('email', e.target.value)} />
                  <span className="piccolo muto">Facoltativa: da qui non parte nessuna email.</span></div>
                <div className="campo"><label htmlFor="os">Invitati</label>
                  <input id="os" type="number" min="1" value={f.ospiti} onChange={(e) => cambia('ospiti', e.target.value)} /></div>
              </div>

              <div className="riga-2">
                <div className="campo"><label htmlFor="pz">Prezzo (€)</label>
                  <input id="pz" inputMode="decimal" value={f.prezzo} onChange={(e) => cambia('prezzo', e.target.value)} />
                  <span className="piccolo muto">Proposto dal listino, si può correggere.</span></div>
                <div className="campo"><label htmlFor="in">Incassato ora (€)</label>
                  <input id="in" inputMode="decimal" value={f.incassato} onChange={(e) => cambia('incassato', e.target.value)} />
                  <span className="piccolo muto">Finisce anche in Conti → Incassi.</span></div>
              </div>
              <div className="campo">
                <label htmlFor="me">Metodo</label>
                <select id="me" value={f.metodo} onChange={(e) => cambia('metodo', e.target.value)}>
                  <option value="contanti">Contanti</option>
                  <option value="bonifico">Bonifico</option>
                  <option value="pos">POS</option>
                  <option value="altro">Altro</option>
                </select>
              </div>
              <div className="campo"><label htmlFor="no">Note</label>
                <textarea id="no" value={f.note} onChange={(e) => cambia('note', e.target.value)} /></div>

              <div className="azioni">
                <button className="btn btn-primario" disabled={invio || (verifica && !verifica.ok)}>
                  {invio ? 'Salvo…' : 'Salva la prenotazione'}
                </button>
                <button type="button" className="btn" onClick={() => { setNuova(false); setVerifica(null); }}>Annulla</button>
              </div>
            </form>
          ) : (
            <button className="btn btn-primario" style={{ marginTop: 12 }}
                    onClick={() => { setNuova(true); controlla(); }}>Nuova prenotazione</button>
          )}
        </>
      )}

      {/* ---------- Prenotazioni confermate ---------- */}
      {sezione === 'prossime' && (
        prossime.length === 0 ? <div className="vuoto">Nessuna prenotazione in arrivo.</div> : (
          <ul className="elenco">
            {prossime.map((p) => (
              <li key={p.id} style={{ padding: '12px 4px' }}>
                <div className="persona" style={{ padding: 0, alignItems: 'start' }}>
                  <div>
                    <span className="persona-nome">{p.titolo}</span>
                    <div className="piccolo muto">
                      {dataBreve(p.inizio)} {ora(p.inizio)}–{ora(p.fine)} · {p.sale?.nome} · {p.contatto_nome}
                    </div>
                    <div className="piccolo muto">
                      {euro(p.prezzo_cent)}
                      {p.acconto_cent > 0 && ` · acconto ${euro(p.acconto_cent)}`}
                      {` · incassato ${euro(p.incassato_cent)}`}
                    </div>
                  </div>
                  <span className={`tag ${p.stato === 'confermata' ? 'tag-ok' : 'tag-attenzione'}`}>{p.stato}</span>
                </div>
                <div style={{ display: 'flex', gap: 14, marginTop: 6 }}>
                  <button className="link-btn piccolo" onClick={() => incassa(p)}>Registra incasso</button>
                  {p.stato === 'opzione' && <button className="link-btn piccolo" onClick={() => decidi(p, 'confermata')}>Conferma</button>}
                  <button className="link-btn piccolo" onClick={() => decidi(p, 'annullata', true)}>Annulla</button>
                </div>
              </li>
            ))}
          </ul>
        )
      )}
    </>
  );
}
