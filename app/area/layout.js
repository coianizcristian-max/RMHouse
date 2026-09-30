import ContornoArea from './ContornoArea';
import { aspettoAreaCliente } from '@/lib/palestra';

export const metadata = { title: 'La mia area · Ritmo Metropolitano' };

export default async function LayoutArea({ children }) {
  const aspetto = await aspettoAreaCliente();
  const colore = /^#[0-9a-f]{6}$/i.test(aspetto.colore || '') ? aspetto.colore : null;
  return (
    <div style={colore ? { '--rosso': colore, '--rosso-scuro': colore } : undefined}>
      <ContornoArea>{children}</ContornoArea>
    </div>
  );
}
