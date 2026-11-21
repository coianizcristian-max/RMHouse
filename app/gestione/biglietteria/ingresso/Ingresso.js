'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { oraSpettacolo, coloreEvento } from '@/lib/biglietteria';

const CHIAVE = 'rm-ingresso-spettacolo';
// esito → [classe, simbolo, scritta grande, sottotitolo]
const ESITI = {
  ok: ['ok', '✓', 'OK · PUÒ ENTRARE', 'Registrato sul registro d\'ingresso'],
  gia_entrato: ['no', '✕', 'QR GIÀ LETTO', 'Questo biglietto è già entrato'],
  altro_spettacolo: ['attenzione', '!', 'ATTENZIONE', ''],
  non_valido: ['no', '✕', 'NON VALIDO', ''],
  non_trovato: ['no', '✕', 'QR NON RICONOSCIUTO', 'Non è un biglietto di questo saggio'],
  errore: ['no', '✕', 'ERRORE', ''],
};
const giorno = (iso) => new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Rome' });
const ora = (iso) => new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
// dal QR (link …/ingresso?b=CODICE) o dal codice scritto a mano
const codiceDa = (t) => { const m = String(t || '').match(/[?&]b=([A-Za-z0-9]+)/); return (m ? m[1] : String(t || '')).trim().toUpperCase().slice(0, 20); };

// suono e vibrazione: due toni per l'ok, uno grave per gli errori
function avvisa(ok) {
  try { navigator.vibrate?.(ok ? 120 : [200, 80, 200]); } catch { /* niente */ }
  try {
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    const c = avvisa.c || (avvisa.c = new C());
    const note = ok ? [880, 1320] : [220];
    note.forEach((f, i) => {
      const o = c.createOscillator(); const g = c.createGain();
      o.frequency.value = f; o.type = ok ? 'sine' : 'square'; g.gain.value = 0.15;
      o.connect(g); g.connect(c.destination);
      const t = c.currentTime + i * 0.12; o.start(t); o.stop(t + (ok ? 0.1 : 0.35));
    });
  } catch { /* niente */ }
}

// Scanner dei QR per le segretarie: fotocamera sempre accesa, ogni biglietto letto viene segnato sul registro
// (una volta sola). Esito a tutto schermo. «Presenze»: quanti entrati, quanti mancano, e chi manca.
export default function Ingresso({ codice, biglietteriaId, titolo, spettacoli }) {
  const [spettacolo, setSpettacolo] = useState('');
  const [esito, setEsito] = useState(null);
  const [invio, setInvio] = useState(false);
  const [camera, setCamera] = useState('spenta');          // spenta | avvio | accesa | negata
  const [testo, setTesto] = useState('');
  const [presenze, setPresenze] = useState(null);          // null = chiuso
  const [vedi, setVedi] = useState('mancanti');
  const video = useRef(null); const tela = useRef(null); const flusso = useRef(null);
  const ultimo = useRef({ codice: '', quando: 0 }); const occupato = useRef(false); const spRef = useRef('');
  const fatto = useRef(false); const timer = useRef(null);

  const controlla = useCallback(async (grezzo) => {
    const c = codiceDa(grezzo);
    if (!c || occupato.current) return;
    const adesso = Date.now();
    if (c === ultimo.current.codice && adesso - ultimo.current.quando < 4000) return;   // stesso QR ancora inquadrato
    ultimo.current = { codice: c, quando: adesso };
    occupato.current = true; setInvio(true);
    const { data, error } = await supabaseBrowser().rpc('biglietteria_ingresso', { p_codice: c, p_spettacolo: spRef.current || null });
    setInvio(false);
    const e = error ? { esito: 'errore', messaggio: error.message?.includes('non_autorizzato') ? 'Non hai i permessi per l\'ingresso.' : 'Controllo non riuscito: controlla la connessione.' } : data;
    setEsito({ ...e, letto: c });
    avvisa(e.esito === 'ok');
    clearTimeout(timer.current);
    // biglietto di un altro spettacolo: si aspetta la scelta (accetta o no), niente chiusura automatica
    if (e.esito !== 'altro_spettacolo') timer.current = setTimeout(() => { setEsito(null); occupato.current = false; }, e.esito === 'ok' ? 2200 : 3500);
  }, []);

  const chiudiEsito = () => { clearTimeout(timer.current); setEsito(null); occupato.current = false; };
  // «accettalo lo stesso»: lo segna entrato senza controllare lo spettacolo
  async function accetta(c) {
    const { data, error } = await supabaseBrowser().rpc('biglietteria_ingresso', { p_codice: c, p_spettacolo: null });
    const e = error ? { esito: 'errore', messaggio: 'Controllo non riuscito: controlla la connessione.' } : data;
    setEsito({ ...e, letto: c, accettato: true }); avvisa(e.esito === 'ok');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { setEsito(null); occupato.current = false; }, 2200);
  }
  const coloreDi = (s) => s?.colore || coloreEvento(spettacoli.findIndex((x) => x.id === s?.id) + 1);

  // fotocamera + lettura continua (BarcodeDetector se c'è, altrimenti jsQR)
  const accendi = useCallback(async () => {
    setCamera('avvio');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      flusso.current = s;
      const v = video.current; v.srcObject = s; v.setAttribute('playsinline', ''); v.muted = true; await v.play();
      setCamera('accesa');
      const rilevatore = 'BarcodeDetector' in window ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
      const jsQR = rilevatore ? null : (await import('jsqr')).default;
      const ctx = tela.current.getContext('2d', { willReadFrequently: true });
      const giro = async () => {
        if (!flusso.current) return;
        if (!occupato.current && v.readyState >= 2) {
          try {
            if (rilevatore) {
              const r = await rilevatore.detect(v);
              if (r[0]?.rawValue) controlla(r[0].rawValue);
            } else {
              const lato = 480, k = Math.min(1, lato / Math.max(v.videoWidth, v.videoHeight));
              const w = Math.round(v.videoWidth * k), h = Math.round(v.videoHeight * k);
              tela.current.width = w; tela.current.height = h; ctx.drawImage(v, 0, 0, w, h);
              const q = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
              if (q?.data) controlla(q.data);
            }
          } catch { /* fotogramma non leggibile */ }
        }
        setTimeout(() => requestAnimationFrame(giro), 120);
      };
      giro();
    } catch {
      setCamera('negata');
    }
  }, [controlla]);

  const spegni = () => { flusso.current?.getTracks().forEach((t) => t.stop()); flusso.current = null; setCamera('spenta'); };

  useEffect(() => {
    let sp = '';
    try { sp = localStorage.getItem(CHIAVE) || ''; } catch { /* niente */ }
    if (sp && !spettacoli.some((s) => s.id === sp)) sp = '';
    setSpettacolo(sp); spRef.current = sp;
    if (codice && !fatto.current) { fatto.current = true; controlla(codice); }
    return () => { flusso.current?.getTracks().forEach((t) => t.stop()); clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scegli = (v) => { setSpettacolo(v); spRef.current = v; try { localStorage.setItem(CHIAVE, v); } catch { /* niente */ } if (presenze) carica(v); };

  async function carica(sp = spettacolo) {
    if (!biglietteriaId) return;
    const { data, error } = await supabaseBrowser().rpc('biglietteria_presenze', { p_biglietteria: biglietteriaId, p_spettacolo: sp || null });
    setPresenze(error ? { errore: error.message?.includes('biglietteria_presenze') ? 'Manca la query 183 in Supabase.' : 'Non riesco a leggere le presenze.' } : data);
  }
  async function segnaAMano(x) {
    const { error } = await supabaseBrowser().rpc('biglietteria_segna', { p_biglietto: x.id, p_entrato: true });
    if (!error) { avvisa(true); carica(); }
  }

  const [classe, simbolo, scritta, sotto] = ESITI[esito?.esito] || ESITI.errore;
  const sp = spettacoli.find((s) => s.id === spettacolo);

  return (
    <main className="sc-pagina">
      <header className="sc-testa">
        <div className="sc-titolo"><span className="occhiello">{titolo}</span><strong>Ingresso</strong></div>
        <span />
        <button type="button" className="sc-presenze-btn" onClick={() => { setVedi('mancanti'); carica(); }}>Presenze</button>
      </header>

      {/* lo spettacolo che sta entrando: si controllano solo i suoi biglietti (gli altri chiedono conferma) */}
      <div className="sc-eventi" role="group" aria-label="Spettacolo che sta entrando">
        <button type="button" aria-pressed={!spettacolo} onClick={() => scegli('')}>Tutti</button>
        {spettacoli.map((s) => (
          <button key={s.id} type="button" aria-pressed={spettacolo === s.id} style={{ '--sc-col': coloreDi(s) }} onClick={() => scegli(s.id)}>
            <span className="sc-pallino" aria-hidden="true" />{oraSpettacolo(s.inizio)} {s.titolo}
          </button>
        ))}
      </div>

      <section className="sc-camera" style={sp ? { boxShadow: `0 0 0 4px ${coloreDi(sp)}` } : undefined}>
        <video ref={video} className="sc-video" playsInline muted hidden={camera !== 'accesa'} />
        <canvas ref={tela} hidden />
        {camera === 'accesa' && <div className="sc-mirino" aria-hidden="true" />}
        {camera !== 'accesa' && (
          <div className="sc-avvio">
            {camera === 'negata'
              ? <p>La fotocamera non si è aperta. Consenti l&apos;uso della fotocamera per questo sito (impostazioni del browser) e riprova.</p>
              : <p>Inquadra i QR dei biglietti uno dopo l&apos;altro: ognuno viene segnato sul registro una volta sola.</p>}
            <button type="button" className="sc-grande-btn" onClick={accendi} disabled={camera === 'avvio'}>{camera === 'avvio' ? 'Apro la fotocamera…' : '📷 Avvia la scansione'}</button>
          </div>
        )}
        {invio && <div className="sc-controllo">Controllo…</div>}
      </section>

      <div className="sc-sotto">
        {camera === 'accesa' && <p className="sc-istr">Inquadra il QR dentro il riquadro{sp ? ` · ${oraSpettacolo(sp.inizio)} ${sp.titolo}` : ''}</p>}
        <form className="sc-manuale" onSubmit={(e) => { e.preventDefault(); ultimo.current = { codice: '', quando: 0 }; controlla(testo); setTesto(''); }}>
          <input value={testo} onChange={(e) => setTesto(e.target.value.toUpperCase())} placeholder="Codice a mano (se il QR non si legge)" autoCapitalize="characters" autoComplete="off" aria-label="Codice del biglietto" />
          <button type="submit" disabled={!testo.trim()}>OK</button>
        </form>
        {camera === 'accesa' && <button type="button" className="link-btn piccolo" onClick={spegni}>spegni la fotocamera</button>}
      </div>

      {esito && esito.esito === 'altro_spettacolo' && (
        <div className="sc-esito attenzione" role="alertdialog" aria-live="assertive">
          <span className="sc-simbolo">!</span>
          <strong className="sc-scritta">ATTENZIONE</strong>
          <span className="sc-sottot">Biglietto dell&apos;evento <strong>«{esito.spettacolo}»</strong>{esito.inizio ? ` delle ${oraSpettacolo(esito.inizio)}` : ''}</span>
          {sp && <span className="sc-sottot">Stai controllando «{sp.titolo}»</span>}
          {esito.nome && <span className="sc-nome">{esito.nome}</span>}
          {esito.allievo && <span>per {esito.allievo}</span>}
          <strong className="sc-domanda">Lo accetti lo stesso?</strong>
          <div className="sc-scelta">
            <button type="button" className="sc-si" onClick={() => accetta(esito.letto)}>Sì, può entrare</button>
            <button type="button" className="sc-no" onClick={chiudiEsito}>No</button>
          </div>
        </div>
      )}
      {esito && esito.esito !== 'altro_spettacolo' && (
        <button type="button" className={`sc-esito ${classe}`} onClick={chiudiEsito} aria-live="assertive">
          <span className="sc-simbolo">{simbolo}</span>
          <strong className="sc-scritta">{esito.esito === 'errore' ? esito.messaggio : scritta}</strong>
          {sotto && esito.esito !== 'errore' && <span className="sc-sottot">{esito.accettato && esito.esito === 'ok' ? 'Accettato anche se di un altro spettacolo · registrato' : sotto}</span>}
          {esito.nome && <span className="sc-nome">{esito.nome}</span>}
          {/* l'evento del biglietto, col suo colore: ben visibile soprattutto se è un altro evento accettato */}
          {esito.spettacolo && (
            <span className={`sc-evento${esito.per_altro_evento ? ' altro' : ''}`} style={{ '--sc-col': esito.colore || coloreEvento(esito.n_evento) }}>
              {esito.per_altro_evento && esito.esito === 'ok' ? 'OK per ' : ''}«{esito.spettacolo}»{esito.inizio ? ` ${oraSpettacolo(esito.inizio)}` : ''}
            </span>
          )}
          {esito.allievo && <span>per {esito.allievo}</span>}
          {esito.prenotato_da && <span className="sc-sottot">prenotato da {esito.prenotato_da}{esito.prenotata_il ? ` il ${giorno(esito.prenotata_il)}` : ''}</span>}
          {(esito.extra_testo) && <span className="sc-extra">{esito.extra_testo}</span>}
          {esito.esito === 'gia_entrato' && esito.entrato_prima && <span className="sc-sottot">Entrato alle {ora(esito.entrato_prima)}</span>}
          {esito.esito === 'non_valido' && <span className="sc-sottot">{esito.stato === 'annullata' ? 'Prenotazione annullata' : 'Pagamento non ancora confermato'}</span>}
          {esito.attesi != null && <span className="sc-conta">Entrati {esito.entrati} su {esito.attesi}</span>}
          <span className="sc-tocca">tocca per continuare</span>
        </button>
      )}

      {presenze && (
        <section className="sc-pannello" role="dialog" aria-label="Presenze">
          <div className="sc-pannello-testa">
            <strong>Presenze{sp ? ` · ${oraSpettacolo(sp.inizio)} ${sp.titolo}` : ' · tutti gli spettacoli'}</strong>
            <button type="button" className="sc-chiudi" onClick={() => setPresenze(null)} aria-label="Chiudi">✕</button>
          </div>
          <div className="sc-eventi sc-eventi-pannello" role="group" aria-label="Spettacolo">
            <button type="button" aria-pressed={!spettacolo} onClick={() => scegli('')}>Tutti</button>
            {spettacoli.map((s) => (
              <button key={s.id} type="button" aria-pressed={spettacolo === s.id} style={{ '--sc-col': coloreDi(s) }} onClick={() => scegli(s.id)}>
                <span className="sc-pallino" aria-hidden="true" />{oraSpettacolo(s.inizio)} {s.titolo}
              </button>
            ))}
          </div>
          {presenze.errore ? <p className="errore">{presenze.errore}</p> : (
            <>
              <div className="sc-numeri">
                <button type="button" className={`sc-numero ok${vedi === 'dentro' ? ' attivo' : ''}`} onClick={() => setVedi('dentro')}>
                  <span>{presenze.entrati}</span>entrati</button>
                <button type="button" className={`sc-numero manca${vedi === 'mancanti' ? ' attivo' : ''}`} onClick={() => setVedi('mancanti')}>
                  <span>{presenze.attesi - presenze.entrati}</span>mancano</button>
                <div className="sc-numero tot"><span>{presenze.attesi}</span>attesi</div>
              </div>
              {/* con «Tutti» i numeri sono la somma: qui il dettaglio evento per evento */}
              {!spettacolo && (
                <table className="sc-perevento">
                  <thead><tr><th>Evento</th><th>Entrati</th><th>Mancano</th><th>Attesi</th></tr></thead>
                  <tbody>{spettacoli.map((s) => {
                    const den = presenze.dentro.filter((x) => x.spettacolo === s.titolo).length;
                    const man = presenze.mancanti.filter((x) => x.spettacolo === s.titolo).length;
                    return (
                      <tr key={s.id} onClick={() => scegli(s.id)}>
                        <td><span className="sc-pallino" style={{ '--sc-col': coloreDi(s) }} aria-hidden="true" /> {oraSpettacolo(s.inizio)} {s.titolo}</td>
                        <td className="ok">{den}</td><td className="manca">{man}</td><td>{den + man}</td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              )}
              {!spettacolo && <p className="piccolo muto">Stai vedendo tutti gli spettacoli insieme: tocca un evento qui sopra per vedere solo il suo.</p>}
              <button type="button" className="link-btn piccolo" onClick={() => carica()}>aggiorna</button>
              <ul className="sc-lista">
                {(vedi === 'mancanti' ? presenze.mancanti : presenze.dentro).map((x) => (
                  <li key={x.id}>
                    <span><strong>{x.nome}</strong><span className="piccolo muto"> · {x.allievo ? `per ${x.allievo} · ` : ''}{!sp ? `${x.spettacolo} · ` : ''}prenotato da {x.prenotato_da}{x.prenotata_il ? ` il ${giorno(x.prenotata_il)}` : ''}</span></span>
                    {vedi === 'mancanti'
                      ? <button type="button" className="btn btn-piccolo" onClick={() => segnaAMano(x)}>è entrato</button>
                      : <span className="piccolo">{ora(x.entrato_at)}</span>}
                  </li>
                ))}
                {(vedi === 'mancanti' ? presenze.mancanti : presenze.dentro).length === 0 && <li className="muto">{vedi === 'mancanti' ? 'Sono entrati tutti 🎉' : 'Nessuno è ancora entrato.'}</li>}
              </ul>
            </>
          )}
        </section>
      )}
    </main>
  );
}
