import Link from 'next/link';
import Testata from '../Testata';

export const metadata = { title: 'Pagamento ricevuto · Ritmo Metropolitano', robots: { index: false } };

export default function Pagato() {
  return (
    <>
      <Testata />
      <main className="pagina" style={{ maxWidth: 560 }}>
        <h1>Pagamento ricevuto, grazie!</h1>
        <p>Lo abbiamo già registrato. Se ti serve la ricevuta, chiedila in segreteria.</p>
        <Link className="btn" href="/area">Vai alla tua area</Link>
      </main>
    </>
  );
}
