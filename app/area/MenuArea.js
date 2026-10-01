'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Le quattro voci dell'app. Sul telefono: barra in basso (dove arriva il pollice);
// sul computer: le stesse voci in alto. Il Pass è sempre in testata.
const VOCI = [
  ['/area', 'Lezioni', 'lezioni'],
  ['/area/orario', 'Orario', 'orario'],
  ['/area/recuperi', 'Prenota', 'prenota'],
  ['/area/io', 'Io', 'io'],
];
const ICONE = {
  lezioni: <><path d="M4 6h16M4 12h16M4 18h10" /></>,
  orario: <><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M8 2v4M16 2v4M3 10h18M8 14h3M8 17h6" /></>,
  prenota: <><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M8 2v4M16 2v4M12 11v6M9 14h6" /></>,
  io: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>,
};
// le pagine che stanno "dentro" Io
const DENTRO_IO = ['/area/io', '/area/pagamenti', '/area/eventi', '/area/moduli', '/area/privacy', '/area/pass', '/area/scuola'];

export default function MenuArea() {
  const path = usePathname() || '';
  if (path.startsWith('/area/accedi')) return null;
  const attiva = (href) => (href === '/area/io' ? DENTRO_IO.includes(path)
    : href === '/area/recuperi' ? ['/area/recuperi', '/area/acquista', '/area/personal'].includes(path) : path === href);

  return (
    <>
      <nav className="menu-area" aria-label="La mia area">
        {VOCI.map(([href, testo]) => (
          <Link prefetch={false} key={href} href={href} aria-current={attiva(href) ? 'page' : undefined}>{testo}</Link>
        ))}
      </nav>
      <nav className="barra-area" aria-label="La mia area">
        {VOCI.map(([href, testo, icona]) => (
          <Link prefetch={false} key={href} href={href} aria-current={attiva(href) ? 'page' : undefined}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONE[icona]}</svg>
            <span>{testo}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
