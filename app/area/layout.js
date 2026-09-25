import Link from 'next/link';
import Testata from '../Testata';
import MenuArea from './MenuArea';
import { aspettoAreaCliente } from '@/lib/palestra';

export const metadata = { title: 'La mia area · Ritmo Metropolitano' };

export default async function LayoutArea({ children }) {
  const aspetto = await aspettoAreaCliente();
  const colore = /^#[0-9a-f]{6}$/i.test(aspetto.colore || '') ? aspetto.colore : null;
  return (
    <div style={colore ? { '--rosso': colore, '--rosso-scuro': colore } : undefined}>
      <Testata destra={<Link href="/area" className="piccolo">La mia area</Link>} />
      <MenuArea />
      <main className="pagina">{children}</main>
    </div>
  );
}
