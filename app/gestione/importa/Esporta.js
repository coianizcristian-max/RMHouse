'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { scaricaCsv } from '@/lib/stati';

const oggi = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
const meseDopo = (iso) => { const [a, m] = iso.split('-').map(Number); return new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 10); };
const fineMese = (iso) => { const d = new Date(`${meseDopo(iso)}T00:00:00Z`); d.setUTCDate(0); return d.toISOString().slice(0, 10); };
const inizioMese = (iso) => `${iso.slice(0, 7)}-01`;

// i periodi lunghi si chiedono un mese alla volta (ogni richiesta resta leggera)
function aMesi(dal, al) {
  const pezzi = [];
  for (let d = dal; d <= al; d = meseDopo(d)) {     // meseDopo dà il 1° del mese seguente
    pezzi.push([d, fineMese(d) < al ? fineMese(d) : al]);
  }
  return pezzi;
}

const ELENCHI = [
  { k: 'clienti', titolo: 'Lista clienti', fn: 'esporta_clienti', file: 'lista-clienti',
    sotto: 'Tutte le persone con contatti, dati anagrafici, codice fiscale, chi paga, certificato, abbonamenti attivi e consensi.' },
  { k: 'abbonamenti', titolo: 'Lista abbonamenti', fn: 'esporta_abbonamenti', file: 'lista-abbonamenti',
    sotto: 'Ogni abbonamento venduto, con date, stato, valore, corso e orari; compreso lo storico arrivato da APP Palestre.' },
  { k: 'prenotazioni', titolo: 'Prenotazioni', fn: 'esporta_prenotazioni', file: 'prenotazioni', periodo: true,
    sotto: 'Chi è atteso a ogni lezione del periodo (orario fisso, recuperi, ingressi, prove), con presenze e assenze avvisate.' },
  { k: 'pagamenti', titolo: 'Pagamenti clienti', fn: 'esporta_pagamenti', file: 'pagamenti-clienti', periodo: true,
    sotto: 'Ogni incasso con la sua ricevuta (numero, data, metodo, intestatario) e le note di credito.' },
];

export default function Esporta({ palestraId }) {
  const [periodi, setPeriodi] = useState({
    prenotazioni: { dal: inizioMese(oggi()), al: fineMese(meseDopo(oggi())) },
    pagamenti: { dal: `${oggi().slice(0, 4)}-01-01`, al: oggi() },
  });
  const [lavoro, setLavoro] = useState('');     // testo di avanzamento
  const [esiti, setEsiti] = useState({});       // k → "123 righe"
  const [errore, setErrore] = useState('');

  const cambiaPeriodo = (k, campo, v) => setPeriodi((p) => ({ ...p, [k]: { ...p[k], [campo]: v } }));

  async function scarica(el) {
    const db = supabaseBrowser();
    let righe = [];
    if (el.periodo) {
      const { dal, al } = periodi[el.k];
      if (!dal || !al || dal > al) throw new Error('Controlla il periodo: la data di inizio deve venire prima della fine.');
      const mesi = aMesi(dal, al);
      for (let i = 0; i < mesi.length; i++) {
        setLavoro(`${el.titolo}: mese ${i + 1} di ${mesi.length}`);
        const { data, error } = await db.rpc(el.fn, { p_palestra: palestraId, p_dal: mesi[i][0], p_al: mesi[i][1] });
        if (error) throw error;
        righe = righe.concat(data || []);
      }
    } else {
      setLavoro(`${el.titolo}…`);
      const { data, error } = await db.rpc(el.fn, { p_palestra: palestraId });
      if (error) throw error;
      righe = data || [];
    }
    const intestazioni = righe.length ? Object.keys(righe[0]) : ['Nessun dato'];
    const suffisso = el.periodo ? `${periodi[el.k].dal}_${periodi[el.k].al}` : oggi();
    scaricaCsv(`${el.file}-${suffisso}.csv`, intestazioni, righe.map((r) => intestazioni.map((h) => r[h])));
    setEsiti((e) => ({ ...e, [el.k]: righe.length }));
  }

  async function avvia(elenco) {
    setErrore('');
    try {
      for (const el of elenco) await scarica(el);
    } catch (e) {
      console.error(e);
      setErrore(e.message?.startsWith('Controlla') ? e.message : 'Esportazione non riuscita: riprova tra poco.');
    }
    setLavoro('');
  }

  return (
    <>
      <p className="muto" style={{ maxWidth: 780 }}>
        Gli stessi quattro elenchi di APP Palestre, presi da RMHouse: con le stesse colonne, così si aprono in Excel, si possono dare
        a un altro gestionale o al commercialista, e si possono anche reimportare qui.
      </p>
      {errore && <div className="errore" role="alert">{errore}</div>}

      <div className="griglia-2 esporta-elenchi" style={{ marginBottom: 16 }}>
        {ELENCHI.map((el) => (
          <div key={el.k} className="scheda esporta-voce">
            <strong>{el.titolo}</strong>
            <p className="piccolo muto">{el.sotto}</p>
            {el.periodo && (
              <div className="esporta-periodo">
                <label className="piccolo">dal
                  <input type="date" value={periodi[el.k].dal} onChange={(e) => cambiaPeriodo(el.k, 'dal', e.target.value)} />
                </label>
                <label className="piccolo">al
                  <input type="date" value={periodi[el.k].al} onChange={(e) => cambiaPeriodo(el.k, 'al', e.target.value)} />
                </label>
              </div>
            )}
            <div className="in-riga">
              <button className="btn" disabled={!!lavoro} onClick={() => avvia([el])}>Scarica CSV</button>
              {esiti[el.k] != null && <span className="piccolo muto">scaricato · {esiti[el.k]} righe</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="azioni">
        <button className="btn btn-primario" disabled={!!lavoro} onClick={() => avvia(ELENCHI)}>Scarica tutti e quattro</button>
        {lavoro && <span className="piccolo" role="status">{lavoro}</span>}
      </div>
    </>
  );
}
