'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { euro } from '@/lib/formato';
import { quandoSpettacolo, oraSpettacolo, totaleBiglietti } from '@/lib/biglietteria';

const OFFERTE = [0, 500, 1000, 2000];
const dataBreve = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('it-IT', { day: 'numeric', month: 'numeric' }) : '');
const normale = (x) => `${x.nome} ${x.cognome}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]+/g, ' ').trim();

function Contatore({ id, valore, min = 0, max, onChange }) {
  return (
    <div className="bg-contatore">
      <button type="button" aria-label="Meno" disabled={valore <= min} onClick={() => onChange(Math.max(min, valore - 1))}>−</button>
      <output id={id} aria-live="polite">{valore}</output>
      <button type="button" aria-label="Più" disabled={max != null && valore >= max} onClick={() => onChange(max != null ? Math.min(max, valore + 1) : valore + 1)}>+</button>
    </div>
  );
}

const prezzoSpettacolo = (s) => {
  const parti = [];
  if (s.contributo_cent) parti.push(`contributo ${euro(s.contributo_cent)}${s.contributo_per_posto ? ' a persona' : ''}`);
  else parti.push('ingresso libero');
  if (s.pizza_aperta) parti.push(`pizza ${euro(s.pizza_cent)}${s.pizza_entro ? ` (entro il ${dataBreve(s.pizza_entro)})` : ''}`);
  return parti.join(' · ');
};

// ------------------------------------------------------------------ un evento scelto: allievo, posti, extra, nominativi
// Resta montato anche quando lo si toglie (solo nascosto): riscegliendolo, i dati inseriti ci sono ancora.
function SceltaEvento({ s, visibile, dati, onChange }) {
  const [gruppi, setGruppi] = useState(null);
  const [gruppo, setGruppo] = useState('');
  const [elenco, setElenco] = useState(null);
  const [allievoId, setAllievoId] = useState('');
  const [nascita, setNascita] = useState('');
  const [allievo, setAllievo] = useState(null);
  const [verifica, setVerifica] = useState({ invio: false, errore: '' });
  const [posti, setPosti] = useState(1);
  const [pizze, setPizze] = useState(0);
  const [offerta, setOfferta] = useState(0);
  const [altra, setAltra] = useState('');
  const [persone, setPersone] = useState([{ nome: '', cognome: '' }]);
  const ultimo = useRef('');

  useEffect(() => {
    if (!s.con_allievi) return;
    fetch(`/api/biglietteria/elenco?s=${s.id}`).then((r) => (r.ok ? r.json() : [])).then(setGruppi).catch(() => setGruppi([]));
  }, [s.id, s.con_allievi]);
  useEffect(() => {
    setElenco(null); setAllievoId(''); setAllievo(null); setNascita(''); setVerifica({ invio: false, errore: '' });
    if (!s.con_allievi || !gruppo) return;
    const chiave = `${s.id}|${gruppo}`; ultimo.current = chiave;
    fetch(`/api/biglietteria/elenco?s=${s.id}&g=${encodeURIComponent(gruppo)}`).then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (ultimo.current === chiave) setElenco(d); }).catch(() => setElenco([]));
  }, [gruppo]); // eslint-disable-line react-hooks/exhaustive-deps

  const chiedi = s.chiedi_nascita !== false;
  async function conferma(id = allievoId) {
    if (!id || (chiedi && !/^\d{4}-\d{2}-\d{2}$/.test(nascita))) { setVerifica({ invio: false, errore: 'Scegli l\'allievo/a e scrivi la sua data di nascita.' }); return; }
    setVerifica({ invio: true, errore: '' });
    const r = await fetch('/api/biglietteria/verifica', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allievo_id: id, nascita: chiedi ? nascita : null }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok || !d.ok) {
      const scelto = (elenco || []).find((a) => a.id === id);
      const doppio = scelto && /\(\d+\)$/.test(scelto.cognome || '');
      setVerifica({ invio: false, errore: (d.errore || 'Controllo non riuscito. Riprova.') + (doppio && r?.status === 409 ? ' Nel gruppo ci sono due allievi con lo stesso nome: prova a scegliere l\'altro.' : '') });
      return;
    }
    setVerifica({ invio: false, errore: '' }); setAllievo({ id, ...d }); setPosti(1);
  }

  const maxPosti = useMemo(() => {
    let m = s.max_per_prenotazione || 10;
    if (s.limite_allievo) m = Math.min(m, allievo?.rimasti ?? 0);
    if (s.posti_liberi != null) m = Math.min(m, s.posti_liberi);
    return m;
  }, [s, allievo]);
  useEffect(() => { if (posti > Math.max(maxPosti, 1)) setPosti(Math.max(maxPosti, 1)); }, [maxPosti]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPersone((v) => Array.from({ length: posti }, (_, k) => v[k] || { nome: '', cognome: '' })); }, [posti]);
  const setPersona = (k, campo) => (e) => setPersone((v) => v.map((x, i) => (i === k ? { ...x, [campo]: e.target.value } : x)));

  const offertaCent = altra !== '' ? Math.max(0, Math.round(Number(altra.replace(',', '.')) * 100) || 0) : offerta;
  const totale = totaleBiglietti(s, { posti, pizze, offerta: offertaCent });
  const ripetuto = persone.find((x, k) => normale(x) && persone.findIndex((y) => normale(y) === normale(x)) !== k);
  const manca = s.limite_allievo && !allievo ? (chiedi ? 'scegli gruppo e allievo/a e conferma con la data di nascita' : 'scegli gruppo e allievo/a')
    : allievoId && !allievo ? (chiedi ? 'conferma l\'allievo/a con la data di nascita (o togli la scelta)' : 'attendi il controllo dell\'allievo/a (o togli la scelta)')
      : maxPosti < 1 ? 'non ci sono più posti disponibili'
        : persone.some((x) => !x.nome.trim() || !x.cognome.trim()) ? 'scrivi nome e cognome di ogni persona'
          : ripetuto ? `hai scritto due volte ${ripetuto.nome.trim()} ${ripetuto.cognome.trim()}` : '';

  // al genitore: quello che serve per riepilogo e invio
  useEffect(() => {
    onChange(s.id, { manca, totale, posti, pizze: s.pizza_aperta ? pizze : 0, offerta_cent: s.offerta_libera ? offertaCent : 0,
      allievo_id: allievo?.id || null, nascita: allievo && chiedi ? nascita : null, allievo_nome: allievo?.nome || null,
      partecipanti: persone, contributo_cent: (s.contributo_cent || 0) * (s.contributo_per_posto ? posti : 1) });
  }, [manca, totale, posti, pizze, offertaCent, allievo, nascita, persone]); // eslint-disable-line react-hooks/exhaustive-deps

  const primo = dati?.prenotante;
  return (
    <section className="bg-evento-scelto" hidden={!visibile} aria-label={s.titolo}>
      <div className="bg-evento-titolo"><strong>{s.titolo}</strong><span className="piccolo">{quandoSpettacolo(s.inizio)}</span></div>

      {s.con_allievi && (
        <div className="bg-blocco">
          <h3 className="bg-sotto">Chi vieni a vedere?{!s.limite_allievo && <span className="muto piccolo"> (facoltativo)</span>}</h3>
          {s.limite_allievo && <p className="piccolo muto">Ogni allievo/a ha {s.posti_per_allievo} posti per il suo pubblico{s.liberi_dal ? `; dal ${dataBreve(s.liberi_dal)} i posti rimasti sono liberi per tutti` : ''}.{chiedi && ' Per prenotarli conferma con la data di nascita dell\'allievo/a.'}</p>}
          {allievo ? (
            <div className="bg-allievo-scelto">
              <span>Vieni a vedere <strong>{allievo.nome}</strong>{allievo.gruppo ? ` · ${allievo.gruppo}` : ''} ✓
                {s.limite_allievo && <span className="piccolo muto"> · {allievo.rimasti === 1 ? '1 posto disponibile' : `${allievo.rimasti} posti disponibili`}</span>}</span>
              <button type="button" className="link-btn piccolo" onClick={() => { setAllievo(null); setAllievoId(''); setNascita(''); }}>cambia</button>
            </div>
          ) : (
            <div className="bg-scelta-allievo">
              <div className="campo">
                <label htmlFor={`bg-gruppo-${s.id}`}>Gruppo</label>
                <select id={`bg-gruppo-${s.id}`} value={gruppo} onChange={(e) => setGruppo(e.target.value)} disabled={!gruppi}>
                  <option value="">{gruppi ? (gruppi.length ? '— scegli il gruppo —' : 'nessun gruppo in elenco') : 'carico…'}</option>
                  {(gruppi || []).map((g) => <option key={g.gruppo} value={g.gruppo}>{g.gruppo}</option>)}
                </select>
              </div>
              {gruppo && (
                <div className="campo">
                  <label htmlFor={`bg-allievo-${s.id}`}>Allievo/a</label>
                  <select id={`bg-allievo-${s.id}`} value={allievoId} onChange={(e) => { const id = e.target.value; setAllievoId(id); setVerifica({ invio: false, errore: '' }); if (id && !chiedi) conferma(id); }} disabled={!elenco}>
                    <option value="">{elenco ? '— scegli —' : 'carico…'}</option>
                    {(elenco || []).map((a) => <option key={a.id} value={a.id}>{a.nome} {a.cognome}</option>)}
                  </select>
                </div>
              )}
              {allievoId && !chiedi && verifica.invio && <p className="piccolo muto">Un attimo…</p>}
              {allievoId && chiedi && (
                <div className="campo">
                  <label htmlFor={`bg-nascita-${s.id}`}>Data di nascita dell&apos;allievo/a (per confermare che sei un parente)</label>
                  <div className="bg-conferma">
                    <input id={`bg-nascita-${s.id}`} type="date" value={nascita} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setNascita(e.target.value)} />
                    <button type="button" className="btn btn-primario" disabled={verifica.invio || !nascita} onClick={() => conferma()}>{verifica.invio ? 'Controllo…' : 'Conferma'}</button>
                  </div>
                </div>
              )}
              {verifica.errore && <div className="errore" role="alert">{verifica.errore}</div>}
            </div>
          )}
        </div>
      )}

      <div className="bg-blocco">
        <h3 className="bg-sotto">Quanti siete?</h3>
        <div className="bg-righe">
          <div className="bg-riga"><label htmlFor={`bg-posti-${s.id}`}>Posti</label>
            <Contatore id={`bg-posti-${s.id}`} valore={posti} min={1} max={Math.max(maxPosti, 1)} onChange={setPosti} /></div>
          {s.pizza_aperta && (
            <div className="bg-riga"><label htmlFor={`bg-pizze-${s.id}`}>Pizze <span className="piccolo muto">{euro(s.pizza_cent)} l&apos;una{s.pizza_entro ? `, entro il ${dataBreve(s.pizza_entro)}` : ''}</span></label>
              <Contatore id={`bg-pizze-${s.id}`} valore={pizze} max={30} onChange={setPizze} /></div>
          )}
          {s.offerta_libera && (
            <div className="bg-riga bg-offerta"><span>Contribuisci alla nostra raccolta fondi <span className="piccolo muto">(facoltativo)</span></span>
              <div className="bg-chips">
                {OFFERTE.map((o) => (
                  <button key={o} type="button" aria-pressed={altra === '' && offerta === o} onClick={() => { setOfferta(o); setAltra(''); }}>{o ? euro(o) : 'No'}</button>
                ))}
                <input aria-label="Altro importo in euro" inputMode="decimal" placeholder="altro €" value={altra} onChange={(e) => setAltra(e.target.value.replace(/[^0-9.,]/g, ''))} />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-blocco">
        <h3 className="bg-sotto">Chi viene? <span className="muto piccolo">(un nome per biglietto)</span></h3>
        <div className="bg-persone">
          {persone.map((x, k) => (
            <div key={k} className="bg-persona">
              <span className="bg-num">{k + 1}</span>
              <input className="bg-input" aria-label={`${s.titolo}: nome persona ${k + 1}`} placeholder="Nome" value={x.nome} onChange={setPersona(k, 'nome')} autoComplete="off" />
              <input className="bg-input" aria-label={`${s.titolo}: cognome persona ${k + 1}`} placeholder="Cognome" value={x.cognome} onChange={setPersona(k, 'cognome')} autoComplete="off" />
              {k === 0 && !x.nome && !x.cognome && (primo?.nome || primo?.cognome) && (
                <button type="button" className="link-btn piccolo" onClick={() => setPersone((v) => v.map((y, i) => (i === 0 ? { nome: primo.nome, cognome: primo.cognome } : y)))}>sono io</button>
              )}
            </div>
          ))}
        </div>
        {ripetuto && <div className="errore" role="alert">Hai scritto due volte {ripetuto.nome.trim()} {ripetuto.cognome.trim()}.</div>}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ la pagina: uno o più eventi, un solo pagamento
export default function Prenota({ b, carta }) {
  const [scelti, setScelti] = useState(b.spettacoli.length === 1 && !b.spettacoli[0].chiuso ? [b.spettacoli[0].id] : []);
  const [aperti, setAperti] = useState(scelti);           // eventi già toccati (restano montati, così non si perde niente)
  const [righe, setRighe] = useState({});
  const [dati, setDati] = useState({ nome: '', cognome: '', email: '', telefono: '' });
  const [privacy, setPrivacy] = useState(false);
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState('');
  const [fatto, setFatto] = useState(null);
  const perId = Object.fromEntries(b.spettacoli.map((s) => [s.id, s]));
  const ordinati = b.spettacoli.filter((s) => scelti.includes(s.id));

  function alterna(id) {
    setErrore('');
    setScelti((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
    setAperti((v) => (v.includes(id) ? v : [...v, id]));
  }
  const aggiorna = (id, d) => setRighe((v) => ({ ...v, [id]: d }));

  const totale = ordinati.reduce((n, s) => n + (righe[s.id]?.totale || 0), 0);
  const manca = !ordinati.length ? 'Scegli almeno un evento.'
    : ordinati.map((s) => (righe[s.id]?.manca ? `${s.titolo}: ${righe[s.id].manca}.` : '')).find(Boolean)
      || (!dati.nome.trim() || !dati.cognome.trim() ? 'Scrivi il tuo nome e cognome.'
        : !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(dati.email.trim()) ? 'Scrivi la tua email: lì arrivano i biglietti.'
          : !privacy ? 'Serve il consenso al trattamento dei dati.' : '');

  async function invia(conCarta) {
    if (manca) { setErrore(manca); return; }
    setInvio(true); setErrore('');
    const r = await fetch('/api/biglietteria/prenota', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...dati, privacy, carta: conCarta, righe: ordinati.map((s) => {
        const x = righe[s.id] || {};
        return { spettacolo_id: s.id, allievo_id: x.allievo_id, nascita: x.nascita, posti: x.posti, pizze: x.pizze, offerta_cent: x.offerta_cent, partecipanti: x.partecipanti };
      }) }),
    }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) { setInvio(false); setErrore(d.errore || 'Prenotazione non riuscita. Controlla la connessione e riprova.'); return; }
    if (d.url) { window.location.href = d.url; return; }
    setInvio(false); setFatto({ ...d, email: dati.email.trim() });
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch { /* niente */ }
  }

  if (fatto) {
    const causale = `SAGGIO ${fatto.codice} ${dati.cognome.trim().toUpperCase()}`;
    return (
      <section className="scheda bg-fatto" role="status">
        {fatto.stato === 'gratis' ? (
          <>
            <h2>Prenotato ✓</h2>
            <p>Ti abbiamo mandato i biglietti a <strong>{fatto.email}</strong>: uno per persona, con il codice QR da mostrare all&apos;ingresso.</p>
            <Link href={`/biglietti/${fatto.token}`} className="btn btn-primario btn-pieno btn-grande">Apri i biglietti</Link>
          </>
        ) : (
          <>
            <h2>Posti tenuti per te ✓ Ora il pagamento</h2>
            <p>Codice prenotazione <strong className="bg-codice">{fatto.codice}</strong>{fatto.eventi > 1 ? ` (${fatto.eventi} eventi)` : ''} · da pagare <strong>{euro(fatto.totale_cent)}</strong></p>
            {b.link_pagamento && (
              <a href={b.link_pagamento} target="_blank" rel="noopener noreferrer" className="btn btn-primario btn-pieno btn-grande">Paga {euro(fatto.totale_cent)}</a>
            )}
            <p>Nella causale scrivi: <strong>{causale}</strong>
              <button type="button" className="link-btn piccolo" onClick={() => { try { navigator.clipboard.writeText(causale); } catch { /* niente */ } }}> copia</button></p>
            {b.istruzioni_pagamento && <p className="piccolo" style={{ whiteSpace: 'pre-line' }}>{b.istruzioni_pagamento}</p>}
            {carta && <button type="button" className="btn btn-pieno" onClick={async () => {
              const r = await fetch('/api/biglietteria/paga', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: fatto.token }) });
              const d = await r.json().catch(() => ({})); if (d.url) window.location.href = d.url; else setErrore(d.errore || 'Pagamento con carta non disponibile.');
            }}>Oppure paga con carta</button>}
            <p className="piccolo">Quando la segreteria vede il pagamento ti arrivano tutti i biglietti in una email a <strong>{fatto.email}</strong>.
              I posti restano tenuti per {b.giorni_per_pagare} giorni.</p>
            <Link href={`/biglietti/${fatto.token}`} className="piccolo">Controlla qui lo stato della prenotazione</Link>
          </>
        )}
        {errore && <div className="errore" role="alert">{errore}</div>}
      </section>
    );
  }

  return (
    <div className="bg-prenota">
      <h2 className="bg-passo">1 · A quali eventi vieni? <span className="muto piccolo">(puoi sceglierne più di uno)</span></h2>
      <div className="bg-spettacoli" role="group" aria-label="Eventi">
        {b.spettacoli.map((x) => {
          const pieno = x.posti_liberi === 0;
          const su = scelti.includes(x.id);
          return (
            <button key={x.id} type="button" aria-pressed={su} disabled={x.chiuso || pieno}
                    className={`bg-spettacolo${su ? ' scelto' : ''}`} onClick={() => alterna(x.id)}>
              <span className="bg-spunta-evento" aria-hidden="true">{su ? '✓' : ''}</span>
              <strong>{x.titolo}</strong>
              <span>{quandoSpettacolo(x.inizio)}</span>
              <span className="piccolo">{prezzoSpettacolo(x)}</span>
              {x.chiuso ? <span className="tag tag-neutro">chiuso</span> : pieno ? <span className="tag tag-neutro">tutto esaurito</span>
                : x.posti_liberi != null && x.posti_liberi <= 20 ? <span className="tag tag-attenzione">ultimi {x.posti_liberi} posti</span> : null}
            </button>
          );
        })}
      </div>

      {/* resta montato anche senza eventi scelti (solo nascosto): togliendoli tutti e rimettendoli i dati restano */}
      {aperti.length > 0 && (
        <div className="bg-layout" hidden={!ordinati.length}>
          <div className="bg-passi">
            <h2 className="bg-passo">2 · I dettagli {ordinati.length > 1 ? 'di ogni evento' : ''}</h2>
            {/* tutti gli eventi toccati restano qui (nascosti se tolti): i dati non si perdono */}
            {aperti.map((id) => perId[id] && (
              <SceltaEvento key={id} s={perId[id]} visibile={scelti.includes(id)} dati={{ prenotante: dati }} onChange={aggiorna} />
            ))}

            <h2 className="bg-passo">3 · I tuoi dati</h2>
            <div className="bg-dati">
              <div className="campo"><label htmlFor="bg-nome">Nome</label><input id="bg-nome" value={dati.nome} onChange={(e) => setDati({ ...dati, nome: e.target.value })} autoComplete="given-name" /></div>
              <div className="campo"><label htmlFor="bg-cognome">Cognome</label><input id="bg-cognome" value={dati.cognome} onChange={(e) => setDati({ ...dati, cognome: e.target.value })} autoComplete="family-name" /></div>
              <div className="campo"><label htmlFor="bg-email">Email (qui arrivano i biglietti)</label><input id="bg-email" type="email" value={dati.email} onChange={(e) => setDati({ ...dati, email: e.target.value })} autoComplete="email" /></div>
              <div className="campo"><label htmlFor="bg-tel">Telefono <span className="muto">(facoltativo)</span></label><input id="bg-tel" type="tel" value={dati.telefono} onChange={(e) => setDati({ ...dati, telefono: e.target.value })} autoComplete="tel" /></div>
            </div>
            <label className="spunta"><input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} />
              <span>Ho letto l&apos;<Link href="/privacy" target="_blank">informativa privacy</Link> e acconsento al trattamento dei dati per la prenotazione.</span></label>
          </div>

          <aside className="bg-riepilogo" aria-label="Riepilogo">
            <div className="isc-totale bg-totale">
              {ordinati.map((s) => {
                const x = righe[s.id] || {};
                return (
                  <div key={s.id} className="bg-riep-evento">
                    <span><strong>{oraSpettacolo(s.inizio)} {s.titolo}</strong>
                      <span className="piccolo muto"> · {x.posti || 1} {x.posti === 1 || !x.posti ? 'posto' : 'posti'}{x.pizze ? ` · ${x.pizze} pizz${x.pizze === 1 ? 'a' : 'e'}` : ''}{x.allievo_nome ? ` · per ${x.allievo_nome}` : ''}</span></span>
                    <span>{x.totale ? euro(x.totale) : 'gratis'}</span>
                  </div>
                );
              })}
              <div className="somma"><strong>Totale</strong><strong>{totale ? euro(totale) : 'gratis'}</strong></div>
            </div>
            {errore && <div className="errore" role="alert">{errore}</div>}
            <div className="bg-bottoni">
              {totale === 0 ? (
                <button type="button" className="btn btn-primario btn-pieno btn-grande" disabled={invio} onClick={() => invia(false)}>{invio ? 'Un attimo…' : 'Prenota i biglietti'}</button>
              ) : (
                <>
                  {carta && <button type="button" className="btn btn-primario btn-pieno btn-grande" disabled={invio} onClick={() => invia(true)}>{invio ? 'Un attimo…' : `Paga ${euro(totale)} con carta`}</button>}
                  <button type="button" className={`btn btn-pieno btn-grande${carta ? '' : ' btn-primario'}`} disabled={invio} onClick={() => invia(false)}>
                    {invio ? 'Un attimo…' : b.link_pagamento ? `Prenota e paga ${euro(totale)}${carta ? ' con Satispay / link' : ''}` : `Prenota (${euro(totale)} da pagare)`}</button>
                </>
              )}
            </div>
            {totale > 0 && <p className="piccolo muto">Un solo pagamento per tutto. I biglietti (un QR per persona) arrivano in una email quando il pagamento è confermato.</p>}
          </aside>
        </div>
      )}
    </div>
  );
}
