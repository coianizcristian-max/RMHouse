import Link from 'next/link';
import Testata from './Testata';

export default function NonTrovato() {
  return (
    <>
      <Testata />
      <main className="pagina">
        <h1>Pagina non trovata</h1>
        <p className="muto">Il link potrebbe essere vecchio o sbagliato.</p>
        <Link className="btn btn-primario" href="/">Torna all'inizio</Link>
      </main>
    </>
  );
}
