'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { dataBreve, euro, oggiISO } from '@/lib/formato';

const ERRORI = {
  ha_presenze: 'Ha già delle presenze registrate: non si può eliminare. Puoi annullarla.',
  ha_ingressi_usati: 'Ha già usato degli ingressi: non si può eliminare. Puoi annullarla.',
  collegata_ad_altri_dati: 'È collegata ad altri dati (ricevute, acquisti online): non si può eliminare. Puoi annullarla.',
  iscrizione_gia_attiva: 'Con queste date si sovrappone a un\'altra iscrizione allo stesso corso.',
  date_non_valide: 'La fine viene prima dell\'inizio.',
  sconto_non_valido: 'Lo sconto non può superare il prezzo dell\'abbonamento.',
  tipo_non_valido: 'Scegli un abbonamento valido.',
  gia_annullata: 'È già annullata.',
  importo_non_valido: 'L\'importo della nota di credito supera quanto resta della ricevuta.',
  non_autorizzato: 'Non hai i permessi per questa operazione.',
};
const messaggio = (e) => ERRORI[Object.keys(ERRORI).find((k) => e?.message?.includes(k))] || 'Operazione non riuscita. Riprova.';
const inEuro = (cent) => ((cent || 0) / 100).toFixed(2).replace('.', ',');
const daEuro = (testo) => Math.round(parseFloat(String(testo || '0').replace(',', '.')) * 100) || 0;

// Il pannello che si apre sotto un'iscrizione: una sola azione alla volta
export default function AzioniIscrizione({ iscrizione, tipi, modo, chiudi }) {
  if (modo === 'modifica') return <Modifica iscrizione={iscrizione} tipi={tipi} chiudi={chiudi} />;
  if (modo === 'sospendi') return <Sospendi iscrizione={iscrizione} chiudi={chiudi} />;
  return <AnnullaElimina iscrizione={iscrizione} elimina={modo === 'elimina'} chiudi={chiudi} />;
}

function Modifica({ iscrizione, tipi, chiudi }) {
  const router = useRouter();
  const tipoAttuale = tipi.find((t) => t.id === iscrizione.tipo_abbonamento_id);
  const elenco = tipoAttuale ? tipi : [iscrizione.tipi_abbonamento && { ...iscrizione.tipi_abbonamento, id: iscrizione.tipo_abbonamento_id }, ...tipi].filter(Boolean);
  const [f, setF] = useState({
    tipo: iscrizione.tipo_abbonamento_id, inizio: iscrizione.data_inizio, fine: iscrizione.data_fine || '',
    prezzo: inEuro((iscrizione.tipi_abbonamento?.prezzo_cent || 0) - (iscrizione.sconto_cent || 0)),
    note: iscrizione.note || '',
  });
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const tipo = elenco.find((t) => t.id === f.tipo);
  const listino = tipo?.prezzo_cent || 0;
  const sconto = Math.max(listino - daEuro(f.prezzo), 0);

  // cambiando abbonamento o inizio, la fine si ricalcola da sola
  function cambia(k, v) {
    setF((s) => {
      const n = { ...s, [k]: v };
      if (k === 'tipo' || k === 'inizio') n.fine = '';
      if (k === 'tipo') n.prezzo = inEuro(elenco.find((t) => t.id === v)?.prezzo_cent || 0);
      return n;
    });
  }

  async function salva() {
    if (daEuro(f.prezzo) > listino) { setErrore(`Il prezzo non può superare il listino (${euro(listino)}).`); return; }
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().rpc('modifica_iscrizione', { p_iscrizione: iscrizione.id, p: {
      tipo_abbonamento_id: f.tipo, data_inizio: f.inizio, data_fine: f.fine || null, sconto_cent: sconto, note: f.note,
    } });
    setInvio(false);
    if (error) { setErrore(messaggio(error)); return; }
    chiudi(); router.refresh();
  }

  return (
    <div className="azione-iscrizione">
      <strong className="ai-titolo">Modifica iscrizione</strong>
      {errore && <div className="errore" role="alert">{errore}</div>}
      <div className="campo">
        <label htmlFor={`t-${iscrizione.id}`}>Abbonamento</label>
        <select id={`t-${iscrizione.id}`} value={f.tipo} onChange={(e) => cambia('tipo', e.target.value)}>
          {elenco.map((t) => <option key={t.id} value={t.id}>{t.nome} — {euro(t.prezzo_cent)}</option>)}
        </select>
      </div>
      <div className="ai-griglia">
        <div className="campo">
          <label htmlFor={`i-${iscrizione.id}`}>Inizio</label>
          <input id={`i-${iscrizione.id}`} type="date" value={f.inizio} onChange={(e) => cambia('inizio', e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor={`f-${iscrizione.id}`}>Fine</label>
          <input id={`f-${iscrizione.id}`} type="date" value={f.fine} onChange={(e) => cambia('fine', e.target.value)} />
          {!f.fine && <span className="piccolo muto">Si calcola dall'abbonamento</span>}
        </div>
        <div className="campo">
          <label htmlFor={`p-${iscrizione.id}`}>Prezzo (€)</label>
          <input id={`p-${iscrizione.id}`} inputMode="decimal" value={f.prezzo} onChange={(e) => cambia('prezzo', e.target.value)} />
          <span className="piccolo muto">{sconto > 0 ? `listino ${euro(listino)} · sconto ${euro(sconto)}` : `prezzo di listino`}</span>
        </div>
      </div>
      <div className="campo">
        <label htmlFor={`n-${iscrizione.id}`}>Note</label>
        <input id={`n-${iscrizione.id}`} value={f.note} onChange={(e) => cambia('note', e.target.value)} />
      </div>
      {tipo && tipo.modalita && tipo.modalita !== 'orari_fissi' && (iscrizione.iscrizioni_orari || []).length > 0 && (
        <p className="piccolo muto">Il nuovo abbonamento non è a giorni fissi: i giorni assegnati verranno tolti.</p>
      )}
      <p className="piccolo muto">Se l'incasso era già registrato con un altro importo, correggilo da Incassi.</p>
      <div className="azioni">
        <button className="btn btn-primario btn-piccolo" disabled={invio} onClick={salva}>{invio ? 'Salvo…' : 'Salva le modifiche'}</button>
        <button className="btn btn-piccolo" onClick={chiudi}>Chiudi</button>
      </div>
    </div>
  );
}

function Sospendi({ iscrizione, chiudi }) {
  const router = useRouter();
  const [f, setF] = useState({ dal: oggiISO(), al: '', motivo: '' });
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);

  async function salva() {
    if (!f.dal || !f.al || f.al < f.dal) { setErrore('Scrivi dal giorno al giorno.'); return; }
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().from('sospensioni').insert({
      palestra_id: iscrizione.palestra_id, iscrizione_id: iscrizione.id, dal: f.dal, al: f.al, motivo: f.motivo || null,
    });
    setInvio(false);
    if (error) { setErrore('Sospensione non registrata. Controlla le date.'); return; }
    chiudi(); router.refresh();
  }

  return (
    <div className="azione-iscrizione">
      <strong className="ai-titolo">Sospendi</strong>
      <p className="piccolo muto">In quei giorni la persona non compare nelle lezioni e la scadenza si sposta avanti.</p>
      {errore && <div className="errore" role="alert">{errore}</div>}
      <div className="ai-griglia">
        <div className="campo"><label htmlFor={`sd-${iscrizione.id}`}>Dal</label>
          <input id={`sd-${iscrizione.id}`} type="date" value={f.dal} onChange={(e) => setF({ ...f, dal: e.target.value })} /></div>
        <div className="campo"><label htmlFor={`sa-${iscrizione.id}`}>Al</label>
          <input id={`sa-${iscrizione.id}`} type="date" value={f.al} min={f.dal} onChange={(e) => setF({ ...f, al: e.target.value })} /></div>
        <div className="campo"><label htmlFor={`sm-${iscrizione.id}`}>Motivo</label>
          <input id={`sm-${iscrizione.id}`} placeholder="infortunio, gravidanza…" value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} /></div>
      </div>
      <div className="azioni">
        <button className="btn btn-primario btn-piccolo" disabled={invio} onClick={salva}>{invio ? 'Salvo…' : 'Sospendi'}</button>
        <button className="btn btn-piccolo" onClick={chiudi}>Chiudi</button>
      </div>
    </div>
  );
}

function AnnullaElimina({ iscrizione, elimina, chiudi }) {
  const router = useRouter();
  const [sit, setSit] = useState(null);
  const [scelte, setScelte] = useState({});     // id incasso -> { si, importo }
  const [motivo, setMotivo] = useState('');
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const [modo, setModo] = useState(elimina ? 'elimina' : 'annulla');

  useEffect(() => {
    supabaseBrowser().rpc('situazione_iscrizione', { p_iscrizione: iscrizione.id }).then(({ data, error }) => {
      if (error) { setErrore(messaggio(error)); return; }
      setSit(data);
      const iniziali = {};
      (data.incassi || []).forEach((x) => {
        const residuo = (x.ricevuta_cent || x.importo_cent) - (x.rimborsato_cent || 0);
        iniziali[x.id] = { si: elimina && (x.legato || x.stesso_corso), importo: inEuro(residuo) };
      });
      setScelte(iniziali);
    });
  }, [iscrizione.id, elimina]);

  if (!sit && !errore) return <div className="azione-iscrizione"><span className="piccolo muto">Controllo presenze e incassi…</span></div>;
  if (!sit) return <div className="azione-iscrizione"><div className="errore">{errore}</div></div>;

  const incassi = sit.incassi || [];
  const bloccanti = modo === 'elimina'
    ? incassi.filter((x) => x.stato === 'pagato' && (x.legato || x.stesso_corso) && !scelte[x.id]?.si) : [];
  const nonEliminabile = modo === 'elimina' && !sit.eliminabile;

  async function conferma() {
    setInvio(true); setErrore('');
    const db = supabaseBrowser();
    const daAnnullare = [];
    for (const x of incassi) {
      const s = scelte[x.id];
      if (!s?.si) continue;
      if (x.ricevuta_id) {
        const importo = daEuro(s.importo);
        if (importo > 0) {
          const { error } = await db.rpc('emetti_nota_credito', {
            p_ricevuta: x.ricevuta_id, p_importo_cent: importo,
            p_motivo: motivo || (modo === 'elimina' ? 'Iscrizione inserita per errore' : 'Iscrizione annullata'),
          });
          if (error) { setInvio(false); setErrore(messaggio(error)); return; }
        }
      } else daAnnullare.push(x.id);
    }
    const { error } = await db.rpc(modo === 'elimina' ? 'elimina_iscrizione' : 'annulla_iscrizione', {
      p_iscrizione: iscrizione.id, p_motivo: motivo || null, p_pagamenti: daAnnullare,
    });
    setInvio(false);
    if (error) { setErrore(messaggio(error)); return; }
    chiudi(); router.refresh();
  }

  return (
    <div className={`azione-iscrizione${modo === 'elimina' ? ' pericolo' : ''}`}>
      <strong className="ai-titolo">{modo === 'elimina' ? 'Elimina: inserita per errore' : 'Annulla l\'iscrizione'}</strong>
      <p className="piccolo muto" style={{ marginTop: 0 }}>
        {modo === 'elimina'
          ? 'Sparisce del tutto, con i giorni assegnati e i messaggi in coda. Resta scritto solo nel registro delle azioni.'
          : 'Esce subito da appelli e lezioni; la riga resta nello storico come annullata. I recuperi non usati si perdono.'}
      </p>

      <div className="ai-conti">
        <span><strong>{sit.presenze}</strong> presenze</span>
        {sit.ingressi_usati > 0 && <span><strong>{sit.ingressi_usati}</strong> ingressi usati</span>}
        {sit.recuperi > 0 && <span><strong>{sit.recuperi}</strong> recuperi prenotati</span>}
        <span><strong>{incassi.length}</strong> {incassi.length === 1 ? 'incasso collegato' : 'incassi collegati'}</span>
      </div>

      {nonEliminabile && (
        <div className="errore" role="alert">
          {sit.presenze > 0 ? `Ha già ${sit.presenze} ${sit.presenze === 1 ? 'presenza' : 'presenze'}` : 'Ha già usato degli ingressi'}: non si può eliminare.{' '}
          <button className="link-btn piccolo" onClick={() => setModo('annulla')}>Annullala invece</button>
        </div>
      )}

      {!nonEliminabile && incassi.length > 0 && (
        <div className="ai-incassi">
          <span className="piccolo muto">Cosa fare dei soldi</span>
          {incassi.map((x) => {
            const s = scelte[x.id] || {};
            const residuo = (x.ricevuta_cent || x.importo_cent) - (x.rimborsato_cent || 0);
            return (
              <label key={x.id} className="spunta ai-incasso">
                <input type="checkbox" checked={!!s.si} disabled={x.ricevuta_id && residuo <= 0}
                       onChange={(e) => setScelte({ ...scelte, [x.id]: { ...s, si: e.target.checked } })} />
                <span>
                  <strong>{x.descrizione}</strong> · {euro(x.importo_cent)} · {x.stato === 'pagato' ? `pagato${x.pagato_at ? ` il ${dataBreve(x.pagato_at)}` : ''}` : 'da incassare'}
                  <span className="piccolo muto" style={{ display: 'block' }}>
                    {x.ricevuta_id
                      ? (residuo <= 0 ? `Ricevuta n. ${x.ricevuta} già rimborsata del tutto.` : `Ricevuta n. ${x.ricevuta}: si fa la nota di credito`)
                      : x.stato === 'pagato' ? 'Nessuna ricevuta: l\'incasso si annulla' : 'L\'incasso da fare si annulla'}
                  </span>
                  {x.ricevuta_id && residuo > 0 && s.si && (
                    <span className="ai-importo">
                      di <input inputMode="decimal" aria-label="Importo della nota di credito" value={s.importo}
                                onChange={(e) => setScelte({ ...scelte, [x.id]: { ...s, importo: e.target.value } })} /> €
                    </span>
                  )}
                </span>
              </label>
            );
          })}
          {bloccanti.length > 0 && (
            <p className="piccolo" style={{ color: 'var(--rosso-scuro)', margin: 0 }}>
              C'è un incasso pagato per questo abbonamento: per eliminare, spunta cosa farne.
            </p>
          )}
        </div>
      )}

      {!nonEliminabile && (
        <>
          <div className="campo" style={{ marginBottom: 10 }}>
            <label htmlFor={`m-${iscrizione.id}`}>Motivo {modo === 'annulla' ? '' : '(facoltativo)'}</label>
            <input id={`m-${iscrizione.id}`} value={motivo} onChange={(e) => setMotivo(e.target.value)}
                   placeholder={modo === 'elimina' ? 'inserita per errore' : 'ritirata, trasferita…'} />
          </div>
          {errore && <div className="errore" role="alert">{errore}</div>}
          <div className="azioni">
            <button className={`btn btn-piccolo ${modo === 'elimina' ? 'btn-pericolo' : 'btn-primario'}`}
                    disabled={invio || bloccanti.length > 0} onClick={conferma}>
              {invio ? 'Un attimo…' : modo === 'elimina' ? 'Sì, elimina' : 'Sì, annulla'}
            </button>
            <button className="btn btn-piccolo" onClick={chiudi}>No, lascia com'è</button>
          </div>
        </>
      )}
      {nonEliminabile && <div className="azioni"><button className="btn btn-piccolo" onClick={chiudi}>Chiudi</button></div>}
    </div>
  );
}
