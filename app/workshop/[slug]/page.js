import Link from 'next/link';
import { notFound } from 'next/navigation';
import Testata from '../../Testata';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { SLUG } from '@/lib/palestra';
import { stripeAttivo } from '@/lib/stripe';
import { satispayAttivo } from '@/lib/satispay';
import Dettaglio from '../Dettaglio';
import { testoSemplice } from '@/lib/testoRicco';
import IscrizionePubblica from './IscrizionePubblica';

export const dynamic = 'force-dynamic';

async function leggi(slug) {
  const { data } = await supabaseAdmin().rpc('workshop_pubblico', { p_slug: slug, p_palestra_slug: SLUG });
  return data || null;
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const w = await leggi(slug);
  if (!w) return { title: 'Workshop · Ritmo Metropolitano' };
  const descr = (testoSemplice(w.descrizione) || w.sottotitolo || '').replace(/\s+/g, ' ').slice(0, 180) || undefined;
  return {
    title: `${w.titolo} · Workshop · Ritmo Metropolitano`, description: descr,
    openGraph: { title: w.titolo, description: descr, images: w.locandina_url ? [w.locandina_url] : undefined },
  };
}

// La pagina pubblica di un workshop: è il link da condividere (WhatsApp, Instagram, sito).
// Chi è già allievo/a può iscriversi dall'app (prezzo allievi); gli altri si iscrivono qui.
export default async function PaginaWorkshop({ params }) {
  const { slug } = await params;
  const w = await leggi(slug);
  if (!w) notFound();
  const carta = w.online && stripeAttivo();
  const satispay = w.online && (await satispayAttivo());
  return (
    <>
      <Testata destra={<Link href={`/area/workshop/${w.id}`} className="testata-link" prefetch={false} title="Sei già allievo/a? Entra nell'app">Entra</Link>} />
      <main className="pagina wp-pagina">
        <Dettaglio w={w} />
        {w.aperte
          ? <IscrizionePubblica w={w} carta={carta} satispay={satispay} />
          : w.stato !== 'annullato' && <div className="scheda" style={{ marginTop: 18 }}>Le iscrizioni sono chiuse. Per informazioni scrivici o passa in segreteria.</div>}
        <p className="piccolo muto" style={{ marginTop: 24 }}><Link href="/workshop" prefetch={false}>Tutti i workshop</Link></p>
      </main>
    </>
  );
}
