'use client';

export default function Errore({ error, reset }) {
  return (
    <div>
      <h1>Qualcosa non ha funzionato</h1>
      <p className="muto">
        La pagina non è riuscita a caricare i dati. Se succede di nuovo, controlla la connessione.
      </p>
      <div className="azioni">
        <button className="btn btn-primario" onClick={reset}>Riprova</button>
      </div>
      <p className="piccolo muto" style={{ marginTop: 20 }}>{error?.message}</p>
    </div>
  );
}
