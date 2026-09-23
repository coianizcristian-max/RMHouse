import Link from 'next/link';
import Testata from '../Testata';

export const metadata = { title: 'La mia area · Ritmo Metropolitano' };

export default function LayoutArea({ children }) {
  return (
    <>
      <Testata destra={<Link href="/area" className="piccolo">La mia area</Link>} />
      <nav className="sottomenu" aria-label="La mia area" style={{ maxWidth: 720, margin: '0 auto' }}>
        <Link href="/area">Le mie lezioni</Link>
        <Link href="/area/recuperi">Recuperi</Link>
        <Link href="/area/eventi">Eventi</Link>
      </nav>
      <main className="pagina">{children}</main>
    </>
  );
}
