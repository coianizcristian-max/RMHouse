'use client';
import { useEffect, useMemo, useState } from 'react';
import { euro, giornoLungo } from '@/lib/formato';

const ORE = Array.from({ length: 31 }, (_, i) => {
  const m = 8 * 60 + i * 30;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
});
const DURATE = [1, 1.5, 2, 3, 4, 6, 8];

export default function Richiesta() {
  const [catalogo, setCatalogo] = useState(null);
  const [errore, setErrore] = useState('');
  const [passo, setPasso] = useState('tipo');
  const [tipo, setTipo] = useState(null);           // 'sala' | 'evento'
  const [pacchetto, setPacchetto] = useState(null);
  const [sala, setSala] = useState('');
  const [data, setData] = useState('');
  const [oraInizio, setOraInizio] = useState('');
  const [durata, setDurata] = useState(2);
  const [ospiti, setOspiti] = useState('');
  const [verifica, setVerifica] = useState(null);
  const [controllo, setControllo] = useState(false);
  const [dati, setDati] = useState({ nome: '', email: '', telefono: '', titolo: '', note: '' });
  const [privacy, setPrivacy] = useState(false);
  const [invio, setInvio] = useState(false);
  const [esito, setEsito] = useState(null);

  useEffect(() => {
    fetch('/api/spazi/catalogo').then((r) => r.json()).then((d) => {
      if (d.errore) setErrore(d.errore); else setCatalogo(d);
    }).catch(() => setErrore('Connessione assente. Riprova.'));
  }, []);

  const durataMin = pacchetto ? pacchetto.durata_min : durata * 60;
  const salaScelta = pacchetto?.sala_id || sala;

  const istanti = useMemo(() => {
    if (!data || !oraInizio) return null;
    const inizio = new Date(`${data}T${oraInizio}:00`);
    const fine = new Date(inizio.getTime() + durataMin * 60000);
    return { inizio: inizio.toISOString(), fine: fine.toISOString(), fineOra: fine.toTimeString().slice(0, 5) };
  }, [data, oraInizio, durataMin]);

  // controlla disponibilità e prezzo appena i dati sono completi
  useEffect(() => {
    if (!istanti || !salaScelta) { setVerifica(null); return; }
    setControllo(true);
    const q = new URLSearchParams({ sala: salaScelta, inizio: istanti.inizio, fine: istanti.fine });
    fetch(`/api/spazi/disponibilita?${q}`)
      .then((r) => r.json())
      .then((d) => setVerifica(d.errore ? null : d))
      .catch(() => setVerifica(null))
      .finally(() => setControllo(false));
  }, [istanti, salaScelta]);

  const prezzoMostrato = pacchetto
    ? pacchetto.prezzo_cent + (pacchetto.ospiti_inclusi && +ospiti > pacchetto.ospiti_inclusi
        ? (+ospiti - pacchetto.ospiti_inclusi) * pacchetto.prezzo_ospite_cent : 0)
    : verifica?.prezzo?.prezzo_cent;

  async function invia(e) {
    e.preventDefault();
    if (!privacy) { setErrore('Serve il consenso al trattamento dei dati.'); return; }
    setInvio(true); setErrore('');
    try {
      const r = await fetch('/api/spazi/richiesta', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sala_id: salaScelta, pacchetto_id: pacchetto?.id || null,
          inizio: istanti.inizio, fine: istanti.fine,
          titolo: dati.titolo || pacchetto?.nome, ospiti: ospiti || null, note: dati.note,
          consenso_privacy: privacy,
          contatto: { nome: dati.nome, email: dati.email, telefono: dati.telefono },
        }),
      });
      const d = await r.json();
      if (!r.ok) { setErrore(d.errore); return; }
      setEsito(d);
      setPasso('fatto');
    } catch {
      setErrore('Connessione assente. Riprova.');
    } finally {
      setInvio(false);
    }
  }

  if (!catalogo && !errore) return <p className="muto">Carico…</p>;
  const domani = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  return (
    <div>
      {errore && <div className="errore" role="alert">{errore}</div>}

      {passo === 'tipo' && catalogo && (
        <section className="compare">
          <h1>Affitta uno spazio da noi</h1>
          <p className="muto">Sale attrezzate per prove, corsi, workshop e feste. Scegli cosa ti serve.</p>
          <div className="scelte" style={{ gridTemplateColumns: '1fr' }}>
            <button type="button" className="scelta" style={{ minHeight: 64 }}
                    onClick={() => { setTipo('sala'); setPacchetto(null); setPasso('quando'); }}>
              Sala a ore
              <small>Per prove, lezioni private, riprese o riunioni</small>
            </button>
            {catalogo.pacchetti.map((p) => (
              <button type="button" key={p.id} className="scelta" style={{ minHeight: 64 }}
                      onClick={() => { setTipo('evento'); setPacchetto(p); setDurata(p.durata_min / 60); setPasso('quando'); }}>
                {p.nome}
                <small>
                  {p.descrizione} · {Math.round(p.durata_min / 60)} ore · da {euro(p.prezzo_cent)}
                  {p.ospiti_inclusi ? ` fino a ${p.ospiti_inclusi} invitati` : ''}
                </small>
              </button>
            ))}
          </div>
          {catalogo.tariffe.length > 0 && (
            <div className="scheda">
              <div className="piccolo muto" style={{ marginBottom: 6 }}>Listino orario</div>
              {catalogo.tariffe.map((t) => (
                <div key={t.id} className="piccolo" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{t.nome} <span className="muto">({String(t.ora_da).slice(0, 5)}–{String(t.ora_a).slice(0, 5)})</span></span>
                  <strong>{euro(t.prezzo_ora_cent)}/ora</strong>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {passo === 'quando' && (
        <section className="compare">
          <h1>Quando ti serve?</h1>
          {pacchetto && (
            <div className="scheda" style={{ marginBottom: 16 }}>
              <strong>{pacchetto.nome}</strong>
              <div className="piccolo muto">{pacchetto.incluso}</div>
            </div>
          )}

          {!pacchetto && (
            <div className="campo">
              <label htmlFor="sala">Sala</label>
              <select id="sala" value={sala} onChange={(e) => setSala(e.target.value)}>
                <option value="">— scegli —</option>
                {catalogo.sale.map((s) => (
                  <option key={s.id} value={s.id}>{s.nome}{s.capienza ? ` (fino a ${s.capienza} persone)` : ''}</option>
                ))}
              </select>
            </div>
          )}

          <div className="riga-2">
            <div className="campo">
              <label htmlFor="data">Giorno</label>
              <input id="data" type="date" min={domani} value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div className="campo">
              <label htmlFor="ora">Dalle</label>
              <select id="ora" value={oraInizio} onChange={(e) => setOraInizio(e.target.value)}>
                <option value="">— scegli —</option>
                {ORE.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>

          {!pacchetto ? (
            <div className="campo">
              <label htmlFor="durata">Per quante ore</label>
              <select id="durata" value={durata} onChange={(e) => setDurata(Number(e.target.value))}>
                {DURATE.map((d) => <option key={d} value={d}>{d} {d === 1 ? 'ora' : 'ore'}</option>)}
              </select>
            </div>
          ) : (
            <div className="campo">
              <label htmlFor="ospiti">Quanti invitati, più o meno?</label>
              <input id="ospiti" type="number" min="1" value={ospiti} onChange={(e) => setOspiti(e.target.value)} />
              {pacchetto.ospiti_inclusi && (
                <span className="piccolo muto">
                  Fino a {pacchetto.ospiti_inclusi} invitati è compreso; oltre, {euro(pacchetto.prezzo_ospite_cent)} a testa.
                </span>
              )}
            </div>
          )}

          {istanti && salaScelta && (
            <div className="scheda" style={{ marginBottom: 16 }}>
              {controllo ? <span className="muto">Controllo la disponibilità…</span> : verifica ? (
                <>
                  <div style={{ fontWeight: 700, textTransform: 'capitalize' }}>
                    {giornoLungo(istanti.inizio)}, {oraInizio}–{istanti.fineOra}
                  </div>
                  <div className="piccolo" style={{ color: verifica.libera ? 'var(--ok)' : 'var(--rosso-scuro)', fontWeight: 600 }}>
                    {verifica.libera ? 'Sala libera in questa fascia' : 'In questa fascia la sala è occupata: prova un altro orario'}
                  </div>
                  {prezzoMostrato != null && (
                    <div style={{ fontSize: 22, fontWeight: 850, marginTop: 6 }}>
                      {euro(prezzoMostrato)}
                      {!pacchetto && verifica.prezzo?.tariffa && (
                        <span className="piccolo muto" style={{ fontWeight: 400 }}> · {verifica.prezzo.tariffa}</span>
                      )}
                    </div>
                  )}
                  {!pacchetto && verifica.prezzo?.nota && <div className="piccolo muto">{verifica.prezzo.nota}</div>}
                  {pacchetto && (
                    <div className="piccolo muto">Acconto alla conferma: {euro(Math.round(prezzoMostrato * pacchetto.acconto_pct / 100))}</div>
                  )}
                </>
              ) : <span className="muto">Scegli giorno e ora.</span>}
            </div>
          )}

          <button className="btn btn-primario btn-pieno" disabled={!istanti || !salaScelta || !verifica?.libera}
                  onClick={() => setPasso('dati')}>
            Continua
          </button>
          <p style={{ marginTop: 14 }}><button className="link-btn" onClick={() => setPasso('tipo')}>Indietro</button></p>
        </section>
      )}

      {passo === 'dati' && (
        <form className="compare" onSubmit={invia}>
          <h1>I tuoi contatti</h1>
          <p className="muto">
            {pacchetto ? pacchetto.nome : catalogo.sale.find((s) => s.id === sala)?.nome},{' '}
            {giornoLungo(istanti.inizio)} dalle {oraInizio} alle {istanti.fineOra}
            {prezzoMostrato != null && ` · ${euro(prezzoMostrato)}`}
          </p>
          <div className="riga-2">
            <div className="campo"><label htmlFor="n">Nome e cognome</label>
              <input id="n" required value={dati.nome} onChange={(e) => setDati({ ...dati, nome: e.target.value })} /></div>
            <div className="campo"><label htmlFor="t">Telefono</label>
              <input id="t" type="tel" required value={dati.telefono} onChange={(e) => setDati({ ...dati, telefono: e.target.value })} /></div>
          </div>
          <div className="campo"><label htmlFor="e">Email</label>
            <input id="e" type="email" required value={dati.email} onChange={(e) => setDati({ ...dati, email: e.target.value })} /></div>
          {!pacchetto && (
            <div className="campo"><label htmlFor="ti">A cosa ti serve</label>
              <input id="ti" placeholder="Prove, lezione privata, riprese…" value={dati.titolo}
                     onChange={(e) => setDati({ ...dati, titolo: e.target.value })} /></div>
          )}
          <div className="campo"><label htmlFor="no">Note</label>
            <textarea id="no" value={dati.note} onChange={(e) => setDati({ ...dati, note: e.target.value })}
                      placeholder="Materiale che ti serve, orari di allestimento, altro…" /></div>
          <label className="spunta">
            <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} />
            <span>Acconsento al trattamento dei dati per gestire la richiesta. <a href="/privacy" target="_blank">Informativa</a></span>
          </label>
          <button className="btn btn-primario btn-pieno" disabled={invio}>{invio ? 'Invio…' : 'Invia la richiesta'}</button>
          <p style={{ marginTop: 14 }}><button type="button" className="link-btn" onClick={() => setPasso('quando')}>Indietro</button></p>
        </form>
      )}

      {passo === 'fatto' && esito && (
        <section className="compare">
          <h1>Richiesta inviata</h1>
          <p>
            Ti abbiamo mandato un'email di riepilogo. Controlliamo la disponibilità e ti confermiamo al più presto:
            la fascia resta prenotabile finché non confermiamo, quindi se hai fretta chiamaci.
          </p>
          {esito.prezzo_cent > 0 && <p className="muto">Preventivo indicativo: {euro(esito.prezzo_cent)}.</p>}
        </section>
      )}
    </div>
  );
}
