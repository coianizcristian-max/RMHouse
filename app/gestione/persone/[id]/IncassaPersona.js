'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { euro } from '@/lib/formato';

const CAUSALI = [
  ['quota_iscrizione', 'Quota annuale'], ['abbonamento', 'Abbonamento'], ['prova', 'Lezione di prova'],
  ['evento', 'Evento o stage'], ['spazio', 'Affitto sala'], ['materiale', 'Materiale'], ['altro', 'Altro'],
];
const METODI = [['contanti', 'Contanti'], ['pos', 'POS'], ['bonifico', 'Bonifico'], ['assegno', 'Assegno'], ['altro', 'Altro']];

// Incassa da questa persona, senza cercarla di nuovo: prima quello che deve già (rate, abbonamenti da
// incassare), poi un incasso libero (quota annuale già proposta se manca). Poi la ricevuta è in Pagamenti.
export default function IncassaPersona({ palestraId, allievoId, accountId, nome, daIncassare = [], quotaCent = 0, quotaMancante = false, onChiudi }) {
  const router = useRouter();
  const [metodo, setMetodo] = useState('contanti');
  const [f, setF] = useState({
    causale: quotaMancante ? 'quota_iscrizione' : 'abbonamento',
    importo: quotaMancante && quotaCent ? (quotaCent / 100).toFixed(2).replace('.', ',') : '',
    descrizione: '', data: new Date().toLocaleDateString('sv-SE'),
  });
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState('');
  const [fatto, setFatto] = useState('');
  const nomeCausale = (k) => (CAUSALI.find(([v]) => v === k) || [null, k])[1];

  async function incassaRiga(p) {
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().rpc('segna_pagato', { p_pagamento: p.id, p_metodo: metodo });
    setInvio(false);
    if (error) { setErrore('Non riuscito. Riprova.'); return; }
    setFatto(`Incassati ${euro(p.importo_cent)} (${metodo}) ✓ La ricevuta la emetti qui sotto in Pagamenti.`);
    router.refresh();
  }

  async function registra(e) {
    e.preventDefault();
    const importo = parseFloat(String(f.importo || '').replace(',', '.'));
    if (!Number.isFinite(importo) || importo <= 0) { setErrore("Scrivi l'importo."); return; }
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().rpc('registra_incasso', {
      p: { palestra_id: palestraId, account_id: accountId || null, allievo_id: allievoId, causale: f.causale, metodo,
           importo_cent: Math.round(importo * 100), descrizione: f.descrizione || nomeCausale(f.causale), incassato: true, pagato_at: f.data || null },
    });
    setInvio(false);
    if (error) { setErrore('Registrazione non riuscita.'); return; }
    setFatto(`Incassati ${euro(Math.round(importo * 100))} (${metodo}) ✓ La ricevuta la emetti qui sotto in Pagamenti.`);
    setF({ ...f, importo: '', descrizione: '' });
    router.refresh();
  }

  return (
    <div className="incassa-persona">
      <div className="ip-testa"><strong>Incassa da {nome}</strong>
        <button type="button" className="link-btn piccolo" onClick={onChiudi}>chiudi</button></div>
      {fatto && <div className="avviso-ok" role="status">{fatto}</div>}
      {errore && <div className="errore" role="alert">{errore}</div>}

      <span className="aq-etichetta">Come paga</span>
      <div className="aq-chips">
        {METODI.map(([v, l]) => <button key={v} type="button" aria-pressed={metodo === v} onClick={() => setMetodo(v)}>{l}</button>)}
      </div>

      {daIncassare.length > 0 && (
        <>
          <span className="aq-etichetta">Deve già</span>
          <ul className="ip-righe">
            {daIncassare.map((p) => (
              <li key={p.id}>
                <span>{p.descrizione || 'Pagamento'}</span>
                <strong>{euro(p.importo_cent)}</strong>
                <button type="button" className="btn btn-piccolo btn-primario" disabled={invio} onClick={() => incassaRiga(p)}>Incassa</button>
              </li>
            ))}
          </ul>
        </>
      )}

      <form onSubmit={registra} className="ip-libero">
        <span className="aq-etichetta">{daIncassare.length ? 'Oppure un altro incasso' : 'Cosa incassi'}</span>
        <div className="aq-chips">
          {CAUSALI.map(([v, l]) => (
            <button key={v} type="button" aria-pressed={f.causale === v}
                    onClick={() => setF({ ...f, causale: v, importo: v === 'quota_iscrizione' && quotaCent ? (quotaCent / 100).toFixed(2).replace('.', ',') : f.causale === 'quota_iscrizione' ? '' : f.importo })}>{l}</button>
          ))}
        </div>
        <div className="ip-campi">
          <input inputMode="decimal" value={f.importo} onChange={(e) => setF({ ...f, importo: e.target.value })} placeholder="Importo €" aria-label="Importo" />
          <input value={f.descrizione} onChange={(e) => setF({ ...f, descrizione: e.target.value })} placeholder={nomeCausale(f.causale)} aria-label="Descrizione" />
          <input type="date" value={f.data} max={new Date().toLocaleDateString('sv-SE')} onChange={(e) => setF({ ...f, data: e.target.value })} aria-label="Data dell'incasso" title="Data dell'incasso (se non è oggi)" />
          <button className="btn btn-primario" disabled={invio}>{invio ? 'Salvo…' : 'Incassa'}</button>
        </div>
        <span className="piccolo muto">Per un abbonamento nuovo usa "Nuova iscrizione": crea l'iscrizione e l'incasso insieme.</span>
      </form>
    </div>
  );
}
