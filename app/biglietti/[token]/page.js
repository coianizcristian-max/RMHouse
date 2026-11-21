import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import Testata from '../../Testata';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { stripeAttivo } from '@/lib/stripe';
import { euro } from '@/lib/formato';
import { quandoSpettacolo, MODIFICHE_SEGRETERIA } from '@/lib/biglietteria';
import Azioni from './Azioni';
import Promemoria from '../Promemoria';
import Biglietto from '../Biglietto';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'I tuoi biglietti · Ritmo Metropolitano', robots: { index: false, follow: false } };

// I biglietti di una prenotazione (link nell'email): un QR per persona, da mostrare o stampare.
// Il QR apre la pagina d'ingresso della segreteria, che lo segna come entrato.
export default async function PaginaBiglietti({ params, searchParams }) {
  const { token } = await params;
  const { pagato } = (await searchParams) || {};
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();
  const { data: p } = await supabaseAdmin().rpc('biglietteria_biglietti', { p_token: token });
  if (!p) notFound();
  const h = await headers();
  const sito = (process.env.NEXT_PUBLIC_SITO_URL || `https://${h.get('host')}`).replace(/\/$/, '');
  const confermata = p.stato === 'pagata' || p.stato === 'gratis';

  return (
    <>
      {/* il logo riporta alla pagina dell'evento, non all'app */}
      <div className="bg-non-stampa"><Testata home={`/saggio?b=${encodeURIComponent(p.slug || '')}`} /></div>
      <main className="bg-pagina bg-pagina-biglietti">
        <div className="intestazione bg-non-stampa">
          <div className="occhiello">{p.evento}</div>
          <h1>{confermata ? (p.posti === 1 ? 'Il tuo biglietto' : `I tuoi ${p.posti} biglietti`) : 'La tua prenotazione'}</h1>
          {(p.eventi || []).length > 1
            ? <><p>Prenotazione <strong>{p.codice}</strong>:</p><ul className="bg-eventi-elenco">{p.eventi.map((e, k) => <li key={k}>{e.spettacolo} · {quandoSpettacolo(e.inizio)} · {e.posti} {e.posti === 1 ? 'posto' : 'posti'}{e.extra_testo ? ` · ${e.extra_testo}` : ''}</li>)}</ul></>
            : <p>{p.spettacolo} · {quandoSpettacolo(p.inizio)} · prenotazione <strong>{p.codice}</strong></p>}
        </div>

        {p.stato === 'da_pagare' && (
          <section className="scheda bg-scheda-promemoria">
            {pagato ? <p><strong>Pagamento ricevuto da Stripe:</strong> lo stiamo registrando, tra pochi secondi aggiorna la pagina.</p> : (
              <>
                <Promemoria p={p} />
                <div className="bg-passi-pagamento">
                  <Azioni stampa promemoria testo="Scarica o stampa il promemoria" />
                  {p.link_pagamento && <a href={p.link_pagamento} target="_blank" rel="noopener noreferrer" className="btn btn-primario btn-pieno">Vai al pagamento ({euro(p.totale_cent)})</a>}
                </div>
              </>
            )}
            <Azioni token={token} carta={!pagato && p.stripe && stripeAttivo()} />
          </section>
        )}
        {p.stato === 'scaduta' && <div className="scheda">La prenotazione è scaduta perché il pagamento non è arrivato in tempo, e i posti sono stati liberati. Se hai pagato scrivici: la sistemiamo.</div>}
        {p.stato === 'annullata' && <div className="scheda">Questa prenotazione è stata annullata.</div>}

        {!confermata && (p.biglietti || []).length > 0 && <h2 className="bg-non-stampa" style={{ marginTop: 20 }}>Biglietti già confermati (eventi gratuiti)</h2>}
        {(p.biglietti || []).length > 0 && (
          <>
            <div className="bg-non-stampa bg-stampa-riga">
              <p className="piccolo">Mostra il QR all&apos;ingresso dal telefono, oppure stampali: un biglietto per persona. {MODIFICHE_SEGRETERIA}</p>
              <Azioni stampa />
            </div>
            <div className="bg-passi-lista">
              {p.biglietti.map((x) => (
                <Biglietto key={x.codice} g={p.biglietto || {}} nEvento={x.n_evento} coloreEv={x.colore} evento={p.evento} spettacolo={x.spettacolo || p.spettacolo} inizio={x.inizio || p.inizio}
                           nome={x.nome || `${p.nome} ${p.cognome}`} allievo={'allievo' in x ? x.allievo : p.allievo} extra={x.extra_testo} numero={x.numero} di={x.di || p.posti}
                           codice={x.codice} url={`${sito}/gestione/biglietteria/ingresso?b=${x.codice}`} usato={x.entrato} />
              ))}
            </div>
          </>
        )}
        <p className="piccolo muto bg-non-stampa" style={{ marginTop: 24 }}><a href={`/saggio?b=${encodeURIComponent(p.slug || '')}`}>Continua a prenotare: torna alla pagina dell&apos;evento</a></p>
      </main>
    </>
  );
}
