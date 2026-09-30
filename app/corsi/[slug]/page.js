import Link from 'next/link';
import { notFound } from 'next/navigation';
import Testata from '../../Testata';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { palestraPubblica } from '@/lib/palestra';
import { euro } from '@/lib/formato';

export const dynamic = 'force-dynamic';

const GIORNI = ['', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const pal = await palestraPubblica().catch(() => null);
  if (!pal) return { title: 'Corso' };
  const { data } = await supabaseAdmin().from('v_corsi_pubblici')
    .select('nome, descrizione').eq('palestra_id', pal.id).eq('slug', slug).maybeSingle();
  return data
    ? { title: `${data.nome} · Ritmo Metropolitano`, description: data.descrizione || undefined }
    : { title: 'Corso · Ritmo Metropolitano' };
}

// Pagina di presentazione del corso: è il link da mettere nelle campagne
export default async function PaginaCorso({ params }) {
  const { slug } = await params;
  const pal = await palestraPubblica();
  const { data: c } = await supabaseAdmin().from('v_corsi_pubblici')
    .select('*').eq('palestra_id', pal.id).eq('slug', slug).maybeSingle();
  if (!c) notFound();

  const eta = c.eta_max ? `${c.eta_min}-${c.eta_max} anni` : `dai ${c.eta_min} anni`;

  return (
    <>
      <Testata destra={<Link href="/prova" className="testata-link">Prenota</Link>} />
      <main className="pagina">
        {c.foto_url
          ? <img src={c.foto_url} alt="" className="copertina" />
          : <div className="copertina segnaposto senza-foto" style={{ fontSize: 40 }}>{c.nome.slice(0, 2).toUpperCase()}</div>}

        <div className="intestazione" style={{ marginTop: 18 }}>
          <div className="occhiello" style={{ color: c.colore || 'var(--rosso)' }}>
            {[c.categoria, c.disciplina].filter(Boolean).join(' · ')}
          </div>
          <h1>{c.nome}</h1>
          <p>{[c.fascia && `${c.fascia} (${eta})`, c.livello, c.sede].filter(Boolean).join(' · ')}</p>
        </div>

        {c.descrizione && <p style={{ whiteSpace: 'pre-wrap' }}>{c.descrizione}</p>}

        <h2 className="sezione">Quando</h2>
        {(c.orari || []).length === 0 ? (
          <div className="vuoto">Gli orari di questo corso sono in aggiornamento: scrivici e te li diciamo.</div>
        ) : (
          <ul className="elenco">
            {(c.orari || []).map((o, i) => (
              <li key={i} className="persona">
                <span>
                  <strong style={{ color: 'var(--nero)' }}>{GIORNI[o.giorno]} {o.ora}</strong>
                  <span className="piccolo muto" style={{ display: 'block' }}>
                    {o.durata} minuti{o.sala ? ` · ${o.sala}` : ''}{o.insegnante ? ` · ${o.insegnante}` : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}

        {c.insegnanti && (
          <>
            <h2 className="sezione">Con chi</h2>
            <p className="muto">{c.insegnanti}</p>
          </>
        )}

        {c.prova_abilitata && c.prenotabile && (
          <div className="scheda" style={{ marginTop: 24 }}>
            <strong style={{ display: 'block', color: 'var(--nero)' }}>Vuoi provare?</strong>
            <p className="piccolo muto" style={{ marginBottom: 12 }}>
              La prima lezione di prova {c.prezzo_prova_cent > 0 ? `costa ${euro(c.prezzo_prova_cent)}` : 'è gratuita'}.
              {c.info_prova ? ` ${c.info_prova}` : ''}
            </p>
            <Link className="btn btn-primario btn-pieno" href="/prova">Prenota la lezione di prova</Link>
          </div>
        )}
      </main>
    </>
  );
}
