'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const VOCI = [
  ['/area', 'Le mie lezioni'],
  ['/area/recuperi', 'Prenota'],
  ['/area/eventi', 'Eventi'],
  ['/area/moduli', 'Moduli'],
  ['/area/pagamenti', 'Pagamenti'],
  ['/area/pass', 'Pass'],
  ['/area/privacy', 'I miei dati'],
];

const Icona = ({ d }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
const ICONE = {
  lezioni: <><path d="M4 6h16M4 12h16M4 18h10" /></>,
  prenota: <><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M8 2v4M16 2v4M12 11v6M9 14h6" /></>,
  pass: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3M21 14v7h-7" /></>,
  altro: <><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></>,
};

// Sul computer: le voci in alto. Sul telefono (dove si usa quasi sempre):
// una barra in basso con le tre cose che servono di più, e "Altro" per il resto.
export default function MenuArea() {
  const path = usePathname();
  const [altro, setAltro] = useState(false);
  useEffect(() => { setAltro(false); }, [path]);
  if (path?.startsWith('/area/accedi')) return null;
  const inAltro = ['/area/eventi', '/area/moduli', '/area/pagamenti', '/area/privacy'].includes(path);

  return (
    <>
      <nav className="menu-area" aria-label="La mia area">
        {VOCI.map(([href, testo]) => (
          <Link prefetch={false} key={href} href={href} aria-current={path === href ? 'page' : undefined}>{testo}</Link>
        ))}
      </nav>

      <nav className="barra-area" aria-label="La mia area">
        <Link prefetch={false} href="/area" aria-current={path === '/area' ? 'page' : undefined}><Icona d={ICONE.lezioni} /><span>Lezioni</span></Link>
        <Link prefetch={false} href="/area/recuperi" aria-current={path === '/area/recuperi' ? 'page' : undefined}><Icona d={ICONE.prenota} /><span>Prenota</span></Link>
        <Link prefetch={false} href="/area/pass" aria-current={path === '/area/pass' ? 'page' : undefined}><Icona d={ICONE.pass} /><span>Pass</span></Link>
        <button type="button" aria-expanded={altro} aria-current={inAltro ? 'page' : undefined} onClick={() => setAltro(!altro)}>
          <Icona d={ICONE.altro} /><span>Altro</span>
        </button>
      </nav>

      {altro && (
        <div className="foglio-sfondo" onClick={() => setAltro(false)}>
          <div className="foglio-altro" role="dialog" aria-label="Altro" onClick={(e) => e.stopPropagation()}>
            <Link prefetch={false} href="/area/eventi">Eventi e stage<span>›</span></Link>
            <Link prefetch={false} href="/area/moduli">Moduli da firmare<span>›</span></Link>
            <Link prefetch={false} href="/area/pagamenti">Pagamenti e ricevute<span>›</span></Link>
            <Link prefetch={false} href="/area/privacy">I miei dati e privacy<span>›</span></Link>
            <button type="button" className="link-btn" onClick={() => setAltro(false)}>Chiudi</button>
          </div>
        </div>
      )}
    </>
  );
}
