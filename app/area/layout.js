import Link from 'next/link';
import Testata from '../Testata';
import MenuArea from './MenuArea';

export const metadata = { title: 'La mia area · Ritmo Metropolitano' };

export default function LayoutArea({ children }) {
  return (
    <>
      <Testata destra={<Link href="/area" className="piccolo">La mia area</Link>} />
      <MenuArea />
      <main className="pagina">{children}</main>
    </>
  );
}
