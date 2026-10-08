'use client';
import { useState } from 'react';
import Link from 'next/link';
import { euro } from '@/lib/formato';
import { STATI_WORKSHOP, periodo, contiWorkshop, postiMomenti } from '@/lib/workshop';

// Elenco dei workshop a riquadri con la locandina: quando, stato, iscritti e posti, incassato e da incassare.
const VISTE = [['arrivo', 'In arrivo'], ['passati', 'Passati'], ['annullati', 'Annullati']];

export default function ElencoWorkshop({ workshop, momenti, opzioni, iscrizioni }) {
  const [vista, setVista] = useState('arrivo');
  const [copiato, setCopiato] = useState('');
  const adesso = Date.now();
  const dati = workshop.map((w) => {
    const mm = momenti.filter((m) => m.workshop_id === w.id);
    const iscr = iscrizioni.filter((i) => i.workshop_id === w.id);
    const fine = mm.reduce((x, m) => Math.max(x, new Date(m.fine || m.inizio).getTime()), 0);
    const posti = postiMomenti(mm, opzioni.filter((o) => o.workshop_id === w.id), iscr);
    return { ...w, mm, iscr, fine, inizio: mm[0]?.inizio, ultimo: mm[mm.length - 1], posti, conti: contiWorkshop(w, iscr) };
  });
  const filtrati = dati.filter((w) => (vista === 'annullati' ? w.stato === 'annullato'
    : w.stato !== 'annullato' && (vista === 'passati' ? w.fine && w.fine < adesso - 6 * 3600e3 : !w.fine || w.fine >= adesso - 6 * 3600e3)))
    .sort((a, b) => (vista === 'passati' ? (b.fine - a.fine) : (new Date(a.inizio || 8.64e15) - new Date(b.inizio || 8.64e15))));
  const conta = (k) => dati.filter((w) => (k === 'annullati' ? w.stato === 'annullato'
    : w.stato !== 'annullato' && (k === 'passati' ? w.fine && w.fine < adesso - 6 * 3600e3 : !w.fine || w.fine >= adesso - 6 * 3600e3))).length;

  async function copiaLink(w) {
    const url = `${window.location.origin}/workshop/${w.slug}`;
    try { await navigator.clipboard.writeText(url); setCopiato(w.id); setTimeout(() => setCopiato(''), 2500); } catch { prompt('Copia il link:', url); }
  }

  return (
    <>
      <div className="intestazione ws-intestazione">
        <div>
          <div className="occhiello">Workshop</div>
          <h1>Workshop</h1>
          <p>Eventi a spot con insegnanti esterni: si iscrivono allievi ed esterni dall&apos;app, dal link pubblico o allo Sportello.</p>
        </div>
        <Link prefetch={false} href="/gestione/workshop/nuovo" className="btn btn-primario">+ Nuovo workshop</Link>
      </div>

      <div className="segmenti" role="group" aria-label="Quali workshop">
        {VISTE.map(([k, t]) => (
          <button key={k} type="button" aria-pressed={vista === k} onClick={() => setVista(k)}>{t} <span>{conta(k)}</span></button>
        ))}
      </div>

      {filtrati.length === 0 && (
        <div className="vuoto">
          {vista === 'arrivo' ? <>Nessun workshop in arrivo. <Link prefetch={false} href="/gestione/workshop/nuovo">Creane uno</Link>.</> : 'Niente qui.'}
        </div>
      )}

      <div className="ws-griglia">
        {filtrati.map((w) => {
          const s = STATI_WORKSHOP[w.stato] || STATI_WORKSHOP.bozza;
          const conPosti = w.posti.filter((m) => m.posti != null);
          return (
            <article key={w.id} className="ws-carta">
              <Link prefetch={false} href={`/gestione/workshop/${w.id}`} className="ws-carta-link" aria-label={`Apri ${w.titolo}`}>
                {w.locandina_url ? <img src={w.locandina_url} alt="" className="ws-locandina" />
                  : <span className="ws-locandina vuota" aria-hidden="true">{w.titolo.slice(0, 2).toUpperCase()}</span>}
                <span className="ws-carta-corpo">
                  <span className={`tag ${s.classe}`}>{s.testo}</span>
                  <strong className="ws-titolo">{w.titolo}</strong>
                  <span className="piccolo muto">{[periodo(w.inizio, w.ultimo?.fine || w.ultimo?.inizio), w.insegnante].filter(Boolean).join(' · ') || 'date da mettere'}</span>
                  <span className="ws-numeri">
                    <span><b>{w.iscr.length}</b> iscritti</span>
                    {conPosti.length > 0 && <span>{conPosti.map((m) => `${m.liberi} liberi${w.posti.length > 1 ? ` (${m.titolo})` : ''}`).join(' · ')}</span>}
                  </span>
                  <span className="ws-numeri">
                    <span>incassati <b>{euro(w.conti.incassato + w.conti.quote)}</b></span>
                    {w.conti.daIncassare > 0 && <span className="sp-attenzione">da incassare {euro(w.conti.daIncassare)}</span>}
                  </span>
                </span>
              </Link>
              {w.stato !== 'bozza' && w.stato !== 'annullato' && (
                <button type="button" className="link-btn piccolo ws-copia" onClick={() => copiaLink(w)}>{copiato === w.id ? 'Link copiato ✓' : 'Copia il link pubblico'}</button>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}
