import Link from 'next/link';
import Testata from './Testata';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { SLUG } from '@/lib/palestra';

export const revalidate = 300;

const Icona = ({ d }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
const social = (u, base) => (!u ? null : /^https?:\/\//.test(u) ? u : `${base}${u.replace(/^@/, '')}`);

// La porta d'ingresso del sito. Tre cose sole, in quest'ordine:
// 1. prova una lezione (o affitta una sala) · 2. le discipline · 3. le due porte (clienti e staff)
export default async function Home() {
  const db = supabaseAdmin();
  const { data: pal } = await db.from('palestre').select('id, nome, indirizzo, telefono, email, area_cliente').eq('slug', SLUG).maybeSingle();
  const [{ data: corsi }, { data: categorie }, { data: sedi }, { data: fasce }] = pal ? await Promise.all([
    db.from('corsi').select('disciplina_id, discipline ( id, nome, colore, ordine, categoria_id, attiva )')
      .eq('palestra_id', pal.id).eq('attivo', true).eq('visibilita', 'pubblico'),
    db.from('categorie').select('id, nome, ordine').order('ordine'),
    db.from('sedi').select('nome, via, civico, citta, indirizzo, principale').eq('palestra_id', pal.id).order('ordine'),
    db.from('fasce_eta').select('nome, eta_min, eta_max').eq('palestra_id', pal.id).order('ordine'),
  ]) : [{}, {}, {}, {}];

  // le discipline che hanno almeno un corso aperto al pubblico, divise per categoria (Lezione privata a parte)
  const viste = new Map();
  for (const c of corsi || []) {
    const d = c.discipline;
    if (d && d.attiva !== false && !/privat/i.test(d.nome)) viste.set(d.id, d);
  }
  const gruppi = (categorie || [])
    .map((k) => ({ ...k, discipline: [...viste.values()].filter((d) => d.categoria_id === k.id).sort((a, b) => (a.ordine ?? 99) - (b.ordine ?? 99)) }))
    .filter((k) => k.discipline.length > 0);

  const info = pal?.area_cliente || {};
  const sede = (sedi || []).find((s) => s.principale) || (sedi || [])[0];
  const indirizzo = pal?.indirizzo
    || [sede?.via && `${sede.via}${sede.civico ? ` ${sede.civico}` : ''}`, sede?.citta].filter(Boolean).join(', ')
    || sede?.indirizzo || '';
  const instagram = social(info.instagram, 'https://instagram.com/');
  const facebook = social(info.facebook, 'https://facebook.com/');

  return (
    <>
    {/* TELEFONO: la home di sempre (logo, titolo, pulsanti, le due porte) */}
    <div className="home-telefono">
      <Testata destra={<a href="#entra" className="testata-link">Accedi</a>} />
      <main className="home">
        <section className="home-hero">
          <img src="/logo.png" alt="Ritmo Metropolitano, acrobatic and dance center" className="home-logo" />
          <div className="home-testo">
            <h1>Prova una lezione da noi</h1>
            <p>Aerea, pole, danza, acrobatica e molto altro: scegli la disciplina, trova l&apos;orario giusto per età e livello e prenota in un minuto.</p>
            <div className="home-bottoni">
              <Link href="/prova" className="btn btn-primario btn-grande">Prenota la lezione di prova</Link>
              <Link href="/spazi" className="btn btn-grande">Affitta una sala o una festa</Link>
            </div>
          </div>
        </section>
        <section id="entra" className="home-porte" aria-label="Accedi">
          <Link href="/area" prefetch={false} className="porta">
            <span className="porta-icona"><Icona d={<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></>} /></span>
            <span className="porta-testo">
              <strong>La mia area</strong>
              <span>Per chi frequenta e per i genitori: lezioni, recuperi, pagamenti e il pass per entrare.</span>
            </span>
            <span className="porta-freccia" aria-hidden="true">→</span>
          </Link>
          <Link href="/login" prefetch={false} className="porta porta-scura">
            <span className="porta-icona"><Icona d={<><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>} /></span>
            <span className="porta-testo">
              <strong>Area staff</strong>
              <span>Segreteria e insegnanti: palinsesto, appelli, iscrizioni.</span>
            </span>
            <span className="porta-freccia" aria-hidden="true">→</span>
          </Link>
        </section>
        {pal && (indirizzo || pal.telefono || pal.email) && (
          <footer className="home-piede">
            <strong>{pal.nome}</strong>
            {indirizzo && <span>{indirizzo}</span>}
            <span className="home-contatti">
              {pal.telefono && <a href={`tel:${pal.telefono.replace(/\s/g, '')}`}>{pal.telefono}</a>}
              {pal.email && <a href={`mailto:${pal.email}`}>{pal.email}</a>}
            </span>
            <span className="piccolo home-legali">
              <Link href="/privacy">Privacy</Link> · <Link href="/cookie">Cookie</Link> · <Link href="/area/privacy" prefetch={false}>I miei dati</Link>
            </span>
          </footer>
        )}
      </main>
    </div>

    {/* COMPUTER: la home nuova */}
    <div className="home-pagina">
      <Testata destra={
        <span className="hp-testata-accessi">
          <Link href="/area" prefetch={false} className="testata-link">La mia area</Link>
          <Link href="/login" prefetch={false} className="testata-link hp-staff">Staff</Link>
        </span>
      } />

      <main>
        <section className="hp-hero">
          <div className="hp-hero-dentro">
            <div className="hp-testo">
              <span className="hp-occhiello">Acrobatic and dance center{indirizzo ? ` · ${indirizzo.split(',').pop().trim()}` : ''}</span>
              <h1>Prova una lezione <span>da noi</span></h1>
              <p>Aerea, pole, danza, acrobatica e molto altro, per bambini, ragazzi e adulti.
                Scegli la disciplina, trova l&apos;orario giusto per età e livello e prenota in un minuto.</p>
              <div className="hp-bottoni">
                <Link href="/prova" className="btn btn-primario btn-grande">Prenota la lezione di prova</Link>
                <Link href="/spazi" className="btn btn-grande">Affitta una sala o una festa</Link>
              </div>
              {fasce?.length > 0 && (
                <ul className="hp-eta" aria-label="Per chi">
                  {fasce.map((f, i) => (
                    <li key={f.nome}><strong>{f.nome}</strong> {f.eta_max ? `${f.eta_min}–${f.eta_max}${i === 0 ? ' anni' : ''}` : `dai ${f.eta_min}`}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="hp-marchio" aria-hidden="true">
              <img src="/logo-bianco.png" alt="" width="900" height="573" />
            </div>
          </div>
        </section>

        <section className="hp-sezione hp-entra" aria-label="Accedi">
          <div className="hp-porte">
            <Link href="/area" prefetch={false} className="porta">
              <span className="porta-icona"><Icona d={<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></>} /></span>
              <span className="porta-testo">
                <strong>La mia area</strong>
                <span>Per chi frequenta e per i genitori: lezioni, recuperi, pagamenti e il pass per entrare.</span>
              </span>
              <span className="porta-freccia" aria-hidden="true">→</span>
            </Link>
            <Link href="/login" prefetch={false} className="porta porta-scura">
              <span className="porta-icona"><Icona d={<><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>} /></span>
              <span className="porta-testo">
                <strong>Area staff</strong>
                <span>Segreteria e insegnanti: palinsesto, appelli, iscrizioni.</span>
              </span>
              <span className="porta-freccia" aria-hidden="true">→</span>
            </Link>
          </div>
        </section>

        {gruppi.length > 0 && (
          <section className="hp-sezione" aria-labelledby="hp-discipline">
            <div className="hp-intesta">
              <h2 id="hp-discipline">Le discipline</h2>
              <Link href="/prova" className="hp-link">Vedi gli orari →</Link>
            </div>
            <div className="hp-gruppi">
              {gruppi.map((k) => (
                <div key={k.id} className="hp-gruppo">
                  <h3>{k.nome}</h3>
                  <ul>
                    {k.discipline.map((d) => (
                      <li key={d.id}><i style={{ background: d.colore || 'var(--rosso)' }} />{d.nome}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="hp-sezione" aria-labelledby="hp-come">
          <h2 id="hp-come">Come funziona la prova</h2>
          <ol className="hp-passi">
            <li><b>1</b><strong>Scegli</strong><span>Età, disciplina e livello: ti mostriamo solo i corsi giusti.</span></li>
            <li><b>2</b><strong>Prenota</strong><span>Scegli giorno e orario, lasci nome e contatti: il posto è tuo.</span></li>
            <li><b>3</b><strong>Vieni a provare</strong><span>Arriva qualche minuto prima: in segreteria ti accogliamo e ti accompagniamo in sala.</span></li>
          </ol>
        </section>

      </main>

      <footer className="hp-piede">
        <div className="hp-piede-dentro">
          <div className="hp-piede-marchio">
            <img src="/logo-marchio-bianco.png" alt="" width="64" height="41" />
            <span><strong>{pal?.nome || 'Ritmo Metropolitano'}</strong>acrobatic and dance center</span>
          </div>
          <div className="hp-piede-col">
            {indirizzo && <span>{indirizzo}</span>}
            {info.orari_apertura && <span>Aperti {info.orari_apertura}</span>}
          </div>
          <div className="hp-piede-col">
            {pal?.telefono && <a href={`tel:${pal.telefono.replace(/\s/g, '')}`}>{pal.telefono}</a>}
            {pal?.email && <a href={`mailto:${pal.email}`}>{pal.email}</a>}
            {(instagram || facebook) && (
              <span className="hp-social">
                {instagram && <a href={instagram} target="_blank" rel="noreferrer">Instagram</a>}
                {facebook && <a href={facebook} target="_blank" rel="noreferrer">Facebook</a>}
              </span>
            )}
          </div>
        </div>
        <div className="hp-piede-legali">
          <span>© {new Date().getFullYear()} {pal?.nome || 'Ritmo Metropolitano'}</span>
          <nav aria-label="Informazioni legali">
            <Link href="/privacy">Privacy</Link><Link href="/cookie">Cookie</Link><Link href="/area/privacy" prefetch={false}>I miei dati</Link>
          </nav>
        </div>
      </footer>
    </div>
    </>
  );
}
