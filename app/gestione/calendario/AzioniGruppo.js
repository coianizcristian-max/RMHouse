'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { ora } from '@/lib/formato';

const giorno = (iso) => new Date(iso).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'Europe/Rome' });

const Icona = ({ d }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const ICONE = {
  insegnante: 'M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M17 8.5a2.5 2.5 0 1 0 0-5M16 14.5c3 .3 5.5 2.6 5.5 5.5',
  sala: 'M4 21V9l8-5 8 5v12M9 21v-7h6v7',
  posti: 'M4 20V10M10 20V4M16 20v-6M22 20H2',
  prenotabile: 'M3 11l9 9 9-9M12 20V4',
  note: 'M4 4h16v12l-4 4H4zM16 20v-4h4M8 9h8M8 13h5',
  annulla: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM5.6 5.6l12.8 12.8',
  ripristina: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5',
};

// Azioni su più lezioni selezionate nel palinsesto (il cerchietto in basso a ogni scheda), come nella vecchia app:
// insegnante, sala, posti, prenotazioni dall'app, nota, annulla o ripristina. Ogni cosa passa da modifica_lezione.
export default function AzioniGruppo({ lezioni, sale = [], insegnanti = [], occupato = false, onDeseleziona, onFatto }) {
  const [cosa, setCosa] = useState(null);
  const [valore, setValore] = useState('');
  const [daOggi, setDaOggi] = useState(false);
  const [recupero, setRecupero] = useState(true);
  const [invio, setInvio] = useState(false);
  const [esito, setEsito] = useState('');
  const [aperto, setAperto] = useState(false); // sul telefono il pannello parte compatto
  const annullate = lezioni.filter((l) => l.stato === 'annullata').length;
  const attive = lezioni.length - annullate;

  const apri = (c) => { setCosa(cosa === c ? null : c); setValore(''); setDaOggi(false); setRecupero(true); setEsito(''); };

  async function applica() {
    setInvio(true); setEsito('');
    const db = supabaseBrowser();
    const bersagli = cosa === 'ripristina' ? lezioni.filter((l) => l.stato === 'annullata')
      : cosa === 'annulla' ? lezioni.filter((l) => l.stato !== 'annullata') : lezioni;
    const esiti = await Promise.all(bersagli.map((l) => db.rpc('modifica_lezione', {
      p_lezione: l.lezione_id, p_cosa: cosa, p_valore: valore == null ? '' : String(valore), p_da_oggi: daOggi,
      ...(cosa === 'annulla' ? { p_recupero: recupero } : {}),
    })));
    setInvio(false);
    const errori = esiti.filter((e) => e.error).length;
    if (errori) { setEsito(`Fatto su ${bersagli.length - errori} lezioni, ${errori} non riuscite. Riprova.`); return; }
    onFatto?.();
  }

  const voce = (c, testo) => (
    <button type="button" className={cosa === c ? 'ag-voce attiva' : 'ag-voce'} onClick={() => apri(c)} aria-expanded={cosa === c}>
      <Icona d={ICONE[c]} />{testo}
    </button>
  );

  return (
    <aside className={aperto ? 'pal-azioni aperto' : 'pal-azioni'} aria-label="Azioni sulle lezioni selezionate">
      <div className="ag-testa">
        <h2>Azioni</h2>
        <span className="pal-badge pieno">{lezioni.length}</span>
        <button type="button" className="btn btn-piccolo ag-apri" aria-expanded={aperto} onClick={() => setAperto(!aperto)}>{aperto ? 'Nascondi' : 'Mostra'}</button>
        <button type="button" className="link-btn piccolo ag-apri" onClick={onDeseleziona}>Deseleziona</button>
      </div>
      <div className="ag-corpo">
      <ul className="ag-scelte">
        {lezioni.slice(0, 4).map((l) => <li key={l.lezione_id}>{giorno(l.inizio)} {ora(l.inizio)} · {l.corso_nome}</li>)}
        {lezioni.length > 4 && <li className="muto">e altre {lezioni.length - 4}…</li>}
      </ul>

      {attive > 0 && voce('insegnante', 'Assegna/Rimuovi insegnante')}
      {attive > 0 && voce('sala', 'Cambia sala')}
      {attive > 0 && voce('posti', 'Posti disponibili')}
      {attive > 0 && voce('prenotabile', 'Prenotazioni dall\'app')}
      {attive > 0 && voce('note', 'Nota / info sulla lezione')}
      {attive > 0 && voce('annulla', `Annulla ${attive === 1 ? 'la lezione' : `le ${attive} lezioni`}`)}
      {annullate > 0 && voce('ripristina', `Ripristina ${annullate === 1 ? 'la lezione annullata' : `le ${annullate} annullate`}`)}

      {cosa && (
        <form className="ag-modulo" onSubmit={(e) => { e.preventDefault(); applica(); }}>
          {cosa === 'insegnante' && (
            <select value={valore} onChange={(e) => setValore(e.target.value)} aria-label="Insegnante">
              <option value="">— nessun insegnante (rimuovi) —</option>
              {insegnanti.map((i) => <option key={i.id} value={i.id}>{i.nome}{i.cognome ? ` ${i.cognome}` : ''}</option>)}
            </select>
          )}
          {cosa === 'sala' && (
            <select value={valore} onChange={(e) => setValore(e.target.value)} aria-label="Sala">
              <option value="">— nessuna sala —</option>
              {sale.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          )}
          {cosa === 'posti' && (
            <input type="number" min="0" max="500" inputMode="numeric" placeholder="vuoto = come il corso" value={valore} onChange={(e) => setValore(e.target.value)} aria-label="Posti" />
          )}
          {cosa === 'prenotabile' && (
            <select value={valore || 'true'} onChange={(e) => setValore(e.target.value)} aria-label="Prenotazioni">
              <option value="true">Aperte: i clienti si prenotano dall&apos;app</option>
              <option value="false">Chiuse: solo la segreteria</option>
            </select>
          )}
          {cosa === 'note' && (
            <textarea rows={3} placeholder="Es. portare le ginocchiere · vuoto = cancella la nota" value={valore} onChange={(e) => setValore(e.target.value)} aria-label="Nota" />
          )}
          {cosa === 'annulla' && (
            <>
              <input placeholder="Motivo (lo leggono i clienti)" value={valore} onChange={(e) => setValore(e.target.value)} aria-label="Motivo" />
              <label className="ag-spunta"><input type="checkbox" checked={recupero} onChange={(e) => setRecupero(e.target.checked)} /> Gli iscritti maturano il recupero</label>
            </>
          )}
          {cosa === 'ripristina' && <p className="piccolo muto" style={{ margin: 0 }}>Le lezioni tornano programmate; i recuperi nati dall&apos;annullamento restano da controllare.</p>}
          {cosa !== 'ripristina' && cosa !== 'annulla' && (
            <label className="ag-spunta"><input type="checkbox" checked={daOggi} onChange={(e) => setDaOggi(e.target.checked)} /> Anche le prossime lezioni degli stessi orari</label>
          )}
          {esito && <div className="errore" role="alert">{esito}</div>}
          <div className="azioni">
            <button className="btn btn-primario btn-piccolo" disabled={invio || occupato}>{invio ? 'Applico…' : occupato ? 'Aggiorno…' : `Applica a ${cosa === 'ripristina' ? annullate : cosa === 'annulla' ? attive : lezioni.length} lezioni`}</button>
            <button type="button" className="btn btn-piccolo" onClick={() => setCosa(null)}>Chiudi</button>
          </div>
        </form>
      )}

      <button type="button" className="ag-voce deseleziona" onClick={onDeseleziona}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></svg>
        Deseleziona tutti: {lezioni.length}
      </button>
      </div>
    </aside>
  );
}
