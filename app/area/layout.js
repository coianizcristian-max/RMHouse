import Link from 'next/link';
import Testata from '../Testata';

export const metadata = { title: 'La mia area · Ritmo Metropolitano' };

export default function LayoutArea({ children }) {
  return (
    <>
      <Testata destra={<Link href="/area" className="piccolo">La mia area</Link>} />
      <main className="pagina">{children}</main>
    </>
  );
}
