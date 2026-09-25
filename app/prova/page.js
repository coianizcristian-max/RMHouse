import Testata from '../Testata';
import Percorso from './Percorso';

export const metadata = { title: 'Prenota la lezione di prova · Ritmo Metropolitano' };

export default async function PaginaProva({ searchParams }) {
  const { pagamento } = await searchParams;
  return (
    <>
      <Testata />
      <main className="pagina">
        {pagamento === 'annullato' && (
          <div className="errore" role="status" style={{ background: 'var(--carta)', color: 'var(--testo)' }}>
            Il pagamento non è stato completato, quindi la prova non è confermata. Puoi prenotarla di nuovo qui sotto.
          </div>
        )}
        <Percorso />
      </main>
    </>
  );
}
