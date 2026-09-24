'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { leggiClienti, leggiAbbonamenti } from '@/lib/appPalestre';

const BLOCCO_CLIENTI = 400;
const BLOCCO_STORICO = 2000;

// Zona di caricamento: niente bottone di sistema, si tocca o si trascina il file
function ZonaFile({ titolo, sotto, pronto, onFile }) {
  const input = useRef(null);
  const [sopra, setSopra] = useState(false);
  return (
    <div className={`zona-foto${sopra ? ' sopra' : ''}`} role="button" tabIndex={0}
         onDragOver={(e) => { e.preventDefault(); setSopra(true); }}
         onDragLeave={() => setSopra(false)}
         onDrop={(e) => { e.preventDefault(); setSopra(false); onFile(e.dataTransfer.files?.[0]); }}
         onClick={() => input.current?.click()}
         onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') input.current?.click(); }}>
      <span className="miniatura segnaposto" aria-hidden="true">{pronto ? '✓' : 'CSV'}</span>
      <span className="zona-testo">
        <strong>{titolo}</strong>
        <span className="piccolo muto">{sotto}</span>
      </span>
      <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => onFile(e.target.files?.[0])} />
    </div>
  );
}

const leggiFile = (file) => new Promise((ok, ko) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result));
  r.onerror = ko;
  r.readAsText(file, 'utf-8');
});

export default function AppPalestre({ palestraId }) {
  const [clienti, setClienti] = useState(null);
  const [storico, setStorico] = useState(null);
  const [errore, setErrore] = useState('');
  const [fase, setFase] = useState(null);          // { testo, fatto, totale }
  const [esito, setEsito] = useState(null);

  async function carica(file, tipo) {
    if (!file) return;
    setErrore(''); setEsito(null);
    try {
      const testo = await leggiFile(file);
      if (tipo === 'clienti') setClienti(leggiClienti(testo));
      else setStorico(leggiAbbonamenti(testo));
    } catch (e) {
      setErrore(e.message || 'Non riesco a leggere il file.');
    }
  }

  async function importa() {
    setErrore(''); setEsito(null);
    const db = supabaseBrowser();
    const inizio = new Date(Date.now() - 60_000).toISOString();
    const totale = Math.ceil(clienti.length / BLOCCO_CLIENTI) + Math.ceil((storico?.length || 0) / BLOCCO_STORICO) + 1;
    let passo = 0;
    const somma = { nuovi: 0, aggiornati: 0, storico: 0, senza_persona: 0 };

    try {
      for (let i = 0; i < clienti.length; i += BLOCCO_CLIENTI) {
        setFase({ testo: `Persone ${Math.min(i + BLOCCO_CLIENTI, clienti.length)} di ${clienti.length}`, fatto: passo, totale });
        const { data, error } = await db.rpc('importa_app_palestre_clienti', {
          p_palestra: palestraId, p_righe: clienti.slice(i, i + BLOCCO_CLIENTI),
        });
        if (error) throw error;
        somma.nuovi += data.nuovi; somma.aggiornati += data.aggiornati;
        passo++;
      }
      for (let i = 0; storico && i < storico.length; i += BLOCCO_STORICO) {
        setFase({ testo: `Abbonamenti ${Math.min(i + BLOCCO_STORICO, storico.length)} di ${storico.length}`, fatto: passo, totale });
        const { data, error } = await db.rpc('importa_app_palestre_storico', {
          p_palestra: palestraId, p_righe: storico.slice(i, i + BLOCCO_STORICO), p_azzera: i === 0,
        });
        if (error) throw error;
        somma.storico += data.righe; somma.senza_persona += data.senza_persona;
        passo++;
      }
      setFase({ testo: 'Abbonamenti in corso e controlli finali', fatto: passo, totale });
      const { data: fine, error } = await db.rpc('importa_app_palestre_chiudi', { p_palestra: palestraId, p_dal: inizio });
      if (error) throw error;
      setEsito({ ...somma, ...fine });
    } catch (e) {
      console.error(e);
      setErrore('Import interrotto. Quello già caricato resta: puoi rilanciarlo, chi c\'è già viene aggiornato e non duplicato.');
    }
    setFase(null);
  }

  const conti = clienti && {
    persone: clienti.length,
    senzaEmail: clienti.filter((r) => !r.email).length,
    senzaNascita: clienti.filter((r) => !r.nascita).length,
    minori: clienti.filter((r) => r.intestatario).length,
  };
  const attivi = storico?.filter((r) => r.stato === 'attivo').length || 0;

  return (
    <>
      <p className="muto" style={{ maxWidth: 760 }}>
        Da APP Palestre scarica la <strong>lista clienti</strong> e la <strong>lista abbonamenti</strong> (Clienti → seleziona
        tutti → Scarica CSV) e trascinale qui. Puoi ripetere l'import tutte le volte che vuoi: chi è già presente viene
        aggiornato, non duplicato, e lo storico degli abbonamenti viene rifatto da capo.
      </p>

      {errore && <div className="errore" role="alert">{errore}</div>}

      <div className="griglia-2" style={{ marginBottom: 18 }}>
        <ZonaFile titolo={clienti ? `Lista clienti · ${clienti.length} persone` : 'Lista clienti'}
                  sotto="lista-clienti-….csv" pronto={!!clienti} onFile={(f) => carica(f, 'clienti')} />
        <ZonaFile titolo={storico ? `Lista abbonamenti · ${storico.length} righe` : 'Lista abbonamenti (facoltativa)'}
                  sotto="lista-abbonamenti-….csv" pronto={!!storico} onFile={(f) => carica(f, 'storico')} />
      </div>

      {conti && !esito && (
        <>
          <div className="griglia" style={{ marginBottom: 14 }}>
            <div className="tessera"><div className="etichetta">Persone</div><div className="cifra">{conti.persone}</div></div>
            <div className="tessera"><div className="etichetta">Pagate da un genitore</div><div className="cifra">{conti.minori}</div></div>
            <div className="tessera"><div className="etichetta">Senza email</div><div className="cifra">{conti.senzaEmail}</div>
              <div className="sotto">entrano, ma non ricevono messaggi</div></div>
            <div className="tessera"><div className="etichetta">Senza data di nascita</div><div className="cifra">{conti.senzaNascita}</div>
              <div className="sotto">anche dal codice fiscale</div></div>
            {storico && <div className="tessera"><div className="etichetta">Abbonamenti in corso</div><div className="cifra">{attivi}</div>
              <div className="sotto">su {storico.length} dal 2019</div></div>}
          </div>

          {fase ? (
            <div className="scheda">
              <strong>{fase.testo}…</strong>
              <div className="riempimento"><span style={{ width: `${Math.round((fase.fatto / fase.totale) * 100)}%` }} /></div>
              <p className="piccolo muto" style={{ marginTop: 6 }}>Non chiudere la pagina finché non ha finito.</p>
            </div>
          ) : (
            <div className="azioni">
              <button className="btn btn-primario" onClick={importa}>
                Importa {conti.persone} persone{storico ? ` e ${storico.length} abbonamenti` : ''}
              </button>
              <button className="btn" onClick={() => { setClienti(null); setStorico(null); }}>Annulla</button>
            </div>
          )}
        </>
      )}

      {esito && (
        <>
          <h2>Import completato</h2>
          <div className="griglia" style={{ marginBottom: 14 }}>
            <div className="tessera tessera-nera"><div className="etichetta">Persone nuove</div><div className="cifra">{esito.nuovi}</div></div>
            <div className="tessera"><div className="etichetta">Già presenti, aggiornate</div><div className="cifra">{esito.aggiornati}</div></div>
            <div className="tessera"><div className="etichetta">Abbonamenti nello storico</div><div className="cifra">{esito.storico}</div></div>
            <div className="tessera tessera-rossa"><div className="etichetta">Iscrizioni in corso create</div><div className="cifra">{esito.iscrizioni}</div></div>
          </div>
          <div className="scheda" style={{ marginBottom: 14 }}>
            <strong>Da controllare</strong>
            <p className="piccolo" style={{ marginTop: 4 }}>
              APP Palestre non dice in quale corso è ogni persona: le iscrizioni in corso sono state messe nel corso più adatto
              tra quelli che l'abbonamento copre, e senza orari. Controllale dalla scheda della persona o del corso e assegna i giorni.
            </p>
            {esito.senza_persona > 0 && (
              <p className="piccolo muto">{esito.senza_persona} righe di abbonamento non corrispondono a nessuna persona della lista clienti.</p>
            )}
            {esito.non_abbinati?.length > 0 && (
              <p className="piccolo muto">
                Abbonamenti in corso che non esistono tra i nostri, quindi solo nello storico:{' '}
                {esito.non_abbinati.map((x) => `${x.abbonamento} (${x.quanti})`).join(', ')}.
              </p>
            )}
            <p className="piccolo muto">Nessuna email automatica è partita per effetto dell'import.</p>
          </div>
          <div className="azioni">
            <Link className="btn btn-primario" href="/gestione/persone">Vai alle persone</Link>
            <button className="btn" onClick={() => { setEsito(null); setClienti(null); setStorico(null); }}>Importa di nuovo</button>
          </div>
        </>
      )}
    </>
  );
}
