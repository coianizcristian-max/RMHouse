'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { euro } from '@/lib/formato';

// Chi si è iscritto a un evento: quote da incassare, presenze, cancellazioni.
export default function IscrittiEvento({ iscritti }) {
  const router = useRouter();
  const [aperto, setAperto] = useState(false);
  const [invio, setInvio] = useState('');
  const [errore, setErrore] = useState('');
  const attivi = iscritti.filter((i) => i.stato !== 'annullato');
  const daIncassare = attivi.filter((i) => i.pagamenti?.stato === 'in_attesa');

  async function esegui(id, fn) {
    setInvio(id); setErrore('');
    const { error } = await fn(supabaseBrowser());
    setInvio('');
    if (error) { setErrore('Non riuscito. Riprova.'); return; }
    router.refresh();
  }
  const incassa = (i, metodo) => esegui(i.id, (db) => db.rpc('segna_pagato', { p_pagamento: i.pagamento_id, p_metodo: metodo }));
  const presente = (i) => esegui(i.id, (db) => db.rpc('presenza_evento', { p_iscrizione: i.id, p_presente: i.stato !== 'presente' }));
  const togli = (i) => {
    if (!confirm(`Togliere ${i.nome} dall'evento?${i.pagamenti?.stato === 'pagato' ? ' Ha già pagato: troverai il promemoria per il rimborso.' : ''}`)) return;
    esegui(i.id, (db) => db.rpc('annulla_iscrizione_evento', { p_iscrizione: i.id }));
  };

  if (!iscritti.length) return null;
  return (
    <div className="ev-iscritti">
      <button type="button" className="link-btn piccolo" onClick={() => setAperto(!aperto)} aria-expanded={aperto}>
        {aperto ? 'Nascondi iscritti' : `Vedi iscritti (${attivi.length})`}
        {daIncassare.length > 0 && <span className="tag tag-attenzione" style={{ marginLeft: 6 }}>{daIncassare.length} da incassare</span>}
      </button>
      {aperto && (
        <ul className="ev-lista">
          {iscritti.map((i) => (
            <li key={i.id} className={i.stato === 'annullato' ? 'annullato' : ''}>
              <span className="ev-chi">
                {i.allievo_id ? <Link prefetch={false} href={`/gestione/persone/${i.allievo_id}`}>{i.nome}</Link> : i.nome}
                {i.persone > 1 && <span className="piccolo muto"> · {i.persone} persone</span>}
                {i.telefono && <a className="piccolo" href={`tel:${i.telefono}`}> · {i.telefono}</a>}
                {i.note && <span className="piccolo muto"> · “{i.note}”</span>}
              </span>
              <span className="ev-stato">
                {i.stato === 'annullato' ? (
                  <>
                    <span className="tag tag-neutro">non partecipa</span>
                    {i.pagamenti?.stato === 'pagato' && <span className="tag tag-attenzione">aveva pagato {euro(i.pagamenti.importo_cent)}: rimborso?</span>}
                  </>
                ) : (
                  <>
                    {i.pagamenti?.stato === 'in_attesa' && (
                      <>
                        <span className="tag tag-attenzione">{euro(i.pagamenti.importo_cent)} da pagare</span>
                        <button type="button" className="link-btn piccolo" disabled={!!invio} onClick={() => incassa(i, 'contanti')}>contanti</button>
                        <button type="button" className="link-btn piccolo" disabled={!!invio} onClick={() => incassa(i, 'pos')}>POS</button>
                      </>
                    )}
                    {i.pagamenti?.stato === 'pagato' && <span className="tag tag-ok">pagato</span>}
                    <button type="button" className={`link-btn piccolo${i.stato === 'presente' ? ' attivo' : ''}`} disabled={!!invio} onClick={() => presente(i)}>
                      {i.stato === 'presente' ? '✓ presente' : 'presente?'}
                    </button>
                    <button type="button" className="link-btn piccolo pericolo" disabled={!!invio} onClick={() => togli(i)}>togli</button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {errore && <div className="errore" role="alert">{errore}</div>}
    </div>
  );
}
