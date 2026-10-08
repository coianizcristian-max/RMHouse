'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { euro } from '@/lib/formato';
import { prezzoOpzione, prossimoScaglione, dataBreveIt } from '@/lib/workshop';
import Dettaglio from '../../../workshop/Dettaglio';

const MOTIVI = {
  posti_esauriti: 'I posti per questa opzione sono appena finiti.',
  gia_iscritto: 'È già iscritto/a a questo workshop.',
  iscrizioni_chiuse: 'Le iscrizioni sono chiuse.',
  workshop_annullato: 'Il workshop è stato annullato.',
  prezzo_mancante: 'Prezzo non disponibile: chiedi in segreteria.',
};

// Il workshop nell'app: tutto quello che c'è da sapere, chi della famiglia iscrivere, l'opzione, il totale
// (con la quota annuale se manca) e come pagare: carta, Satispay o in segreteria. Sotto, le iscrizioni fatte.
export default function IscrizioneArea({ w, carta, satispay, pagato, daSatispay }) {
  const router = useRouter();
  const persone = w.persone || [];
  const iscritti = w.iscritti || [];
  const libere = persone.filter((p) => !iscritti.some((i) => i.allievo_id === p.allievo_id));
  const [chi, setChi] = useState(libere[0]?.allievo_id || '');
  const [opz, setOpz] = useState((w.opzioni || []).length === 1 ? w.opzioni[0].id : '');
  const [invio, setInvio] = useState('');
  const [errore, setErrore] = useState('');
  const [avviso, setAvviso] = useState(pagato ? 'Pagamento fatto: ti arriva l\'email con la conferma e la ricevuta. Se qui risulta ancora da pagare, aggiorna tra qualche secondo.' : '');
  const persona = persone.find((p) => p.allievo_id === chi);
  const o = (w.opzioni || []).find((x) => x.id === opz);
  const prezzo = o && persona ? prezzoOpzione(o, persona.esterno) : null;
  const quota = persona?.quota_serve ? w.quota_cent : 0;
  const totale = (prezzo || 0) + quota;
  const pross = o ? prossimoScaglione(o) : null;
  const inSegreteria = w.in_segreteria;
  const online = carta || satispay;

  // di ritorno da Satispay: si controlla subito
  useEffect(() => {
    if (!daSatispay) return;
    const aperte = iscritti.filter((i) => i.da_pagare);
    if (!aperte.length) return;
    Promise.all(aperte.map((i) => fetch(`/api/workshop/verifica?i=${i.id}`).then((r) => r.json()).catch(() => ({}))))
      .then((es) => {
        if (es.some((e) => e.stato === 'pagato')) { setAvviso('Pagamento con Satispay ricevuto ✓'); router.refresh(); }
        else if (es.some((e) => e.stato === 'annullato')) setErrore('Il pagamento con Satispay non è andato a buon fine: puoi riprovare o pagare in segreteria.');
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function paga(iscrizioneId, metodo) {
    setInvio(iscrizioneId); setErrore('');
    const r = await fetch('/api/workshop/paga', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ iscrizione_id: iscrizioneId, metodo }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.url) { setInvio(''); setErrore(d.errore || 'Il pagamento non si è aperto. Riprova o paga in segreteria.'); router.refresh(); return; }
    window.location.href = d.url;
  }

  async function iscrivi(modo) {
    if (!persona || !o) return;
    setInvio('nuova'); setErrore(''); setAvviso('');
    const db = supabaseBrowser();
    const { data, error } = await db.rpc('iscrivi_workshop', { p_opzione: o.id, p_allievo: persona.allievo_id, p_origine: 'app' });
    if (error) {
      setInvio('');
      const k = Object.keys(MOTIVI).find((m) => error.message?.includes(m));
      setErrore(k ? MOTIVI[k] : 'Iscrizione non riuscita. Riprova.');
      return;
    }
    if (!data.importo_cent) { setInvio(''); setAvviso(`${persona.nome} è iscritto/a ✓ Ti arriva l'email di conferma.`); router.refresh(); return; }
    if (modo === 'segreteria') {
      await db.rpc('workshop_pago_in_segreteria', { p_iscrizione: data.iscrizione_id });
      setInvio(''); setAvviso(`${persona.nome} è iscritto/a ✓ ${euro(data.importo_cent)} da pagare in segreteria (o qui sotto, quando vuoi).`);
      router.refresh(); return;
    }
    await paga(data.iscrizione_id, modo);
  }

  async function annulla(i) {
    if (!confirm(`Annullare l'iscrizione di ${i.nome}?`)) return;
    setInvio(i.id); setErrore('');
    const { error } = await supabaseBrowser().rpc('annulla_iscrizione_workshop', { p_iscrizione: i.id });
    setInvio('');
    if (error) { setErrore(error.message?.includes('gia_pagato') ? 'Hai già pagato: per annullare scrivi alla segreteria.' : 'Non è stato possibile annullare.'); return; }
    setAvviso('Iscrizione annullata.'); router.refresh();
  }

  return (
    <div className="wa-dettaglio">
      <p><Link prefetch={false} href="/area/workshop" className="torna">Tutti i workshop</Link></p>
      <Dettaglio w={w} esterno={persona ? persona.esterno : null} />

      {errore && <div className="errore" role="alert">{errore}</div>}
      {avviso && <div className="avviso-ok" role="status">{avviso}</div>}

      {iscritti.length > 0 && (
        <section className="wa-sezione">
          <h2>Iscrizioni</h2>
          <ul className="elenco">
            {iscritti.map((i) => (
              <li key={i.id} className="persona wa-iscritto">
                <span><strong>{i.nome}</strong> · {i.opzione}
                  <span className="piccolo muto" style={{ display: 'block' }}>
                    {!i.importo_cent ? 'gratuito' : i.pagato ? `${euro(i.importo_cent)} pagato ✓` : `${euro(i.importo_cent)} da pagare${i.quota_cent ? ' (con la quota annuale)' : ''}`}
                  </span>
                </span>
                <span className="wa-azioni">
                  {i.da_pagare && carta && <button type="button" className="btn btn-piccolo btn-primario" disabled={!!invio} onClick={() => paga(i.id, 'carta')}>{invio === i.id ? 'Apro…' : 'Paga con carta'}</button>}
                  {i.da_pagare && satispay && <button type="button" className="btn btn-piccolo" disabled={!!invio} onClick={() => paga(i.id, 'satispay')}>Satispay</button>}
                  {!i.pagato && <button type="button" className="link-btn piccolo pericolo" disabled={!!invio} onClick={() => annulla(i)}>annulla</button>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {w.aperte && libere.length > 0 && (
        <section className="wa-sezione wa-iscriviti">
          <h2>Iscriviti</h2>
          {persone.length > 1 && (
            <div className="campo">
              <label>Chi partecipa</label>
              <div className="sp-scelta" role="radiogroup" aria-label="Chi partecipa">
                {persone.map((p) => {
                  const gia = iscritti.some((i) => i.allievo_id === p.allievo_id);
                  return (
                    <button key={p.allievo_id} type="button" role="radio" aria-checked={chi === p.allievo_id} className={chi === p.allievo_id ? 'attiva' : ''}
                            disabled={gia} onClick={() => setChi(p.allievo_id)}>{p.nome}{gia ? ' (già iscritto/a)' : ''}</button>
                  );
                })}
              </div>
            </div>
          )}
          {(w.opzioni || []).length > 1 && (
            <div className="campo">
              <label>Cosa</label>
              <div className="wa-opzioni" role="radiogroup" aria-label="Opzione">
                {w.opzioni.map((x) => (
                  <button key={x.id} type="button" role="radio" aria-checked={opz === x.id} className={`wa-opzione${opz === x.id ? ' scelta' : ''}`}
                          disabled={x.liberi === 0} onClick={() => setOpz(x.id)}>
                    <strong>{x.nome}</strong>
                    <span>{x.liberi === 0 ? 'completo' : persona ? euro(prezzoOpzione(x, persona.esterno)) : ''}</span>
                    {x.descrizione && <small className="muto">{x.descrizione}</small>}
                  </button>
                ))}
              </div>
            </div>
          )}
          {o && persona && (
            <div className="wa-totale">
              <div><span>{o.nome}{persona.esterno ? '' : ' · prezzo allievi'}</span><strong>{euro(prezzo)}</strong></div>
              {quota > 0 && <div><span>Quota associativa annuale <small className="muto">(manca: vale un anno)</small></span><strong>{euro(quota)}</strong></div>}
              <div className="wa-totale-riga"><span>Totale</span><strong>{euro(totale)}</strong></div>
              {pross && <p className="piccolo muto">Dal {dataBreveIt(pross.dal)} costa {euro(persona.esterno ? pross.esterni : pross.allievi)}.</p>}
              {w.certificato_richiesto && !persona.certificato_ok && <p className="piccolo sp-attenzione">Serve il certificato medico valido: se non l&apos;hai già dato, portalo o caricalo dall&apos;app (Io → Certificato).</p>}
            </div>
          )}
          {o && persona && (
            <div className="wa-bottoni">
              {totale === 0 ? (
                <button type="button" className="btn btn-primario" disabled={!!invio} onClick={() => iscrivi('gratis')}>{invio ? 'Un attimo…' : `Iscrivi ${persona.nome}`}</button>
              ) : (
                <>
                  {carta && <button type="button" className="btn btn-primario" disabled={!!invio} onClick={() => iscrivi('carta')}>{invio ? 'Un attimo…' : `Iscriviti e paga ${euro(totale)} con carta`}</button>}
                  {satispay && <button type="button" className="btn" disabled={!!invio} onClick={() => iscrivi('satispay')}>Paga con Satispay</button>}
                  {inSegreteria && <button type="button" className={`btn${online ? '' : ' btn-primario'}`} disabled={!!invio} onClick={() => iscrivi('segreteria')}>Iscriviti, pago in segreteria</button>}
                  {!online && !inSegreteria && <p className="piccolo muto">Per iscriverti scrivi o passa in segreteria.</p>}
                </>
              )}
            </div>
          )}
          {(!o || !persona) && <p className="piccolo muto">Scegli {!persona ? 'chi partecipa' : 'cosa'} per vedere il totale.</p>}
        </section>
      )}
      {!w.aperte && w.stato !== 'annullato' && <p className="muto">Le iscrizioni dall&apos;app sono chiuse: per informazioni scrivi alla segreteria.</p>}
      {w.aperte && libere.length === 0 && persone.length > 0 && <p className="muto">Tutta la famiglia è già iscritta.</p>}
    </div>
  );
}
