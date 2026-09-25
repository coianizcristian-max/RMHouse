import Link from 'next/link';
import Testata from './Testata';
import { supabaseServer } from '@/lib/supabase/server';
import { SLUG } from '@/lib/palestra';

export const revalidate = 300;

const Icona = ({ d }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);

// La porta d'ingresso del sito: prova, affitto sale, e i due accessi ben visibili
export default async function Home() {
  const supabase = await supabaseServer();
  const { data: pal } = await supabase.from('palestre').select('nome, indirizzo, telefono, email').eq('slug', SLUG).maybeSingle();

  return (
    <>
      <Testata destra={<a href="#entra" className="testata-link">Accedi</a>} />
      <main className="home">
        <section className="home-hero">
          <img src="/logo.png" alt="Ritmo Metropolitano, acrobatic and dance center" className="home-logo" />
          <div className="home-testo">
            <h1>Prova una lezione da noi</h1>
            <p>Aerea, pole, danza, acrobatica e molto altro: scegli la disciplina, trova l'orario giusto per età e livello e prenota in un minuto.</p>
            <div className="home-bottoni">
              <Link href="/prova" className="btn btn-primario btn-grande">Prenota la lezione di prova</Link>
              <Link href="/spazi" className="btn btn-grande">Affitta una sala o una festa</Link>
            </div>
          </div>
        </section>

        <section id="entra" className="home-porte" aria-label="Accedi">
          <Link href="/area" className="porta">
            <span className="porta-icona"><Icona d={<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></>} /></span>
            <span className="porta-testo">
              <strong>La mia area</strong>
              <span>Allievi e genitori: lezioni, recuperi, pagamenti e il pass per entrare.</span>
            </span>
            <span className="porta-freccia" aria-hidden="true">→</span>
          </Link>
          <Link href="/login" className="porta porta-scura">
            <span className="porta-icona"><Icona d={<><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>} /></span>
            <span className="porta-testo">
              <strong>Area staff</strong>
              <span>Segreteria e insegnanti: palinsesto, appelli, iscrizioni.</span>
            </span>
            <span className="porta-freccia" aria-hidden="true">→</span>
          </Link>
        </section>

        {pal && (pal.indirizzo || pal.telefono || pal.email) && (
          <footer className="home-piede">
            <strong>{pal.nome}</strong>
            {pal.indirizzo && <span>{pal.indirizzo}</span>}
            <span className="home-contatti">
              {pal.telefono && <a href={`tel:${pal.telefono.replace(/\s/g, '')}`}>{pal.telefono}</a>}
              {pal.email && <a href={`mailto:${pal.email}`}>{pal.email}</a>}
            </span>
            <Link href="/privacy" className="piccolo">Privacy</Link>
          </footer>
        )}
      </main>
    </>
  );
}
