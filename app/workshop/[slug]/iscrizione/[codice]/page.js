import Link from 'next/link';
import { notFound } from 'next/navigation';
import Testata from '../../../../Testata';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { stripeAttivo } from '@/lib/stripe';
import { satispayAttivo } from '@/lib/satispay';
import StatoIscrizione from './StatoIscrizione';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'La tua iscrizione · Ritmo Metropolitano', robots: { index: false } };

// "La tua iscrizione": dopo l'iscrizione dal link pubblico (e al ritorno dal pagamento). Il codice è segreto: solo chi si è iscritto lo ha.
export default async function PaginaIscrizione({ params, searchParams }) {
  const { slug, codice } = await params;
  const q = (await searchParams) || {};
  if (!/^[a-f0-9]{24,40}$/.test(codice)) notFound();
  const { data: i } = await supabaseAdmin().rpc('workshop_iscrizione_codice', { p_codice: codice });
  if (!i || i.workshop?.slug !== slug) notFound();
  const online = i.workshop.online && i.workshop.stato !== 'annullato';
  return (
    <>
      <Testata destra={<Link href="/area" className="testata-link" prefetch={false}>Area clienti</Link>} />
      <main className="pagina wp-pagina">
        <StatoIscrizione i={i} carta={online && stripeAttivo()} satispay={online && (await satispayAttivo())}
                         pagato={q.pagato === '1'} daSatispay={q.sp === '1'} erroreApertura={q.errore === '1'} />
      </main>
    </>
  );
}
