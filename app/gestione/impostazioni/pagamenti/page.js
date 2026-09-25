import Link from 'next/link';
import { impostazioni } from '../dati';
import { stripeAttivo, stripeModo } from '@/lib/stripe';
import { euro, dataBreve } from '@/lib/formato';
import Opzioni from './Opzioni';

export const dynamic = 'force-dynamic';

const EVENTI = ['checkout.session.completed', 'checkout.session.expired', 'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed', 'invoice.paid', 'invoice.payment_failed', 'customer.subscription.deleted', 'charge.refunded'];

// Pagamenti online: stato del collegamento a Stripe, cosa si paga online, guida per accenderlo
export default async function PaginaPagamenti() {
  const { supabase, staff, palestra } = await impostazioni('id, stripe, base_url');
  const inizioMese = new Date().toISOString().slice(0, 8) + '01';
  const [{ data: online }, { data: errori }, { data: ricorrenti }, { data: eventi }] = await Promise.all([
    supabase.from('pagamenti').select('importo_cent, commissione_cent').eq('palestra_id', staff.palestra_id)
      .in('metodo', ['online', 'stripe']).eq('stato', 'pagato').gte('pagato_at', inizioMese),
    supabase.from('acquisti_online').select('id, errore, created_at, allievi ( id, nome, cognome ), tipi_abbonamento ( nome ), corsi ( nome )')
      .eq('palestra_id', staff.palestra_id).eq('stato', 'errore').order('created_at', { ascending: false }).limit(10),
    supabase.from('abbonamenti_ricorrenti').select('id, stato').eq('palestra_id', staff.palestra_id),
    supabase.from('stripe_eventi').select('id, tipo, esito, ricevuto_at').order('ricevuto_at', { ascending: false }).limit(8),
  ]);
  const env = (k) => !!process.env[k];
  const attivo = stripeAttivo();
  const modo = stripeModo();
  const incassato = (online || []).reduce((s, p) => s + p.importo_cent, 0);
  const commissioni = (online || []).reduce((s, p) => s + (p.commissione_cent || 0), 0);
  const sito = (palestra.base_url || 'https://rm-house.vercel.app').replace(/\/$/, '');

  const passi = [
    ['Chiave segreta', env('STRIPE_SECRET_KEY'), 'STRIPE_SECRET_KEY', 'Su Stripe: Sviluppatori → Chiavi API → Chiave segreta (sk_test_… per le prove, sk_live_… per incassare davvero).'],
    ['Segreto del webhook', env('STRIPE_WEBHOOK_SECRET'), 'STRIPE_WEBHOOK_SECRET', `Su Stripe: Sviluppatori → Webhook → Aggiungi endpoint con l'indirizzo ${sito}/api/stripe/webhook e gli eventi elencati qui sotto; poi copia il "segreto di firma" (whsec_…).`],
    ['Interruttore generale', process.env.PAGAMENTI_ONLINE === 'true', 'PAGAMENTI_ONLINE', 'Scrivi true. Finché non c\'è, tutto funziona come oggi, anche con le chiavi inserite.'],
    ['Indirizzo del sito (facoltativo)', env('NEXT_PUBLIC_SITO_URL'), 'NEXT_PUBLIC_SITO_URL', `Es. ${sito}. Serve se usate un dominio vostro: è dove Stripe riporta il cliente dopo il pagamento.`],
  ];

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Impostazioni</div>
        <h1>Pagamenti online</h1>
        <p>Carte, Apple Pay e Google Pay con Stripe: prove a pagamento, abbonamenti dall'area clienti, rate, link di pagamento e rinnovo automatico.</p>
      </div>

      <div className={`ingresso-esito ${attivo ? 'ok' : 'attenzione'}`}>
        <div className="ie-segno" aria-hidden="true">{attivo ? '✓' : '!'}</div>
        <div>
          <div className="ie-titolo">{attivo ? `Attivi${modo === 'prova' ? ' in modalità di prova' : ''}` : 'Spenti'}</div>
          <div className="piccolo">
            {attivo
              ? modo === 'prova' ? 'Con le chiavi di prova nessuno paga davvero: usate la carta 4242 4242 4242 4242, una data futura e un CVC qualsiasi.' : 'Si incassa davvero.'
              : 'È tutto pronto: mancano solo le chiavi su Vercel (qui sotto cosa inserire). Fino ad allora prove e abbonamenti si pagano in segreteria come oggi.'}
          </div>
        </div>
      </div>

      <div className="kpi" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        <div className="tessera"><div className="etichetta">Incassato online nel mese</div><div className="cifra">{euro(incassato)}</div></div>
        <div className="tessera"><div className="etichetta">Commissioni Stripe</div><div className="cifra">{euro(commissioni)}</div>
          <div className="sotto">{incassato ? `${((commissioni / incassato) * 100).toFixed(1).replace('.', ',')}% dell'incassato` : '—'}</div></div>
        <div className="tessera"><div className="etichetta">Rinnovi automatici</div><div className="cifra">{(ricorrenti || []).filter((r) => r.stato !== 'annullato').length}</div>
          <div className="sotto">{(ricorrenti || []).filter((r) => r.stato === 'in_ritardo').length} con addebito non riuscito</div></div>
      </div>

      <div className="scheda-due">
        <div>
          <Opzioni palestra={palestra} />
          {(errori || []).length > 0 && (
            <section className="pannello" style={{ borderColor: 'var(--rosso)' }}>
              <h2>Pagati ma da sistemare</h2>
              <p className="piccolo muto" style={{ marginTop: -4 }}>Il pagamento è arrivato ma l'iscrizione non si è potuta creare (per esempio il corso era già attivo): falla a mano dalla scheda.</p>
              <ul className="mini-lista">
                {errori.map((e) => (
                  <li key={e.id}><Link href={`/gestione/persone/${e.allievi?.id}`}>
                    <span className="ml-testo"><strong>{e.allievi?.nome} {e.allievi?.cognome}</strong>
                      <span className="piccolo muto">{e.tipi_abbonamento?.nome} · {e.corsi?.nome} · {dataBreve(e.created_at)} · {e.errore}</span></span>
                  </Link></li>
                ))}
              </ul>
            </section>
          )}
          {(eventi || []).length > 0 && (
            <section className="pannello">
              <h2>Ultimi messaggi da Stripe</h2>
              <ul className="mini-lista">
                {eventi.map((e) => (
                  <li key={e.id}><span className="ml-riga"><span className="ml-testo"><strong>{e.tipo}</strong>
                    <span className="piccolo muto">{dataBreve(e.ricevuto_at)} · {e.esito || 'in lavorazione'}</span></span></span></li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <aside>
          <section className="pannello">
            <h2>Per accenderli</h2>
            <p className="piccolo muto" style={{ marginTop: -4 }}>Su Vercel → progetto → Settings → Environment Variables, poi Redeploy.</p>
            <ul className="elenco-stati">
              {passi.map(([nome, ok, variabile, aiuto]) => (
                <li key={variabile} className={ok ? 'ok' : 'manca'}>
                  <span className="es-segno" aria-hidden="true">{ok ? '✓' : '!'}</span>
                  <span><strong>{nome}</strong> <code>{variabile}</code><span className="piccolo muto" style={{ display: 'block' }}>{aiuto}</span></span>
                </li>
              ))}
            </ul>
            <h3 style={{ marginTop: 14 }}>Eventi da spuntare nel webhook</h3>
            <pre className="codice">{EVENTI.join('\n')}</pre>
            <h3>Portale clienti</h3>
            <p className="piccolo muto">Su Stripe: Impostazioni → Fatturazione → Portale clienti → Attiva. Serve per cambiare carta e disdire il rinnovo automatico.</p>
          </section>
        </aside>
      </div>
    </>
  );
}
