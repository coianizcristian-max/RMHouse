import Testata from '../Testata';
import Percorso from './Percorso';

export const metadata = { title: 'Prenota la lezione di prova · Ritmo Metropolitano' };

export default function PaginaProva() {
  return (
    <>
      <Testata />
      <main className="pagina">
        <Percorso />
      </main>
    </>
  );
}
