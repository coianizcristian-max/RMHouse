import Link from 'next/link';
import Testata from '../../Testata';

export const metadata = { title: 'Prova confermata · Ritmo Metropolitano', robots: { index: false } };

export default function ProvaPagata() {
  return (
    <>
      <Testata />
      <main className="pagina" style={{ maxWidth: 560 }}>
        <h1>Pagamento ricevuto 🎉</h1>
        <p>La tua lezione di prova è confermata. Tra pochi minuti ti arriva l'email con tutte le informazioni, e il giorno prima ti ricordiamo l'appuntamento.</p>
        <p className="piccolo muto">Se l'email non arriva, controlla nella posta indesiderata o scrivici.</p>
        <Link className="btn" href="/">Torna al sito</Link>
      </main>
    </>
  );
}
