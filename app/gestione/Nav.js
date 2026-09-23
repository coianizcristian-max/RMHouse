'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';

const ICONE = {
  lezioni: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></>,
  calendario: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M9 9v12M15 9v12" /></>,
  corsi: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  persone: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /><path d="M16 8.2a3 3 0 0 0 0-.4M17 14.8c2.4.5 4 2.5 4 5.2" /></>,
  lead: <><path d="M4 6h16v12H4z" /><path d="m4 7 8 6 8-6" /></>,
  altro: <><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></>,
  esci: <><path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" /><path d="m16 15 4-3-4-3M20 12H10" /></>,
};

const Icona = ({ nome }) => <svg viewBox="0 0 24 24" aria-hidden="true">{ICONE[nome]}</svg>;

export default function Nav({ gestione }) {
  const path = usePathname();
  const router = useRouter();

  // lo spazio in fondo serve solo quando la barra è fissa (mobile)
  useEffect(() => {
    document.body.classList.add('con-nav');
    return () => document.body.classList.remove('con-nav');
  }, []);

  const voci = gestione
    ? [['/gestione', 'Oggi', 'lezioni'], ['/gestione/calendario', 'Settimana', 'calendario'],
       ['/gestione/persone', 'Persone', 'persone'], ['/gestione/lead', 'Lead', 'lead'],
       ['/gestione/impostazioni', 'Altro', 'altro']]
    : [['/gestione', 'Oggi', 'lezioni'], ['/gestione/calendario', 'Settimana', 'calendario']]
    ;

  const ALTRO = ['/gestione/impostazioni', '/gestione/palinsesto', '/gestione/abbonamenti',
                 '/gestione/attese', '/gestione/certificati', '/gestione/statistiche',
                 '/gestione/messaggi', '/gestione/importa', '/gestione/costi', '/gestione/corsi',
                 '/gestione/spazi', '/gestione/bacheca', '/gestione/eventi', '/gestione/oggi'];

  const attiva = (h) => {
    if (h === '/gestione') return path === h || path.startsWith('/gestione/appello');
    if (h === '/gestione/impostazioni') return ALTRO.some((x) => path.startsWith(x));
    return path.startsWith(h);
  };

  async function esci() {
    await supabaseBrowser().auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <nav className="nav-gestione" aria-label="Gestione">
      {voci.map(([href, testo, icona]) => (
        <Link key={href} href={href} aria-current={attiva(href) ? 'page' : undefined}>
          <Icona nome={icona} />
          {testo}
        </Link>
      ))}
      {!gestione && (
        <button onClick={esci}><Icona nome="esci" />Esci</button>
      )}
    </nav>
  );
}
