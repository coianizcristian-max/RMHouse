'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { leggiClienti, leggiAbbonamenti, leggiPrenotazioni, leggiPagamenti, leggiVendite, leggiProdotti } from '@/lib/appPalestre';
import { euro } from '@/lib/formato';

const BLOCCO_CLIENTI = 400;
const BLOCCO_STORICO = 2000;
const BLOCCO_PRENOTAZIONI = 3000;
const BLOCCO_PAGAMENTI = 200;
const BLOCCO_VENDITE = 500;

// I sei file di APP Palestre: cosa sono e dove si scaricano in app titolare
const FILE = [
  { k: 'clienti', titolo: 'Lista clienti', nomeFile: 'lista-clienti-….csv', sotto: 'le persone',
    dove: ['Clienti', 'seleziona tutti', 'Scarica clienti'] },
  { k: 'storico', titolo: 'Lista abbonamenti', nomeFile: 'lista-abbonamenti-….csv',
    sotto: 'gli abbonamenti venduti (anche solo gli attivi): diventano iscrizioni in corso',
    dove: ['Abbonamenti', 'Scadenze abbonamenti', 'seleziona tutti', 'Scarica abbonamenti'] },
  { k: 'prenotazioni', titolo: 'Prenotazioni', nomeFile: 'file_csv_115_del_….csv', sotto: 'dicono in che corso e a che orari va ognuno',
    dove: ['Prenotazioni', 'scegli il periodo (meglio tutta la stagione)', 'Scarica'] },
  { k: 'pagamenti', titolo: 'Pagamenti clienti', nomeFile: 'pagamenti_clienti_….csv',
    sotto: 'incassi e ricevute, con i numeri di APP Palestre (meglio dal 1° gennaio)',
    dove: ['Fatture/ricevute', 'Pagamenti ricevuti', 'Scarica'] },
  { k: 'vendite', titolo: 'Vendite (acquisti clienti)', nomeFile: 'acquisti_clienti_….csv',
    sotto: 'cosa è stato venduto e a quanto: venduto non pagato, quote annuali, prezzi fatti',
    dove: ['Fatture/ricevute', 'Vendite', 'Scarica'] },
  { k: 'prodotti', titolo: 'Prodotti (listino)', nomeFile: 'lista_prodotti_….csv',
    sotto: 'il listino di APP Palestre: prezzi e IVA da confrontare con quelli di RMHouse',
    dove: ['Fatture/ricevute', 'Prodotti', 'Scarica'] },
];

// Zona di caricamento: niente bottone di sistema, si tocca o si trascina il file
function ZonaFile({ titolo, nomeFile, sotto, caricato, onFile }) {
  const input = useRef(null);
  const [sopra, setSopra] = useState(false);
  return (
    <div className={`zona-foto${sopra ? ' sopra' : ''}`} role="button" tabIndex={0}
         onDragOver={(e) => { e.preventDefault(); setSopra(true); }}
         onDragLeave={() => setSopra(false)}
         onDrop={(e) => { e.preventDefault(); setSopra(false); onFile(e.dataTransfer.files?.[0]); }}
         onClick={() => input.current?.click()}
         onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') input.current?.click(); }}>
      <span className="miniatura segnaposto" aria-hidden="true">{caricato ? '✓' : 'CSV'}</span>
      <span className="zona-testo">
        <strong>{titolo}</strong>
        {caricato
          ? <span className="piccolo zona-file">caricato: {caricato}</span>
          : <span className="piccolo zona-file">il file si chiama <b>{nomeFile}</b></span>}
        <span className="piccolo muto">{sotto}</span>
      </span>
      <input ref={input} type="file" accept=".csv,text/csv" hidden
             onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );
}

// "Dove si scarica": i passi in app titolare
function Dove({ passi }) {
  return (
    <p className="imp-dove">
      <span className="imp-dove-et">Dove si scarica:</span>
      <span className="imp-passo">app titolare</span>
      {/* tra un passo e l'altro c'è uno spazio: la riga va a capo lì, mai a metà di un passo corto */}
      {passi.map((p) => <span key={p}>{' '}<i aria-hidden="true">›</i>{' '}<span className={p.length <= 24 ? 'imp-passo' : undefined}>{p}</span></span>)}
    </p>
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
const norm = (t) => String(t || '').replace(/\s+/g, ' ').trim().toLowerCase();

export default function AppPalestre({ palestraId, meseStagione = 9 }) {
  const [file, setFile] = useState({});              // { clienti: [...], storico: [...], ... }
  const [errore, setErrore] = useState('');
  const [nomi, setNomi] = useState({});              // il nome dei file caricati
  const [fase, setFase] = useState(null);            // { testo, fatto, totale }
  const [esito, setEsito] = useState(null);
  const { clienti, storico, prenotazioni, pagamenti, vendite, prodotti } = file;

  const LETTORI = { clienti: leggiClienti, storico: leggiAbbonamenti, prenotazioni: leggiPrenotazioni,
                    pagamenti: leggiPagamenti, vendite: leggiVendite, prodotti: leggiProdotti };

  // il file si riconosce dalle colonne: se finisce nel riquadro sbagliato va lo stesso in quello giusto
  async function carica(f, tipo) {
    if (!f) return;
    setErrore(''); setEsito(null);
    let testo;
    try { testo = await leggiFile(f); } catch { setErrore('Non riesco a leggere il file.'); return; }
    const ordine = [tipo, ...Object.keys(LETTORI).filter((k) => k !== tipo)];
    for (const k of ordine) {
      try {
        const righe = LETTORI[k](testo);
        if (!righe.length) { setErrore('Il file sembra vuoto.'); return; }
        setFile((x) => ({ ...x, [k]: righe }));
        setNomi((n) => ({ ...n, [k]: f.name }));
        return;
      } catch { /* non è questo: si prova il prossimo */ }
    }
    setErrore(`"${f.name}" non sembra uno dei sei file di APP Palestre: controlla di aver scaricato quello giusto (sotto ogni riquadro c'è dove si scarica).`);
  }

  function azzera() { setFile({}); setEsito(null); setNomi({}); }

  async function importa() {
    setErrore(''); setEsito(null);
    const db = supabaseBrowser();
    const blocchi = (l, n) => Math.ceil((l?.length || 0) / n);
    const totale = blocchi(clienti, BLOCCO_CLIENTI) + blocchi(storico, BLOCCO_STORICO) + blocchi(prenotazioni, BLOCCO_PRENOTAZIONI)
      + blocchi(pagamenti, BLOCCO_PAGAMENTI) + blocchi(vendite, BLOCCO_VENDITE) + (prodotti ? 1 : 0) + 3;
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

      for (let i = 0; clienti && i < clienti.length; i += BLOCCO_CLIENTI) {
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
      // il listino prima delle vendite: serve a dividere le righe "abbonamento + quota annuale"
      if (prodotti) {
        setFase({ testo: `Listino: ${prodotti.length} prodotti`, fatto: passo, totale });
        await chiama('importa_ap_listino', { p_imp: imp, p_righe: prodotti });
      }
      for (let i = 0; vendite && i < vendite.length; i += BLOCCO_VENDITE) {
        setFase({ testo: `Vendite ${Math.min(i + BLOCCO_VENDITE, vendite.length)} di ${vendite.length}`, fatto: passo, totale });
        await chiama('importa_ap_vendite', { p_imp: imp, p_righe: vendite.slice(i, i + BLOCCO_VENDITE), p_azzera: i === 0 });
      }
      setFase({ testo: 'Iscrizioni in corso, corsi e orari', fatto: passo, totale });
      const fine = await chiama('importa_ap_chiudi', { p_imp: imp });
      setFase({ testo: 'Controllo di tutti i dati', fatto: passo, totale });
      const anomalie = await chiama('importa_ap_anomalie', { p_imp: imp });
      // i conti di vendite e listino li scrive il controllo finale
      const { data: imRiga } = await db.from('importazioni').select('riepilogo').eq('id', imp).maybeSingle();
      setEsito({ ...somma, ...fine, aperte: anomalie.aperte, vendite: imRiga?.riepilogo?.vendite || null, listino: imRiga?.riepilogo?.listino || null });
    } catch (e) {
      console.error(e);
      setErrore('Import interrotto. Quello già caricato resta: puoi rilanciarlo, niente viene doppiato.');
    }
    setFase(null);
  }

  const caricati = Object.keys(file).length > 0;
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

  // vendite: una riga del file può avere più voci (contano una volta)
  const righeVendite = vendite?.filter((r) => r.parte === 0) || [];
  const venduto = righeVendite.reduce((s, r) => s + (r.importo_cent || 0), 0);
  const dateVendite = righeVendite.map((r) => r.data).filter(Boolean).sort();
  const quoteVendute = vendite?.filter((r) => norm(r.voce).startsWith('iscrizione annuale')).length || 0;
  // con il listino: quante vendite di questa stagione (di una voce sola) sono sotto il prezzo di listino di APP Palestre
  // (le stagioni passate no: avevano altri prezzi)
  const [aa, mm] = oggi().split('-').map(Number);
  const inizioStagione = `${mm >= meseStagione ? aa : aa - 1}-${String(meseStagione).padStart(2, '0')}-01`;
  const prezzoListino = new Map();
  for (const p of prodotti || []) if (p.prezzo_cent > 0 && !prezzoListino.has(norm(p.nome))) prezzoListino.set(norm(p.nome), p.prezzo_cent);
  const sotto = (vendite || []).filter((r) => r.parti === 1 && r.importo_cent > 0 && (r.dal || r.data) >= inizioStagione
    && prezzoListino.get(norm(r.voce)) > r.importo_cent);
  const sconti = sotto.reduce((s, r) => s + prezzoListino.get(norm(r.voce)) - r.importo_cent, 0);
  const categorie = prodotti ? [...new Set(prodotti.map((p) => p.categoria).filter(Boolean))] : [];
  const nonAbbonamenti = prodotti?.filter((p) => p.categoria && p.categoria !== 'Abbonamenti').length || 0;

  return (
    <>
      <p className="muto" style={{ maxWidth: 780 }}>
        Da app titolare (APP Palestre) scarica i file e trascinali qui: sotto ogni riquadro c&apos;è dove si scarica. Meglio scaricarli
        tutti lo stesso giorno, così vendite e pagamenti tornano. La prima volta serve la lista clienti; dopo puoi caricare anche solo
        alcuni file. Si può rifare tutte le volte che serve: niente viene doppiato, e alla fine trovi l&apos;elenco di quello che non torna
        in <Link prefetch={false} href="/gestione/da-sistemare">Da sistemare</Link>.
      </p>

      {errore && <div className="errore" role="alert">{errore}</div>}

      <div className="griglia-2 imp-file-griglia" style={{ marginBottom: 18 }}>
        {FILE.map((f, i) => {
          const righe = file[f.k];
          const quante = f.k === 'vendite' ? righeVendite.length : righe?.length;
          const unita = { clienti: 'persone', storico: 'righe', prenotazioni: 'righe', pagamenti: 'righe', vendite: 'vendite', prodotti: 'prodotti' }[f.k];
          return (
            <div key={f.k} className="imp-file">
              <ZonaFile titolo={`${i + 1}. ${f.titolo}${righe ? ` · ${quante} ${unita}` : ''}`}
                        nomeFile={f.nomeFile} caricato={righe && nomi[f.k]}
                        sotto={f.k === 'clienti' ? `${f.sotto}: obbligatoria la prima volta` : f.sotto} onFile={(x) => carica(x, f.k)} />
              <Dove passi={f.dove} />
            </div>
          );
        })}
      </div>

      {caricati && !esito && (
        <>
          <div className="griglia imp-tessere" style={{ marginBottom: 14 }}>
            {conti && <div className="tessera"><div className="etichetta">Persone</div><div className="cifra">{conti.persone}</div>
              <div className="sotto">{conti.minori} pagate da un genitore · {conti.senzaEmail} senza email</div></div>}
            {storico && <div className="tessera"><div className="etichetta">Abbonamenti in corso</div><div className="cifra">{attivi}</div>
              <div className="sotto">su {storico.length} nel file</div></div>}
            {prenotazioni && <div className="tessera"><div className="etichetta">Prenotazioni da oggi</div><div className="cifra">{prenFuture}</div>
              <div className="sotto">servono per corso e orari</div></div>}
            {pagamenti && <div className="tessera"><div className="etichetta">Incassi</div><div className="cifra">{euro(incassato)}</div>
              <div className="sotto">{pagamenti.length} pagamenti dal {dataIt(dataPag[0])} al {dataIt(dataPag[dataPag.length - 1])}
                {ultimoNumero ? ` · ricevute fino al n. ${ultimoNumero}` : ''}</div></div>}
            {vendite && <div className="tessera"><div className="etichetta">Venduto</div><div className="cifra">{euro(venduto)}</div>
              <div className="sotto">{righeVendite.length} vendite dal {dataIt(dateVendite[0])} al {dataIt(dateVendite[dateVendite.length - 1])}
                {quoteVendute ? ` · ${quoteVendute} quote annuali` : ''}
                {prodotti && sotto.length ? ` · in questa stagione ${sotto.length} sotto il listino (−${euro(sconti)}: sconti o mesi iniziati a metà)` : ''}</div></div>}
            {prodotti && <div className="tessera"><div className="etichetta">Listino di APP Palestre</div><div className="cifra">{prodotti.length}</div>
              <div className="sotto">prodotti{nonAbbonamenti ? ` · ${nonAbbonamenti} non abbonamenti (${categorie.filter((c) => c !== 'Abbonamenti').join(', ')})` : ''}</div></div>}
          </div>
          {storico?.length > 0 && storico.every((r) => r.stato === 'attivo') && (
            <p className="piccolo muto">La lista abbonamenti ha solo gli attivi: aggiorno quelli e lo storico già importato resta com&apos;è.
              Per rifare anche lo storico, in APP Palestre scaricala con tutti gli stati (anche scaduti).</p>
          )}
          {!storico && prenotazioni && (
            <p className="piccolo muto">Senza la lista abbonamenti le prenotazioni servono solo per gli abbonamenti già importati.</p>
          )}
          {vendite && !pagamenti && (
            <p className="piccolo muto">Con le vendite carica anche i pagamenti dello stesso giorno: senza, uso quelli già importati
              e quello che è stato venduto dopo non si può controllare.</p>
          )}
          {!clienti && (
            <p className="piccolo muto">Senza la lista clienti uso le persone già in RMHouse.</p>
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
          <div className="griglia imp-tessere" style={{ marginBottom: 14 }}>
            {clienti && <div className="tessera"><div className="etichetta">Persone</div><div className="cifra">{esito.nuovi + esito.aggiornati}</div>
              <div className="sotto">{esito.nuovi} nuove, {esito.aggiornati} aggiornate</div></div>}
            {storico && <div className="tessera tessera-nera"><div className="etichetta">Iscrizioni in corso</div>
              <div className="cifra">{esito.nuove + esito.aggiornate}</div>
              <div className="sotto">{esito.nuove} nuove · {esito.con_orari} con corso e orari</div></div>}
            {pagamenti && <div className="tessera"><div className="etichetta">Pagamenti</div><div className="cifra">{esito.pag_nuovi}</div>
              <div className="sotto">{esito.ricevute} ricevute{esito.pag_gia ? ` · ${esito.pag_gia} c'erano già` : ''}</div></div>}
            {esito.vendite?.vendite > 0 && (
              <div className="tessera"><div className="etichetta">Vendite controllate</div><div className="cifra">{esito.vendite.vendite}</div>
                <div className="sotto">{esito.vendite.pagate} pagate
                  {esito.vendite.non_pagate ? ` · ${esito.vendite.non_pagate} non pagate` : ''}
                  {esito.vendite.diverse ? ` · ${esito.vendite.diverse} pagate diverse` : ''}
                  {esito.vendite.quote_nuove ? ` · ${esito.vendite.quote_nuove} quote annuali registrate` : ''}</div></div>
            )}
            {esito.listino?.prodotti > 0 && (
              <div className="tessera"><div className="etichetta">Listino confrontato</div><div className="cifra">{esito.listino.abbinati}</div>
                <div className="sotto">abbonamenti abbinati su {esito.listino.prodotti} prodotti
                  {esito.listino.prezzi_diversi ? ` · ${esito.listino.prezzi_diversi} prezzi diversi` : ''}
                  {esito.listino.iva_diverse ? ` · ${esito.listino.iva_diverse} IVA diverse` : ''}</div></div>
            )}
            <Link prefetch={false} className="tessera tessera-rossa" href="/gestione/da-sistemare">
              <div className="etichetta">Da sistemare</div><div className="cifra">{esito.aperte}</div>
              <div className="sotto">cose che non tornano, con cosa fare</div>
            </Link>
          </div>
          <p className="piccolo muto">Nessuna email automatica è partita per effetto dell&apos;import.</p>
          <div className="azioni">
            <Link prefetch={false} className="btn btn-primario" href="/gestione/da-sistemare">Vai a Da sistemare</Link>
            <button className="btn" onClick={azzera}>Importa di nuovo</button>
          </div>
        </>
      )}
    </>
  );
}
