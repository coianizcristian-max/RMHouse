'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
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
  const [f, setF] = useState({ sala_id: '', titolo: '', data: giorno, ora: '18:00', durata: 2, tipo: 'interno', contatto: '', telefono: '', email: '', prezzo: '' });

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
    if (!f.sala_id || !f.titolo) { setErrore('Servono sala e titolo.'); return; }
    const inizio = new Date(`${f.data}T${f.ora}:00`);
    const fine = new Date(inizio.getTime() + f.durata * 3600000);
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().from('prenotazioni_spazi').insert({
      palestra_id: palestraId, sala_id: f.sala_id, tipo: f.tipo, titolo: f.titolo,
      contatto_nome: f.contatto || 'Interno', email: f.email || null, telefono: f.telefono || null,
      inizio: inizio.toISOString(), fine: fine.toISOString(), stato: 'confermata',
      prezzo_cent: f.prezzo ? Math.round(parseFloat(f.prezzo.replace(',', '.')) * 100) : 0,
    });
    setInvio(false);
    if (error) { setErrore('Non salvata: controlla che la sala sia libera in quella fascia.'); return; }
    setNuova(false); router.refresh();
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
      <h1>Spazi</h1>
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
            <h1 style={{ fontSize: 18 }}>{new Date(giorno + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}</h1>
            <Link className="btn" href={`/gestione/spazi?giorno=${spostaGiorni(giorno, 1)}`} aria-label="Giorno successivo">›</Link>
          </div>
          {giorno !== oggiISO() && <p><Link className="piccolo" href={`/gestione/spazi?giorno=${oggiISO()}`}>Torna a oggi</Link></p>}

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
              <h2>Blocca una sala</h2>
              <div className="campo">
                <label htmlFor="s">Sala</label>
                <select id="s" value={f.sala_id} onChange={(e) => setF({ ...f, sala_id: e.target.value })}>
                  <option value="">— scegli —</option>
                  {sale.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                </select>
              </div>
              <div className="campo">
                <label htmlFor="ti">Titolo</label>
                <input id="ti" value={f.titolo} onChange={(e) => setF({ ...f, titolo: e.target.value })}
                       placeholder="Saggio, prove, manutenzione…" />
              </div>
              <div className="riga-2">
                <div className="campo"><label htmlFor="d">Giorno</label>
                  <input id="d" type="date" value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /></div>
                <div className="campo"><label htmlFor="o">Dalle</label>
                  <input id="o" type="time" value={f.ora} onChange={(e) => setF({ ...f, ora: e.target.value })} /></div>
              </div>
              <div className="riga-2">
                <div className="campo"><label htmlFor="du">Ore</label>
                  <input id="du" type="number" step="0.5" min="0.5" value={f.durata} onChange={(e) => setF({ ...f, durata: Number(e.target.value) })} /></div>
                <div className="campo"><label htmlFor="tp">Tipo</label>
                  <select id="tp" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
                    <option value="interno">Uso interno</option>
                    <option value="noleggio">Affitto a terzi</option>
                    <option value="evento">Evento o festa</option>
                  </select></div>
              </div>
              <div className="riga-2">
                <div className="campo"><label htmlFor="c">Contatto</label>
                  <input id="c" value={f.contatto} onChange={(e) => setF({ ...f, contatto: e.target.value })} /></div>
                <div className="campo"><label htmlFor="pz">Prezzo (€)</label>
                  <input id="pz" inputMode="decimal" value={f.prezzo} onChange={(e) => setF({ ...f, prezzo: e.target.value })} /></div>
              </div>
              <div className="azioni">
                <button className="btn btn-primario" disabled={invio}>Blocca la sala</button>
                <button type="button" className="btn" onClick={() => setNuova(false)}>Annulla</button>
              </div>
            </form>
          ) : (
            <button className="btn btn-primario" style={{ marginTop: 12 }} onClick={() => setNuova(true)}>Blocca una sala</button>
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
