'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { euro } from '@/lib/formato';
import { STATI_WORKSHOP, periodo, giornoOra, contiWorkshop, postiMomenti, testoScaglioni } from '@/lib/workshop';
import WorkshopForm from '../WorkshopForm';
import IscrittiWorkshop from './IscrittiWorkshop';

// La scheda di un workshop: in alto locandina, quando, stato e i numeri (posti per momento, incassi, compenso);
// sotto due schede: gli iscritti e la modifica.
export default function SchedaWorkshop({ palestraId, workshop: w, momenti, opzioni, iscrizioni, sedi, sale, quotaCent, schedaIniziale = 'iscritti' }) {
  const router = useRouter();
  const [scheda, setScheda] = useState(schedaIniziale);
  const [copiato, setCopiato] = useState(false);
  const [errore, setErrore] = useState('');
  const attive = iscrizioni.filter((i) => i.stato === 'iscritto');
  const conti = contiWorkshop(w, attive);
  const posti = postiMomenti(momenti, opzioni, attive);
  const s = STATI_WORKSHOP[w.stato] || STATI_WORKSHOP.bozza;
  const ultimo = momenti[momenti.length - 1];
  const iscrittiPerOpzione = Object.fromEntries(opzioni.map((o) => [o.id, iscrizioni.filter((i) => i.opzione_id === o.id).length]));

  async function copiaLink() {
    const url = `${window.location.origin}/workshop/${w.slug}`;
    try { await navigator.clipboard.writeText(url); setCopiato(true); setTimeout(() => setCopiato(false), 2500); } catch { prompt('Copia il link:', url); }
  }
  async function elimina() {
    if (!confirm(`Eliminare «${w.titolo}»? Non si può annullare.`)) return;
    const { error } = await supabaseBrowser().rpc('elimina_workshop', { p_workshop: w.id });
    if (error) {
      setErrore(error.message?.includes('workshop_con_iscritti')
        ? 'Ha iscritti o incassi: non si cancella. Se non si fa più, mettilo in "Annullato" (in Modifica).' : 'Non eliminato. Riprova.');
      return;
    }
    router.push('/gestione/workshop'); router.refresh();
  }

  return (
    <>
      <Link prefetch={false} className="torna" href="/gestione/workshop">Tutti i workshop</Link>
      <div className="wsd-testa">
        {w.locandina_url ? <img src={w.locandina_url} alt="" className="wsd-locandina" />
          : <span className="wsd-locandina vuota" aria-hidden="true">{w.titolo.slice(0, 2).toUpperCase()}</span>}
        <div className="wsd-testo">
          <span className={`tag ${s.classe}`}>{s.testo}</span>
          <h1>{w.titolo}</h1>
          <p className="muto">{[periodo(momenti[0]?.inizio, ultimo?.fine || ultimo?.inizio), w.insegnante && `con ${w.insegnante}`, w.sottotitolo].filter(Boolean).join(' · ')}</p>
          <div className="azioni wsd-azioni">
            {w.stato !== 'annullato' && <Link prefetch={false} className="btn btn-primario btn-piccolo" href={`/gestione/sportello?workshop=${w.id}`}>Iscrivi dallo Sportello</Link>}
            {w.stato !== 'bozza' && w.stato !== 'annullato' && (
              <>
                <button type="button" className="btn btn-piccolo" onClick={copiaLink}>{copiato ? 'Link copiato ✓' : 'Copia il link pubblico'}</button>
                <a className="btn btn-piccolo" href={`/workshop/${w.slug}`} target="_blank" rel="noreferrer">Pagina pubblica ↗</a>
              </>
            )}
            {w.stato === 'bozza' && <span className="piccolo muto">In bozza: il link pubblico e l&apos;app non lo mostrano ancora.</span>}
          </div>
        </div>
      </div>
      {errore && <div className="errore" role="alert">{errore}</div>}

      <div className="riquadri wsd-riquadri">
        {posti.map((m) => (
          <div key={m.id} className={`riquadro${m.liberi === 0 ? ' allarme' : ''}`}>
            <span className="etichetta">{m.titolo} · {giornoOra(m.inizio, m.fine).replace(/^\w/, (c) => c.toUpperCase())}</span>
            <strong>{m.occupati}{m.posti != null ? ` / ${m.posti}` : ''}</strong>
            <span className="piccolo muto">{m.posti != null ? (m.liberi ? `${m.liberi} posti liberi` : 'completo') : 'senza limite'}{m.sale?.nome ? ` · ${m.sale.nome}` : ''}</span>
          </div>
        ))}
        <div className="riquadro">
          <span className="etichetta">Incassato</span>
          <strong>{euro(conti.incassato)}</strong>
          <span className="piccolo muto">{conti.quote > 0 ? `+ ${euro(conti.quote)} di quote annuali` : 'workshop'}</span>
        </div>
        <div className={`riquadro${conti.daIncassare ? ' attenzione' : ''}`}>
          <span className="etichetta">Da incassare</span>
          <strong>{euro(conti.daIncassare)}</strong>
          <span className="piccolo muto">{conti.nDaPagare} {conti.nDaPagare === 1 ? 'persona' : 'persone'}</span>
        </div>
        {w.compenso_tipo && (
          <div className="riquadro">
            <span className="etichetta">Compenso {w.insegnante || 'insegnante'}</span>
            <strong>{euro(conti.compenso)}</strong>
            <span className="piccolo muto">{w.compenso_tipo === 'percentuale' ? `${Number(w.compenso_percentuale || 0)}% dell'incassato` : 'fisso'} · resta {euro(conti.resta)}</span>
          </div>
        )}
      </div>

      <div className="schede-sezione" role="tablist">
        <button type="button" role="tab" aria-selected={scheda === 'iscritti'} onClick={() => setScheda('iscritti')}>Iscritti <span className="conta-mini">{attive.length}</span></button>
        <button type="button" role="tab" aria-selected={scheda === 'prezzi'} onClick={() => setScheda('prezzi')}>Opzioni e prezzi</button>
        <button type="button" role="tab" aria-selected={scheda === 'modifica'} onClick={() => setScheda('modifica')}>Modifica</button>
      </div>

      {scheda === 'iscritti' && (
        <IscrittiWorkshop workshop={w} momenti={momenti} opzioni={opzioni} iscrizioni={iscrizioni} />
      )}

      {scheda === 'prezzi' && (
        <div className="wsd-opzioni">
          {opzioni.map((o) => (
            <div key={o.id} className={`pannello${o.attiva ? '' : ' wsd-ferma'}`}>
              <strong>{o.nome}</strong>{!o.attiva && <span className="tag tag-neutro" style={{ marginLeft: 6 }}>non in vendita</span>}
              {o.descrizione && <div className="piccolo muto">{o.descrizione}</div>}
              <div className="piccolo">Comprende: {momenti.filter((m) => (o.momenti || []).includes(m.id)).map((m) => m.titolo).join(', ') || '—'}</div>
              <div className="piccolo">Allievi: {testoScaglioni(o.prezzi)}</div>
              <div className="piccolo">Esterni: {testoScaglioni(o.prezzi, true)}{w.quota_esterni && quotaCent > 0 ? ` (+ ${euro(quotaCent)} di quota annuale a chi non ce l'ha)` : ''}</div>
              <div className="piccolo muto">{iscrittiPerOpzione[o.id] || 0} iscrizioni</div>
            </div>
          ))}
          <p className="piccolo muto">
            {w.online ? 'Si paga online (carta o Satispay)' : 'Niente pagamento online'}{w.in_segreteria ? ' o in segreteria' : ''}.
            {w.certificato_richiesto ? ' Serve il certificato medico.' : ' Non serve il certificato.'}
            {w.iscrizioni_fino ? ` Iscrizioni fino al ${new Date(w.iscrizioni_fino).toLocaleString('it-IT', { timeZone: 'Europe/Rome', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}.` : ' Iscrizioni fino all\'inizio.'}
          </p>
        </div>
      )}

      {scheda === 'modifica' && (
        <>
          <WorkshopForm palestraId={palestraId} workshop={w} momenti={momenti} opzioni={opzioni} sedi={sedi} sale={sale} quotaCent={quotaCent}
                        iscrittiPerOpzione={iscrittiPerOpzione} onSalvato={() => setScheda('iscritti')} onAnnulla={() => setScheda('iscritti')} />
          <p style={{ marginTop: 18 }}><button type="button" className="link-btn pericolo piccolo" onClick={elimina}>Elimina il workshop</button>
            <span className="piccolo muto"> · solo se non ha iscritti né incassi; altrimenti mettilo in &quot;Annullato&quot;.</span></p>
        </>
      )}
    </>
  );
}
