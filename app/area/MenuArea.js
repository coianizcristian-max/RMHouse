'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const VOCI = [
  ['/area', 'Le mie lezioni'],
  ['/area/recuperi', 'Recuperi'],
  ['/area/eventi', 'Eventi'],
  ['/area/moduli', 'Moduli'],
  ['/area/pagamenti', 'Pagamenti'],
  ['/area/pass', 'Pass'],
];

// Le tre sezioni dell'area cliente: fuori dal guscio della gestione,
// quindi con uno stile suo e la voce attiva in evidenza.
export default function MenuArea() {
  const path = usePathname();
  if (path?.startsWith('/area/accedi')) return null;

  return (
    <nav className="menu-area" aria-label="La mia area">
      {VOCI.map(([href, testo]) => (
        <Link key={href} href={href} aria-current={path === href ? 'page' : undefined}>{testo}</Link>
      ))}
    </nav>
  );
}
