import Testata from '../Testata';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { SLUG } from '@/lib/palestra';
import { stripeAttivo } from '@/lib/stripe';
import Prenota from './Prenota';
import Benvenuto from './Benvenuto';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Biglietti saggio · Ritmo Metropolitano', description: 'Prenota il tuo posto al saggio: scegli lo spettacolo, l\'allievo e i posti.' };

// La pagina pubblica della biglietteria (query 170): il link da mandare a genitori e amici
export default async function PaginaSaggio({ searchParams }) {
  const { b } = (await searchParams) || {};
  const { data } = await supabaseAdmin().rpc('biglietteria_pubblica', { p_palestra_slug: SLUG, p_slug: typeof b === 'string' ? b.slice(0, 80) : null });
  const carta = !!data?.stripe && stripeAttivo();
  const pagina = (
    <>
      <Testata />
      <main className="bg-pagina">
        {!data ? (
          <div className="intestazione"><h1>Biglietteria</h1><p>Le prenotazioni non sono ancora aperte. Riprova nei prossimi giorni!</p></div>
        ) : (
          <>
            <div className="intestazione">
              <div className="occhiello">Ritmo Metropolitano</div>
              <h1>{data.titolo}</h1>
              {data.sottotitolo && <p style={{ whiteSpace: 'pre-line' }}>{data.sottotitolo}</p>}
            </div>
            {data.aperta ? <Prenota b={data} carta={carta} />
              : <div className="scheda">Le prenotazioni sono chiuse. Per informazioni scrivici o passa in segreteria.</div>}
          </>
        )}
      </main>
    </>
  );
  // con la locandina: prima l'immagine a tutto schermo, toccandola si apre la prenotazione
  return data && (data.locandina_url || data.locandina_mobile_url)
    ? <Benvenuto desktop={data.locandina_url} mobile={data.locandina_mobile_url} titolo={data.titolo}>{pagina}</Benvenuto>
    : pagina;
}
