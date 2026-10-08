import Link from 'next/link';
import Testata from '../Testata';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { palestraPubblica } from '@/lib/palestra';
import { euro } from '@/lib/formato';
import { periodo, prezzoDa } from '@/lib/workshop';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Workshop · Ritmo Metropolitano', description: 'I workshop in programma con insegnanti ospiti: date, prezzi e iscrizione online.' };

// Tutti i workshop in programma (il link da mettere sul sito e sui social)
export default async function ElencoWorkshopPubblico() {
  const pal = await palestraPubblica();
  const db = supabaseAdmin();
  const { data: righe } = await db.from('workshop').select('slug').eq('palestra_id', pal.id).in('stato', ['pubblicato', 'chiuso']);
  const schede = (await Promise.all((righe || []).map(async (r) => (await db.rpc('workshop_pubblico', { p_slug: r.slug, p_palestra_slug: pal.slug })).data)))
    .filter((w) => w && w.fine && new Date(w.fine).getTime() > Date.now() - 6 * 3600e3)
    .sort((a, b) => String(a.inizio).localeCompare(String(b.inizio)));
  return (
    <>
      <Testata destra={<Link href="/area" className="testata-link" prefetch={false}>Area clienti</Link>} />
      <main className="pagina">
        <div className="intestazione">
          <div className="occhiello">Ritmo Metropolitano</div>
          <h1>Workshop</h1>
          <p>Lezioni speciali con insegnanti ospiti, aperte a tutti.</p>
        </div>
        {schede.length === 0 && <div className="vuoto">Nessun workshop in programma per ora.</div>}
        <div className="wa-griglia">
          {schede.map((w) => {
            const da = prezzoDa(w, true);
            return (
              <Link prefetch={false} key={w.id} href={`/workshop/${w.slug}`} className="wa-carta">
                {w.locandina_url ? <img src={w.locandina_url} alt="" className="wa-locandina" /> : <span className="wa-locandina vuota" aria-hidden="true">{w.titolo.slice(0, 2).toUpperCase()}</span>}
                <span className="wa-corpo">
                  <strong>{w.titolo}</strong>
                  <span className="piccolo muto">{[periodo(w.inizio, w.fine), w.insegnante].filter(Boolean).join(' · ')}</span>
                  {w.aperte ? <span className="wa-prezzo">{da ? `da ${euro(da)}` : 'gratuito'}</span> : <span className="tag tag-neutro">iscrizioni chiuse</span>}
                </span>
              </Link>
            );
          })}
        </div>
      </main>
    </>
  );
}
