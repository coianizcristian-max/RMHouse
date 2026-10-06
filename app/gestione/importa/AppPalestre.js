'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { leggiClienti, leggiAbbonamenti, leggiPrenotazioni, leggiPagamenti } from '@/lib/appPalestre';
import { euro } from '@/lib/formato';

const BLOCCO_CLIENTI = 400;
const BLOCCO_STORICO = 2000;
const BLOCCO_PRENOTAZIONI = 3000;
const BLOCCO_PAGAMENTI = 200;

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
      <input ref={input} type="file" accept=".csv,text/csv" hidden
             onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );
}

const leggiFile = (file) => new Promise((ok, ko) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result));
  r.onerror = ko;
  r.readAsText(file, 'utf-8');
});

const oggi = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
const dataIt = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

export default function AppPalestre({ palestraId }) {
  const [clienti, setClienti] = useState(null);
  const [storico, setStorico] = useState(null);
  const [prenotazioni, setPrenotazioni] = useState(null);
  const [pagamenti, setPagamenti] = useState(null);
  const [errore, setErrore] = useState('');
  const [fase, setFase] = useState(null);          // { testo, fatto, totale }
  const [esito, setEsito] = useState(null);

  const LETTORI = { clienti: [leggiClienti, setClienti], storico: [leggiAbbonamenti, setStorico],
                    prenotazioni: [leggiPrenotazioni, setPrenotazioni], pagamenti: [leggiPagamenti, setPagamenti] };

  async function carica(file, tipo) {
    if (!file) return;
    setErrore(''); setEsito(null);
    try {
      const [leggi, metti] = LETTORI[tipo];
      const righe = leggi(await leggiFile(file));
      if (!righe.length) throw new Error('Il file sembra vuoto.');
      metti(righe);
    } catch (e) {
      setErrore(e.message || 'Non riesco a leggere il file.');
    }
  }

  function azzera() { setClienti(null); setStorico(null); setPrenotazioni(null); setPagamenti(null); setEsito(null); }

  async function importa() {
    setErrore(''); setEsito(null);
    const db = supabaseBrowser();
    const blocchi = (l, n) => Math.ceil((l?.length || 0) / n);
    const totale = blocchi(clienti, BLOCCO_CLIENTI) + blocchi(storico, BLOCCO_STORICO) + blocchi(prenotazioni, BLOCCO_PRENOTAZIONI)
      + blocchi(pagamenti, BLOCCO_PAGAMENTI) + 3;
    let passo = 0;
    const somma = { nuovi: 0, aggiornati: 0, storico: 0, senza_persona: 0, prenotazioni: 0,
                    pag_nuovi: 0, pag_gia: 0, ricevute: 0, pag_senza_persona: 0, storni: 0 };
    const chiama = async (fn, args) => {
      const { data, error } = await db.rpc(fn, args);
      if (error) throw error;
      passo++;
      return data;
    };

    try {
      setFase({ testo: 'Preparo l\'import', fatto: 0, totale });
      const imp = await chiama('importa_ap_inizia', { p_palestra: palestraId });

      for (let i = 0; i < clienti.length; i += BLOCCO_CLIENTI) {
        setFase({ testo: `Persone ${Math.min(i + BLOCCO_CLIENTI, clienti.length)} di ${clienti.length}`, fatto: passo, totale });
        const d = await chiama('importa_app_palestre_clienti', { p_palestra: palestraId, p_righe: clienti.slice(i, i + BLOCCO_CLIENTI) });
        somma.nuovi += d.nuovi; somma.aggiornati += d.aggiornati;
      }
      // lo storico si rifà solo per il periodo che c'è nel file: quello più vecchio resta
      const primoDal = storico?.reduce((m, r) => (r.dal && (!m || r.dal < m) ? r.dal : m), null) || null;
      // file con solo gli attivi: si aggiornano quelli, senza cancellare lo storico
      const soloAttivi = !!storico?.length && storico.every((r) => r.stato === 'attivo');
      const bloccoStorico = soloAttivi ? storico.length : BLOCCO_STORICO;   // gli attivi vanno in un colpo solo
      for (let i = 0; storico && i < storico.length; i += bloccoStorico) {
        setFase({ testo: `Abbonamenti ${Math.min(i + bloccoStorico, storico.length)} di ${storico.length}`, fatto: passo, totale });
        const d = await chiama('importa_app_palestre_storico', {
          p_palestra: palestraId, p_righe: storico.slice(i, i + bloccoStorico), p_azzera: i === 0, p_dal_da: primoDal, p_solo_attivi: soloAttivi,
        });
        somma.storico += d.righe; somma.senza_persona += d.senza_persona;
      }
      for (let i = 0; prenotazioni && i < prenotazioni.length; i += BLOCCO_PRENOTAZIONI) {
        setFase({ testo: `Prenotazioni ${Math.min(i + BLOCCO_PRENOTAZIONI, prenotazioni.length)} di ${prenotazioni.length}`, fatto: passo, totale });
        somma.prenotazioni += await chiama('importa_ap_prenotazioni', { p_imp: imp, p_righe: prenotazioni.slice(i, i + BLOCCO_PRENOTAZIONI) });
      }
      for (let i = 0; pagamenti && i < pagamenti.length; i += BLOCCO_PAGAMENTI) {
        setFase({ testo: `Pagamenti e ricevute ${Math.min(i + BLOCCO_PAGAMENTI, pagamenti.length)} di ${pagamenti.length}`, fatto: passo, totale });
        const d = await chiama('importa_ap_pagamenti', { p_imp: imp, p_righe: pagamenti.slice(i, i + BLOCCO_PAGAMENTI) });
        somma.pag_nuovi += d.nuovi; somma.pag_gia += d.gia; somma.ricevute += d.ricevute;
        somma.pag_senza_persona += d.senza_persona; somma.storni += d.storni;
      }
      setFase({ testo: 'Iscrizioni in corso, corsi e orari', fatto: passo, totale });
      const fine = await chiama('importa_ap_chiudi', { p_imp: imp });
      setFase({ testo: 'Controllo di tutti i dati', fatto: passo, totale });
      const anomalie = await chiama('importa_ap_anomalie', { p_imp: imp });
      setEsito({ ...somma, ...fine, aperte: anomalie.aperte });
    } catch (e) {
      console.error(e);
      setErrore('Import interrotto. Quello già caricato resta: puoi rilanciarlo, niente viene doppiato.');
    }
    setFase(null);
  }

  const conti = clienti && {
    persone: clienti.length,
    senzaEmail: clienti.filter((r) => !r.email).length,
    minori: clienti.filter((r) => r.intestatario).length,
  };
  const attivi = storico?.filter((r) => r.stato === 'attivo' && r.al >= oggi()).length || 0;
  const prenFuture = prenotazioni?.filter((r) => !r.cancellata && r.giorno.slice(0, 10) >= oggi()).length || 0;
  const incassato = pagamenti?.reduce((s, r) => s + (r.importo_cent || 0), 0) || 0;
  const dataPag = pagamenti?.map((r) => r.data_pag).filter(Boolean).sort();
  const numeri = pagamenti?.filter((r) => r.documento === 'ricevuta' && r.numero).map((r) => r.numero);
  const ultimoNumero = numeri?.length ? Math.max(...numeri) : null;

  return (
    <>
      <p className="muto" style={{ maxWidth: 780 }}>
        Da APP Palestre scarica i file e trascinali qui. Serve solo la lista clienti; con gli altri l'import fa molto di più.
        Si può rifare tutte le volte che serve: niente viene doppiato, e alla fine trovi l'elenco di quello che non torna
        in <Link prefetch={false} href="/gestione/da-sistemare">Da sistemare</Link>.
      </p>

      {errore && <div className="errore" role="alert">{errore}</div>}

      <div className="griglia-2" style={{ marginBottom: 18 }}>
        <ZonaFile titolo={clienti ? `1. Lista clienti · ${clienti.length} persone` : '1. Lista clienti'}
                  sotto="Clienti → seleziona tutti → Scarica CSV" pronto={!!clienti} onFile={(f) => carica(f, 'clienti')} />
        <ZonaFile titolo={storico ? `2. Lista abbonamenti · ${storico.length} righe` : '2. Lista abbonamenti'}
                  sotto="gli abbonamenti venduti: diventano storico e iscrizioni in corso" pronto={!!storico} onFile={(f) => carica(f, 'storico')} />
        <ZonaFile titolo={prenotazioni ? `3. Prenotazioni · ${prenotazioni.length} righe` : '3. Prenotazioni'}
                  sotto="dicono in che corso e a che orari va ognuno" pronto={!!prenotazioni} onFile={(f) => carica(f, 'prenotazioni')} />
        <ZonaFile titolo={pagamenti ? `4. Pagamenti clienti · ${pagamenti.length} righe` : '4. Pagamenti clienti'}
                  sotto="incassi e ricevute, con i numeri di APP Palestre" pronto={!!pagamenti} onFile={(f) => carica(f, 'pagamenti')} />
      </div>

      {conti && !esito && (
        <>
          <div className="griglia" style={{ marginBottom: 14 }}>
            <div className="tessera"><div className="etichetta">Persone</div><div className="cifra">{conti.persone}</div>
              <div className="sotto">{conti.minori} pagate da un genitore · {conti.senzaEmail} senza email</div></div>
            {storico && <div className="tessera"><div className="etichetta">Abbonamenti in corso</div><div className="cifra">{attivi}</div>
              <div className="sotto">su {storico.length} nel file</div></div>}
            {prenotazioni && <div className="tessera"><div className="etichetta">Prenotazioni da oggi</div><div className="cifra">{prenFuture}</div>
              <div className="sotto">servono per corso e orari</div></div>}
            {pagamenti && <div className="tessera"><div className="etichetta">Incassi</div><div className="cifra">{euro(incassato)}</div>
              <div className="sotto">{pagamenti.length} pagamenti dal {dataIt(dataPag[0])} al {dataIt(dataPag[dataPag.length - 1])}
                {ultimoNumero ? ` · ricevute fino al n. ${ultimoNumero}` : ''}</div></div>}
          </div>
          {storico?.length > 0 && storico.every((r) => r.stato === 'attivo') && (
            <p className="piccolo muto">La lista abbonamenti ha solo gli attivi: aggiorno quelli e lo storico già importato resta com'è.
              Per rifare anche lo storico, in APP Palestre scaricala con tutti gli stati (anche scaduti).</p>
          )}
          {!storico && (prenotazioni || pagamenti) && (
            <p className="piccolo muto">Senza la lista abbonamenti le iscrizioni in corso non si possono creare: le prenotazioni non verranno usate.</p>
          )}

          {fase ? (
            <div className="scheda" role="status">
              <strong>{fase.testo}…</strong>
              <div className="riempimento"><span style={{ width: `${Math.round((fase.fatto / fase.totale) * 100)}%` }} /></div>
              <p className="piccolo muto" style={{ marginTop: 6 }}>Non chiudere la pagina finché non ha finito.</p>
            </div>
          ) : (
            <div className="azioni">
              <button className="btn btn-primario" onClick={importa}>Importa</button>
              <button className="btn" onClick={azzera}>Annulla</button>
            </div>
          )}
        </>
      )}

      {esito && (
        <>
          <h2>Import completato</h2>
          <div className="griglia" style={{ marginBottom: 14 }}>
            <div className="tessera"><div className="etichetta">Persone</div><div className="cifra">{esito.nuovi + esito.aggiornati}</div>
              <div className="sotto">{esito.nuovi} nuove, {esito.aggiornati} aggiornate</div></div>
            {storico && <div className="tessera tessera-nera"><div className="etichetta">Iscrizioni in corso</div>
              <div className="cifra">{esito.nuove + esito.aggiornate}</div>
              <div className="sotto">{esito.nuove} nuove · {esito.con_orari} con corso e orari</div></div>}
            {pagamenti && <div className="tessera"><div className="etichetta">Pagamenti</div><div className="cifra">{esito.pag_nuovi}</div>
              <div className="sotto">{esito.ricevute} ricevute{esito.pag_gia ? ` · ${esito.pag_gia} c'erano già` : ''}</div></div>}
            <Link prefetch={false} className="tessera tessera-rossa" href="/gestione/da-sistemare">
              <div className="etichetta">Da sistemare</div><div className="cifra">{esito.aperte}</div>
              <div className="sotto">cose che non tornano, con cosa fare</div>
            </Link>
          </div>
          <p className="piccolo muto">Nessuna email automatica è partita per effetto dell'import.</p>
          <div className="azioni">
            <Link prefetch={false} className="btn btn-primario" href="/gestione/da-sistemare">Vai a Da sistemare</Link>
            <button className="btn" onClick={azzera}>Importa di nuovo</button>
          </div>
        </>
      )}
    </>
  );
}
