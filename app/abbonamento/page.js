import Testata from '../Testata';

export const metadata = { title: 'Abbonamento · Ritmo Metropolitano' };

// FASE 3: qui il cliente sceglierà il tipo di abbonamento e pagherà online (Stripe);
// al pagamento verrà creata l'iscrizione con gli orari scelti.
export default function Abbonamento() {
  return (
    <>
      <Testata />
      <main className="pagina">
        <h1>Vuoi continuare con noi?</h1>
        <p>
          L'acquisto online dell'abbonamento sarà disponibile a breve.
          Per ora rispondi all'email che hai ricevuto o passa in segreteria: ti iscriviamo al corso in un attimo.
        </p>
      </main>
    </>
  );
}
