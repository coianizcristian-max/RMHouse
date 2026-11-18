import Link from 'next/link';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import Testata from '../../Testata';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { stripeAttivo } from '@/lib/stripe';
import { qrSvg } from '@/lib/qr';
import { euro } from '@/lib/formato';
import { quandoSpettacolo } from '@/lib/biglietteria';
import Azioni from './Azioni';

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
  const causale = `SAGGIO ${p.codice} ${String(p.cognome || '').toUpperCase()}`;

  return (
    <>
      <div className="bg-non-stampa"><Testata /></div>
      <main className="bg-pagina bg-pagina-biglietti">
        <div className="intestazione bg-non-stampa">
          <div className="occhiello">{p.evento}</div>
          <h1>{confermata ? (p.posti === 1 ? 'Il tuo biglietto' : `I tuoi ${p.posti} biglietti`) : 'La tua prenotazione'}</h1>
          {(p.eventi || []).length > 1
            ? <><p>Prenotazione <strong>{p.codice}</strong>:</p><ul className="bg-eventi-elenco">{p.eventi.map((e, k) => <li key={k}>{e.spettacolo} · {quandoSpettacolo(e.inizio)} · {e.posti} {e.posti === 1 ? 'posto' : 'posti'}{e.pizze ? ` · ${e.pizze} pizz${e.pizze === 1 ? 'a' : 'e'}` : ''}</li>)}</ul></>
            : <p>{p.spettacolo} · {quandoSpettacolo(p.inizio)} · prenotazione <strong>{p.codice}</strong></p>}
        </div>

        {p.stato === 'da_pagare' && (
          <section className="scheda bg-non-stampa">
            {pagato ? <p><strong>Pagamento ricevuto da Stripe:</strong> lo stiamo registrando, tra pochi secondi aggiorna la pagina.</p> : (
              <>
                <p>Da pagare <strong>{euro(p.totale_cent)}</strong>. Quando la segreteria vede il pagamento ti arrivano i biglietti per email (e compaiono qui).</p>
                {p.link_pagamento && <a href={p.link_pagamento} target="_blank" rel="noopener noreferrer" className="btn btn-primario btn-pieno">Paga {euro(p.totale_cent)}</a>}
                <p>Nella causale scrivi: <strong>{causale}</strong></p>
                {p.istruzioni_pagamento && <p className="piccolo" style={{ whiteSpace: 'pre-line' }}>{p.istruzioni_pagamento}</p>}
                {p.scade_at && <p className="piccolo muto">I posti restano tenuti fino al {new Date(p.scade_at).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' })}.</p>}
              </>
            )}
            <Azioni token={token} carta={!pagato && p.stripe && stripeAttivo()} />
          </section>
        )}
        {p.stato === 'scaduta' && <div className="scheda">La prenotazione è scaduta perché il pagamento non è arrivato in tempo, e i posti sono stati liberati. Se hai pagato scrivici: la sistemiamo.</div>}
        {p.stato === 'annullata' && <div className="scheda">Questa prenotazione è stata annullata.</div>}

        {confermata && (
          <>
            <div className="bg-non-stampa bg-stampa-riga">
              <p className="piccolo">Mostra il QR all&apos;ingresso dal telefono, oppure stampali: un biglietto per persona.</p>
              <Azioni stampa />
            </div>
            <div className="bg-biglietti">
              {p.biglietti.map((x) => (
                <article key={x.codice} className={`bg-biglietto${x.entrato ? ' usato' : ''}`}>
                  <div className="bg-qr" dangerouslySetInnerHTML={{ __html: qrSvg(`${sito}/gestione/biglietteria/ingresso?b=${x.codice}`) }} />
                  <div className="bg-testo">
                    <span className="occhiello">{p.evento}</span>
                    <strong>{x.spettacolo || p.spettacolo}</strong>
                    <span>{quandoSpettacolo(x.inizio || p.inizio)}</span>
                    <span className="bg-intestatario">{x.nome || `${p.nome} ${p.cognome}`}</span>
                    {(x.allievo ?? p.allievo) && <span className="piccolo">per {x.allievo ?? p.allievo}</span>}
                    <span className="piccolo">Biglietto {x.numero} di {x.di || p.posti}{x.pizze > 0 ? ` · ${x.pizze} ${x.pizze === 1 ? 'pizza' : 'pizze'}` : ''}</span>
                    <span className="bg-cod">{x.codice}</span>
                    {x.entrato && <span className="tag tag-neutro">già usato</span>}
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
        <p className="piccolo muto bg-non-stampa" style={{ marginTop: 24 }}><Link href={`/saggio?b=${p.slug}`} prefetch={false}>Prenota altri posti</Link></p>
      </main>
    </>
  );
}
