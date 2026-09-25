import Link from 'next/link';
import Testata from '../../Testata';

export const metadata = { title: 'Abbonamento acquistato · Ritmo Metropolitano', robots: { index: false } };

export default function Grazie() {
  return (
    <>
      <Testata />
      <main className="pagina" style={{ maxWidth: 560 }}>
        <h1>Fatto, ci vediamo in sala! 💪</h1>
        <p>Il pagamento è andato a buon fine e l'abbonamento è attivo con i giorni che hai scelto. Tra un minuto lo trovi nella tua area.</p>
        <Link className="btn btn-primario" href="/area">Vai alla tua area</Link>
      </main>
    </>
  );
}
