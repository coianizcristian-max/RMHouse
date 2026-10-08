'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { euro } from '@/lib/formato';
import { giornoOra } from '@/lib/workshop';

// l'email si vede solo in parte (il link della pagina potrebbe girare)
const maschera = (e) => { const [u, d] = String(e || '').split('@'); return d ? `${u.slice(0, 2)}…@${d}` : ''; };

export default function StatoIscrizione({ i, carta, satispay, pagato, daSatispay, erroreApertura }) {
  const router = useRouter();
  const w = i.workshop;
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState(erroreApertura ? 'Il pagamento online non si è aperto: puoi riprovare qui sotto o pagare in segreteria. L\'iscrizione c\'è.' : '');
  const [stato, setStato] = useState(null);
  const momenti = (w.momenti || []).filter((m) => (w.opzioni || []).find((o) => o.id === i.opzione_id)?.momenti?.includes(m.id) ?? true);

  useEffect(() => {
    if (!daSatispay || !i.da_pagare) return;
    fetch(`/api/workshop/verifica?c=${i.codice}`).then((r) => r.json()).then((d) => {
      setStato(d.stato);
      if (d.stato === 'pagato') router.refresh();
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function paga(metodo) {
    setInvio(true); setErrore('');
    const r = await fetch('/api/workshop/paga', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codice: i.codice, metodo }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.url) { setInvio(false); setErrore(d.errore || 'Il pagamento non si è aperto. Riprova o paga in segreteria.'); return; }
    window.location.href = d.url;
  }

  const fatto = i.pagato || stato === 'pagato';
  return (
    <div className="wp-stato">
      {w.locandina_url && <img src={w.locandina_url} alt="" className="wp-stato-locandina" />}
      <div className="occhiello">Workshop</div>
      <h1>{i.stato === 'annullato' ? 'Iscrizione annullata' : fatto || !i.importo_cent ? 'Sei iscritto/a ✓' : 'Iscrizione registrata'}</h1>
      <p className="muto"><strong>{i.nome}</strong> · {w.titolo} · {i.opzione}</p>
      <ul className="wp-quando">
        {momenti.map((m) => <li key={m.id}><strong>{momenti.length > 1 ? `${m.titolo} · ` : ''}{giornoOra(m.inizio, m.fine)}</strong>
          <span className="piccolo muto">{[m.sala, w.luogo].filter(Boolean).join(' · ')}</span></li>)}
      </ul>
      {errore && <div className="errore" role="alert">{errore}</div>}
      {i.stato === 'iscritto' && (
        !i.importo_cent ? <div className="avviso-ok">Partecipazione gratuita. Ti abbiamo mandato l&apos;email di conferma{i.email ? ` a ${maschera(i.email)}` : ''}.</div>
        : fatto ? <div className="avviso-ok">Pagamento di {euro(i.importo_cent)} ricevuto. Ti arrivano l&apos;email di conferma e la ricevuta{i.email ? ` a ${maschera(i.email)}` : ''}.</div>
        : (
          <div className="scheda wp-da-pagare">
            <p><strong>Da pagare: {euro(i.importo_cent)}</strong>{i.quota_cent > 0 ? <span className="muto"> (compresa la quota associativa annuale di {euro(i.quota_cent)})</span> : null}</p>
            {pagato && <p className="piccolo muto">Se hai appena pagato, la conferma arriva tra pochi secondi: aggiorna la pagina.</p>}
            {stato === 'annullato' && <p className="piccolo sp-attenzione">Il pagamento con Satispay non è andato a buon fine.</p>}
            {(carta || satispay) && (
              <div className="wa-bottoni">
                {carta && <button type="button" className="btn btn-primario" disabled={invio} onClick={() => paga('carta')}>{invio ? 'Apro…' : `Paga ${euro(i.importo_cent)} con carta`}</button>}
                {satispay && <button type="button" className="btn" disabled={invio} onClick={() => paga('satispay')}>Paga con Satispay</button>}
              </div>
            )}
            {w.in_segreteria && <p className="piccolo muto">Oppure paga in segreteria prima del workshop.</p>}
          </div>
        )
      )}
      {w.certificato_richiesto && i.stato === 'iscritto' && <p className="piccolo">Ricorda: per partecipare serve il certificato medico valido.</p>}
      {w.info_pratiche && <div className="wp-info"><strong>Cosa sapere</strong><p>{w.info_pratiche}</p></div>}
      <p className="piccolo muto" style={{ marginTop: 18 }}>
        Con la stessa email puoi entrare nell&apos;<Link href="/area" prefetch={false}>area clienti</Link> e vedere le tue iscrizioni. <Link href={`/workshop/${w.slug}`} prefetch={false}>Torna al workshop</Link>
      </p>
    </div>
  );
}
