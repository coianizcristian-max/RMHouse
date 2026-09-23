import Testata from '../Testata';
import Richiesta from './Richiesta';

export const metadata = { title: 'Affitto sale ed eventi · Ritmo Metropolitano' };

export default function PaginaSpazi() {
  return (
    <>
      <Testata />
      <main className="pagina"><Richiesta /></main>
    </>
  );
}
