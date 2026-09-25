import Link from 'next/link';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { stripeAttivo } from '@/lib/stripe';
import { euro, dataBreve } from '@/lib/formato';
import PagaRata from './PagaRata';

export const dynamic = 'force-dynamic';

// Rate da pagare, rinnovi automatici e ultimi pagamenti del cliente
export default async function Pagamenti({ searchParams }) {
  const { pagato } = await searchParams;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/area/accedi');
  const [{ data: rate }, { data: ricorrenti }, { data: pagamenti }, { data: pal }] = await Promise.all([
    supabase.from('rate').select('id, descrizione, numero, di, importo_cent, scadenza, stato').eq('stato', 'da_pagare').order('scadenza'),
    supabase.from('abbonamenti_ricorrenti').select('id, stato, importo_cent, created_at, allievi ( nome ), tipi_abbonamento ( nome ), corsi ( nome )').neq('stato', 'annullato'),
    supabase.from('pagamenti').select('id, descrizione, importo_cent, metodo, pagato_at, stato').eq('stato', 'pagato').order('pagato_at', { ascending: false }).limit(12),
    supabase.from('palestre').select('stripe').limit(1).maybeSingle(),
  ]);
  const online = stripeAttivo();
  const rateOnline = online && pal?.stripe?.rate_online !== false;
  const acquisti = online && pal?.stripe?.abbonamenti_online !== false;
  const oggi = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">La mia area</div>
        <h1>Pagamenti</h1>
        {acquisti && <p><Link className="btn btn-primario" href="/abbonamento">Acquista o rinnova un abbonamento</Link></p>}
      </div>
      {pagato && <div className="errore" role="status" style={{ background: 'var(--ok-tenue)', color: 'var(--ok)' }}>Pagamento ricevuto, grazie!</div>}

      {(rate || []).length > 0 && (
        <>
          <h2 className="sezione">Rate da pagare</h2>
          <ul className="elenco">
            {rate.map((r) => (
              <li key={r.id} className="persona">
                <span>{r.descrizione} · rata {r.numero} di {r.di}
                  <span className="piccolo" style={{ display: 'block', color: r.scadenza < oggi ? 'var(--rosso-scuro)' : 'var(--testo-2)' }}>
                    {r.scadenza < oggi ? 'scaduta il' : 'scade il'} {dataBreve(r.scadenza)}
                  </span>
                </span>
                <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <strong>{euro(r.importo_cent)}</strong>
                  {rateOnline && <PagaRata id={r.id} />}
                </span>
              </li>
            ))}
          </ul>
          {!rateOnline && <p className="piccolo muto">Si pagano in segreteria.</p>}
        </>
      )}

      {(ricorrenti || []).length > 0 && (
        <>
          <h2 className="sezione">Rinnovo automatico</h2>
          <ul className="elenco">
            {ricorrenti.map((r) => (
              <li key={r.id} className="persona">
                <span>{r.tipi_abbonamento?.nome} · {r.corsi?.nome}
                  <span className="piccolo muto" style={{ display: 'block' }}>
                    {r.allievi?.nome} · {euro(r.importo_cent)} al mese{r.stato === 'in_ritardo' ? ' · ultimo addebito non riuscito' : ''}
                  </span>
                </span>
                <a className="btn btn-piccolo" href="/api/stripe/portale">Carta o disdetta</a>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className="sezione">Ultimi pagamenti</h2>
      {(pagamenti || []).length === 0 && <div className="vuoto">Nessun pagamento registrato.</div>}
      <ul className="elenco">
        {(pagamenti || []).map((p) => (
          <li key={p.id} className="persona">
            <span>{p.descrizione}<span className="piccolo muto" style={{ display: 'block' }}>{dataBreve(p.pagato_at)} · {p.metodo === 'online' || p.metodo === 'stripe' ? 'online' : p.metodo}</span></span>
            <strong>{euro(p.importo_cent)}</strong>
          </li>
        ))}
      </ul>
    </>
  );
}
