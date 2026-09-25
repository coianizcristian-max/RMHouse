import Link from 'next/link';
import Testata from '../Testata';
import { supabaseServer } from '@/lib/supabase/server';
import { stripeAttivo } from '@/lib/stripe';
import Acquisto from './Acquisto';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Abbonamento · Ritmo Metropolitano' };

// Acquisto online dell'abbonamento: si sceglie per chi, cosa, il corso e i giorni, poi si paga con Stripe
export default async function Abbonamento({ searchParams }) {
  const { annullato } = await searchParams;
  const supabase = await supabaseServer();
  const { data: pal } = await supabase.from('palestre').select('id, stripe, quota_iscrizione_cent').limit(1).maybeSingle();
  const attivo = stripeAttivo() && pal?.stripe?.abbonamenti_online !== false;

  if (!attivo) {
    return (
      <>
        <Testata />
        <main className="pagina">
          <h1>Vuoi continuare con noi?</h1>
          <p>L'acquisto online dell'abbonamento sarà disponibile a breve. Per ora rispondi all'email che hai ricevuto o passa in segreteria: ti iscriviamo al corso in un attimo.</p>
        </main>
      </>
    );
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return (
      <>
        <Testata />
        <main className="pagina" style={{ maxWidth: 560 }}>
          <h1>Acquista il tuo abbonamento</h1>
          <p>Accedi alla tua area con l'email che hai dato alla scuola: poi scegli abbonamento, corso e giorni e paghi con carta.</p>
          <Link className="btn btn-primario" href="/area/accedi">Accedi</Link>
        </main>
      </>
    );
  }

  const [{ data: allievi }, { data: tipi }, { data: corsi }, { data: orari }, { data: coperti }] = await Promise.all([
    supabase.from('allievi').select('id, nome, cognome, account!inner ( user_id )').eq('account.user_id', user.id).order('created_at'),
    supabase.from('tipi_abbonamento').select('id, nome, modalita, lezioni_settimanali, num_ingressi, prezzo_cent, prezzo_web_cent, durata_mesi, durata_giorni, rinnovo_automatico, famiglia')
      .eq('palestra_id', pal.id).eq('attivo', true).eq('acquistabile_online', true).order('famiglia').order('prezzo_cent'),
    supabase.from('corsi').select('id, nome, colore').eq('palestra_id', pal.id).eq('attivo', true).order('nome'),
    supabase.from('orari').select('id, corso_id, giorno_settimana, ora_inizio, ora_fine, prenotabile').eq('palestra_id', pal.id),
    supabase.from('tipi_abbonamento_corsi').select('tipo_abbonamento_id, corso_id'),
  ]);

  return (
    <>
      <Testata destra={<Link href="/area" className="piccolo">La mia area</Link>} />
      <main className="pagina" style={{ maxWidth: 720 }}>
        {annullato && <div className="errore" role="status" style={{ background: 'var(--carta)', color: 'var(--testo)' }}>Pagamento non completato: non ti abbiamo addebitato nulla.</div>}
        <Acquisto allievi={allievi || []} tipi={tipi || []} corsi={corsi || []} orari={(orari || []).filter((o) => o.prenotabile !== false)}
                  coperti={coperti || []} rinnovo={!!pal?.stripe?.rinnovo_automatico} />
      </main>
    </>
  );
}
