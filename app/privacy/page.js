import Testata from '../Testata';

export const metadata = { title: 'Informativa privacy · Ritmo Metropolitano' };

// BOZZA: il testo definitivo va fatto verificare (dati di minori e certificati medici).
export default function Privacy() {
  return (
    <>
      <Testata />
      <main className="pagina">
        <h1>Informativa privacy</h1>
        <p>Titolare del trattamento: Ritmo Metropolitano, [indirizzo], [email].</p>
        <p>
          Usiamo i dati che ci lasci (nome, contatti, data di nascita, e per i minori i dati del genitore)
          per gestire la lezione di prova, l'iscrizione, i pagamenti e le comunicazioni di servizio
          (conferme, promemoria, scadenze).
        </p>
        <p>
          Le comunicazioni promozionali le inviamo solo se hai dato il consenso, e puoi revocarlo in qualsiasi momento
          rispondendo a una nostra email.
        </p>
        <p>
          I dati sono conservati su server nell'Unione Europea e non vengono ceduti a terzi, salvo i fornitori
          necessari al servizio (hosting, invio email, pagamenti, fatturazione elettronica).
        </p>
        <p className="muto piccolo">Testo provvisorio da completare con i diritti dell'interessato e i tempi di conservazione.</p>
      </main>
    </>
  );
}
