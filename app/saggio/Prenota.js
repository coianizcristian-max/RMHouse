'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { euro } from '@/lib/formato';
import { quandoSpettacolo, totaleBiglietti } from '@/lib/biglietteria';

const OFFERTE = [0, 500, 1000, 2000];
const dataBreve = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('it-IT', { day: 'numeric', month: 'numeric' }) : '');

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

export default function Prenota({ b, carta }) {
  const [sid, setSid] = useState(b.spettacoli.length === 1 ? b.spettacoli[0].id : '');
  const s = b.spettacoli.find((x) => x.id === sid);
  const [gruppi, setGruppi] = useState(null);
  const [gruppo, setGruppo] = useState('');
  const [elenco, setElenco] = useState(null);
  const [allievoId, setAllievoId] = useState('');
  const [nascita, setNascita] = useState('');
  const [allievo, setAllievo] = useState(null);       // confermato con la data di nascita: { id, nome, gruppo, rimasti }
  const [verifica, setVerifica] = useState({ invio: false, errore: '' });
  const [posti, setPosti] = useState(1);
  const [pizze, setPizze] = useState(0);
  const [offerta, setOfferta] = useState(0);
  const [altra, setAltra] = useState('');
  const [dati, setDati] = useState({ nome: '', cognome: '', email: '', telefono: '' });
  const [persone, setPersone] = useState([{ nome: '', cognome: '' }]);   // un nominativo per posto
  const [privacy, setPrivacy] = useState(false);
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState('');
  const [fatto, setFatto] = useState(null);
  const ultimo = useRef('');

  // cambiando spettacolo si riparte: i gruppi di quello spettacolo
  useEffect(() => {
    setGruppi(null); setGruppo(''); setElenco(null); setAllievoId(''); setNascita(''); setAllievo(null); setVerifica({ invio: false, errore: '' });
    setPosti(1); setPizze(0); setOfferta(0); setAltra(''); setErrore('');
    if (!s?.con_allievi) return;
    fetch(`/api/biglietteria/elenco?s=${s.id}`).then((r) => (r.ok ? r.json() : [])).then(setGruppi).catch(() => setGruppi([]));
  }, [sid]); // eslint-disable-line react-hooks/exhaustive-deps

  // scelto il gruppo: i suoi allievi
  useEffect(() => {
    setElenco(null); setAllievoId(''); setAllievo(null); setNascita(''); setVerifica({ invio: false, errore: '' });
    if (!s?.con_allievi || !gruppo) return;
    const chiave = `${s.id}|${gruppo}`; ultimo.current = chiave;
    fetch(`/api/biglietteria/elenco?s=${s.id}&g=${encodeURIComponent(gruppo)}`).then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (ultimo.current === chiave) setElenco(d); }).catch(() => setElenco([]));
  }, [gruppo]); // eslint-disable-line react-hooks/exhaustive-deps

  async function conferma() {
    if (!allievoId || !/^\d{4}-\d{2}-\d{2}$/.test(nascita)) { setVerifica({ invio: false, errore: 'Scegli l\'allievo/a e scrivi la sua data di nascita.' }); return; }
    setVerifica({ invio: true, errore: '' });
    const r = await fetch('/api/biglietteria/verifica', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allievo_id: allievoId, nascita }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok || !d.ok) {
      // due allievi con lo stesso nome e cognome ("Marta Neri (1)" e "(2)"): forse è l'altro
      const scelto = (elenco || []).find((a) => a.id === allievoId);
      const doppio = scelto && /\(\d+\)$/.test(scelto.cognome || '');
      setVerifica({ invio: false, errore: (d.errore || 'Controllo non riuscito. Riprova.') + (doppio && r?.status === 409 ? ' Nel gruppo ci sono due allievi con lo stesso nome: prova a scegliere l\'altro.' : '') });
      return;
    }
    setVerifica({ invio: false, errore: '' }); setAllievo({ id: allievoId, ...d }); setPosti(1);
  }

  const maxPosti = useMemo(() => {
    if (!s) return 1;
    let m = s.max_per_prenotazione || 10;
    if (s.limite_allievo) m = Math.min(m, allievo?.rimasti ?? 0);
    if (s.posti_liberi != null) m = Math.min(m, s.posti_liberi);
    return m;
  }, [s, allievo]);
  useEffect(() => { if (posti > maxPosti) setPosti(Math.max(maxPosti, 1)); }, [maxPosti]); // eslint-disable-line react-hooks/exhaustive-deps

  // i nominativi seguono il numero di posti; il primo, se vuoto, è chi prenota
  useEffect(() => {
    setPersone((v) => Array.from({ length: posti }, (_, k) => v[k] || { nome: '', cognome: '' }));
  }, [posti]);
  const setPersona = (k, campo) => (e) => setPersone((v) => v.map((x, i) => (i === k ? { ...x, [campo]: e.target.value } : x)));
  const normale = (x) => `${x.nome} ${x.cognome}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]+/g, ' ').trim();
  const ripetuto = persone.find((x, k) => normale(x) && persone.findIndex((y) => normale(y) === normale(x)) !== k);
  const offertaCent = altra !== '' ? Math.max(0, Math.round(Number(altra.replace(',', '.')) * 100) || 0) : offerta;
  const totale = totaleBiglietti(s, { posti, pizze, offerta: offertaCent });
  const manca = !s ? 'Scegli lo spettacolo.'
    : s.limite_allievo && !allievo ? 'Scegli gruppo e allievo/a e conferma con la sua data di nascita.'
      : allievoId && !allievo ? 'Conferma l\'allievo/a con la data di nascita (o togli la scelta).'
      : maxPosti < 1 ? 'Non ci sono più posti disponibili.'
        : !dati.nome.trim() || !dati.cognome.trim() ? 'Scrivi nome e cognome.'
          : !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(dati.email.trim()) ? 'Scrivi la tua email: lì arrivano i biglietti.'
            : persone.some((x) => !x.nome.trim() || !x.cognome.trim()) ? 'Scrivi nome e cognome di ogni persona che viene (uno per posto).'
              : ripetuto ? `Hai scritto due volte ${ripetuto.nome.trim()} ${ripetuto.cognome.trim()}.`
            : !privacy ? 'Serve il consenso al trattamento dei dati.' : '';

  async function invia(conCarta) {
    if (manca) { setErrore(manca); return; }
    setInvio(true); setErrore('');
    const r = await fetch('/api/biglietteria/prenota', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spettacolo_id: s.id, allievo_id: allievo?.id || null, nascita: allievo ? nascita : null, posti, pizze: s.pizza_aperta ? pizze : 0,
        offerta_cent: s.offerta_libera ? offertaCent : 0, ...dati, partecipanti: persone, privacy, carta: conCarta }),
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
            <p>Codice prenotazione <strong className="bg-codice">{fatto.codice}</strong> · da pagare <strong>{euro(fatto.totale_cent)}</strong></p>
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
            <p className="piccolo">Quando la segreteria vede il pagamento ti arrivano i biglietti a <strong>{fatto.email}</strong>.
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
      <h2 className="bg-passo">1 · Quale spettacolo?</h2>
      <div className="bg-spettacoli" role="radiogroup" aria-label="Spettacolo">
        {b.spettacoli.map((x) => {
          const pieno = x.posti_liberi === 0;
          return (
            <button key={x.id} type="button" role="radio" aria-checked={sid === x.id} disabled={x.chiuso || pieno}
                    className={`bg-spettacolo${sid === x.id ? ' scelto' : ''}`} onClick={() => setSid(x.id)}>
              <strong>{x.titolo}</strong>
              <span>{quandoSpettacolo(x.inizio)}</span>
              <span className="piccolo">{prezzoSpettacolo(x)}</span>
              {x.chiuso ? <span className="tag tag-neutro">chiuso</span> : pieno ? <span className="tag tag-neutro">tutto esaurito</span>
                : x.posti_liberi != null && x.posti_liberi <= 20 ? <span className="tag tag-attenzione">ultimi {x.posti_liberi} posti</span> : null}
            </button>
          );
        })}
      </div>
      {s?.descrizione && <p className="piccolo" style={{ whiteSpace: 'pre-line' }}>{s.descrizione}</p>}

      {s && (
        <div className="bg-layout">
        <div className="bg-passi">
          {s.con_allievi && (
            <>
              <h2 className="bg-passo">2 · Chi vieni a vedere?{!s.limite_allievo && <span className="muto piccolo"> (facoltativo)</span>}</h2>
              {s.limite_allievo && <p className="piccolo muto">Ogni allievo/a ha {s.posti_per_allievo} posti per il suo pubblico{s.liberi_dal ? `; dal ${dataBreve(s.liberi_dal)} i posti rimasti sono liberi per tutti` : ''}.
                Per prenotarli conferma con la data di nascita dell&apos;allievo/a.</p>}
              {allievo ? (
                <div className="bg-allievo-scelto">
                  <span>Vieni a vedere <strong>{allievo.nome}</strong>{allievo.gruppo ? ` · ${allievo.gruppo}` : ''} ✓
                    {s.limite_allievo && <span className="piccolo muto"> · {allievo.rimasti === 1 ? '1 posto disponibile' : `${allievo.rimasti} posti disponibili`}</span>}</span>
                  <button type="button" className="link-btn piccolo" onClick={() => { setAllievo(null); setAllievoId(''); setNascita(''); }}>cambia</button>
                </div>
              ) : (
                <div className="bg-scelta-allievo">
                  <div className="campo">
                    <label htmlFor="bg-gruppo">Gruppo</label>
                    <select id="bg-gruppo" value={gruppo} onChange={(e) => setGruppo(e.target.value)} disabled={!gruppi}>
                      <option value="">{gruppi ? (gruppi.length ? '— scegli il gruppo —' : 'nessun gruppo in elenco') : 'carico…'}</option>
                      {(gruppi || []).map((g) => <option key={g.gruppo} value={g.gruppo}>{g.gruppo}</option>)}
                    </select>
                  </div>
                  {gruppo && (
                    <div className="campo">
                      <label htmlFor="bg-allievo">Allievo/a</label>
                      <select id="bg-allievo" value={allievoId} onChange={(e) => { setAllievoId(e.target.value); setVerifica({ invio: false, errore: '' }); }} disabled={!elenco}>
                        <option value="">{elenco ? '— scegli —' : 'carico…'}</option>
                        {(elenco || []).map((a) => <option key={a.id} value={a.id}>{a.nome} {a.cognome}</option>)}
                      </select>
                    </div>
                  )}
                  {allievoId && (
                    <div className="campo">
                      <label htmlFor="bg-nascita">Data di nascita dell&apos;allievo/a (per confermare che sei un parente)</label>
                      <div className="bg-conferma">
                        <input id="bg-nascita" type="date" value={nascita} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setNascita(e.target.value)} />
                        <button type="button" className="btn btn-primario" disabled={verifica.invio || !nascita} onClick={conferma}>{verifica.invio ? 'Controllo…' : 'Conferma'}</button>
                      </div>
                    </div>
                  )}
                  {verifica.errore && <div className="errore" role="alert">{verifica.errore}</div>}
                </div>
              )}
            </>
          )}

          <h2 className="bg-passo">{s.con_allievi ? '3' : '2'} · Quanti siete?</h2>
          <div className="bg-righe">
            <div className="bg-riga"><label htmlFor="bg-posti">Posti</label>
              <Contatore id="bg-posti" valore={posti} min={1} max={Math.max(maxPosti, 1)} onChange={setPosti} /></div>
            {s.pizza_aperta && (
              <div className="bg-riga"><label htmlFor="bg-pizze">Pizze <span className="piccolo muto">{euro(s.pizza_cent)} l&apos;una{s.pizza_entro ? `, entro il ${dataBreve(s.pizza_entro)}` : ''}</span></label>
                <Contatore id="bg-pizze" valore={pizze} max={30} onChange={setPizze} /></div>
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

          <h2 className="bg-passo">{s.con_allievi ? '4' : '3'} · I tuoi dati</h2>
          <div className="bg-dati">
            <div className="campo"><label htmlFor="bg-nome">Nome</label><input id="bg-nome" value={dati.nome} onChange={(e) => setDati({ ...dati, nome: e.target.value })} autoComplete="given-name" /></div>
            <div className="campo"><label htmlFor="bg-cognome">Cognome</label><input id="bg-cognome" value={dati.cognome} onChange={(e) => setDati({ ...dati, cognome: e.target.value })} autoComplete="family-name" /></div>
            <div className="campo"><label htmlFor="bg-email">Email (qui arrivano i biglietti)</label><input id="bg-email" type="email" value={dati.email} onChange={(e) => setDati({ ...dati, email: e.target.value })} autoComplete="email" /></div>
            <div className="campo"><label htmlFor="bg-tel">Telefono <span className="muto">(facoltativo)</span></label><input id="bg-tel" type="tel" value={dati.telefono} onChange={(e) => setDati({ ...dati, telefono: e.target.value })} autoComplete="tel" /></div>
          </div>

          <h2 className="bg-passo">{s.con_allievi ? '5' : '4'} · Chi viene? <span className="muto piccolo">(un nome per biglietto)</span></h2>
          <p className="piccolo muto">Ogni biglietto è nominativo: scrivi nome e cognome di ogni persona. La stessa persona non può essere prenotata due volte.</p>
          <div className="bg-persone">
            {persone.map((x, k) => (
              <div key={k} className="bg-persona">
                <span className="bg-num">{k + 1}</span>
                <input className="bg-input" aria-label={`Nome persona ${k + 1}`} placeholder="Nome" value={x.nome} onChange={setPersona(k, 'nome')} autoComplete="off" />
                <input className="bg-input" aria-label={`Cognome persona ${k + 1}`} placeholder="Cognome" value={x.cognome} onChange={setPersona(k, 'cognome')} autoComplete="off" />
                {k === 0 && !x.nome && !x.cognome && (dati.nome || dati.cognome) && (
                  <button type="button" className="link-btn piccolo" onClick={() => setPersone((v) => v.map((y, i) => (i === 0 ? { nome: dati.nome, cognome: dati.cognome } : y)))}>sono io</button>
                )}
              </div>
            ))}
          </div>
          {ripetuto && <div className="errore" role="alert">Hai scritto due volte {ripetuto.nome.trim()} {ripetuto.cognome.trim()}.</div>}
          <label className="spunta"><input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} />
            <span>Ho letto l&apos;<Link href="/privacy" target="_blank">informativa privacy</Link> e acconsento al trattamento dei dati per la prenotazione.</span></label>
        </div>

        <aside className="bg-riepilogo" aria-label="Riepilogo">
          <div className="bg-riep-testa">
            <strong>{s.titolo}</strong>
            <span className="piccolo">{quandoSpettacolo(s.inizio)}</span>
            {allievo && <span className="piccolo">per {allievo.nome}</span>}
            <span className="piccolo">{posti} {posti === 1 ? 'posto' : 'posti'}{pizze ? ` · ${pizze} ${pizze === 1 ? 'pizza' : 'pizze'}` : ''}</span>
          </div>
          <div className="isc-totale bg-totale">
            {s.contributo_cent > 0 && <div><span>Contributo{s.contributo_per_posto ? ` × ${posti}` : ''}</span><span>{euro(s.contributo_cent * (s.contributo_per_posto ? posti : 1))}</span></div>}
            {s.pizza_aperta && pizze > 0 && <div><span>Pizze × {pizze}</span><span>{euro(pizze * s.pizza_cent)}</span></div>}
            {s.offerta_libera && offertaCent > 0 && <div><span>Raccolta fondi</span><span>{euro(offertaCent)}</span></div>}
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
          {totale > 0 && <p className="piccolo muto">I biglietti (un QR per persona) arrivano per email quando il pagamento è confermato.</p>}
        </aside>
        </div>
      )}
    </div>
  );
}
