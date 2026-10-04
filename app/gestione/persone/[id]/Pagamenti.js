'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { euro, dataBreve } from '@/lib/formato';
import IncassaPersona from './IncassaPersona';
import EmettiFattura from '../../EmettiFattura';
import RimborsoCarta from '../../RimborsoCarta';

const METODI = { contanti: 'contanti', pos: 'POS', bonifico: 'bonifico', online: 'online', stripe: 'online', assegno: 'assegno', altro: 'altro' };
const STATI = { pagato: null, in_attesa: ['da incassare', 'tag-attenzione'], annullato: ['annullato', 'tag-neutro'], rimborsato: ['rimborsato', 'tag-neutro'] };

// Tutti i pagamenti della persona (o della famiglia, se senza persona indicata), con la ricevuta
export default function Pagamenti({ pagamenti, ricevute, totaleStorico, incassa = null, apriIncassa = false, online = false }) {
  const router = useRouter();
  const [invio, setInvio] = useState(null);
  const [errore, setErrore] = useState('');
  const [aperto, setAperto] = useState(apriIncassa);
  const [fattura, setFattura] = useState(null);   // l'incasso di cui si sta facendo la fattura
  const pagato = pagamenti.filter((p) => p.stato === 'pagato').reduce((s, p) => s + p.importo_cent, 0);
  const daIncassare = pagamenti.filter((p) => p.stato === 'in_attesa').reduce((s, p) => s + p.importo_cent, 0);
  // il documento dell'incasso: la ricevuta oppure la fattura
  const ricevutaDi = (id) => ricevute.find((r) => r.pagamento_id === id && (r.tipo_documento === 'ricevuta' || r.tipo_documento === 'fattura') && !r.annullata);

  async function emetti(p) {
    setInvio(p.id); setErrore('');
    const { data, error } = await supabaseBrowser().rpc('emetti_ricevuta', { p_pagamento: p.id });
    setInvio(null);
    if (error) { setErrore('Ricevuta non emessa.'); return; }
    router.push(`/gestione/ricevute/${data}`);
  }

  return (
    <section className="pannello" id="pagamenti">
      <div className="pannello-testa">
        <h2>Pagamenti</h2>
        {incassa && !aperto && <button type="button" className="btn btn-piccolo" onClick={() => setAperto(true)}>Incassa</button>}
      </div>
      {incassa && aperto && (
        <IncassaPersona {...incassa} daIncassare={pagamenti.filter((p) => p.stato === 'in_attesa')} onChiudi={() => setAperto(false)} />
      )}
      <div className="pagamenti-totali">
        <span><strong>{euro(pagato)}</strong><span className="piccolo muto">pagati con RMHouse</span></span>
        {totaleStorico > 0 && <span><strong>{euro(totaleStorico)}</strong><span className="piccolo muto">in APP Palestre</span></span>}
        {daIncassare > 0 && <span><strong style={{ color: 'var(--attenzione)' }}>{euro(daIncassare)}</strong><span className="piccolo muto">da incassare</span></span>}
      </div>
      {errore && <div className="errore" role="alert">{errore}</div>}
      {pagamenti.length === 0 ? (
        <div className="vuoto">Nessun pagamento registrato in RMHouse. Quelli fatti prima sono nello storico di APP Palestre qui sotto.</div>
      ) : (
        <ul className="mini-lista">
          {pagamenti.map((p) => {
            const r = ricevutaDi(p.id);
            const st = STATI[p.stato];
            return (
              <li key={p.id}>
                <span className="ml-riga">
                  <span className="ml-testo">
                    <strong>{p.descrizione}</strong>
                    <span className="piccolo muto">
                      {dataBreve(p.pagato_at || p.created_at)} · {METODI[p.metodo] || p.metodo}
                      {st && <> · <span className={`tag ${st[1]}`}>{st[0]}</span></>}
                    </span>
                  </span>
                  <span className="pag-destra">
                    <strong>{euro(p.importo_cent)}</strong>
                    {r ? (
                      <Link prefetch={false} className="link-btn piccolo" href={`/gestione/ricevute/${r.id}`}>
                        {r.tipo_documento === 'fattura' ? 'fattura' : 'ricevuta'} {r.numero}/{r.anno}
                      </Link>
                    ) : p.stato === 'pagato' ? (
                      <span className="pag-doc">
                        <button className="link-btn piccolo" disabled={invio === p.id} onClick={() => emetti(p)}>
                          {invio === p.id ? '…' : 'emetti ricevuta'}
                        </button>
                        <button className="link-btn piccolo" onClick={() => setFattura(fattura === p.id ? null : p.id)}>fattura</button>
                      </span>
                    ) : null}
                  </span>
                </span>
                {fattura === p.id && <EmettiFattura pagamentoId={p.id} onChiudi={() => setFattura(null)} />}
                {online && p.stato === 'pagato' && p.stripe_payment_intent && (
                  <div style={{ textAlign: 'right' }}><RimborsoCarta pagamento={p} conDocumento={!!r} /></div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="piccolo muto" style={{ marginTop: 8, marginBottom: 0 }}>
        Ricevuta per quote e corsi; fattura (con IVA) per le attività commerciali. Si aprono pronte da stampare o salvare in PDF.
      </p>
    </section>
  );
}
