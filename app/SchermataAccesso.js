import Link from 'next/link';

// Impaginazione comune delle due porte d'ingresso (staff e iscritti):
// su computer un pannello con il logo a sinistra e la scheda a destra,
// sul telefono solo la scheda, con il logo piccolo in alto.
export default function SchermataAccesso({ tipo, titolo, testo, children, altra }) {
  const staff = tipo === 'staff';
  return (
    <div className={`accesso ${staff ? 'staff' : 'iscritti'}`}>
      {/* sul telefono: in alto il logo grande su bianco, con la punta verso il basso */}
      <div className="accesso-cima" aria-hidden="true"><img src="/logo.png" alt="" /></div>
      <aside className="accesso-lato" aria-hidden="true">
        <img src="/logo.png" alt="" />
        <p>{staff ? 'Il gestionale della scuola' : 'La tua scuola, dal telefono'}</p>
        <ul>
          {(staff
            ? ['Palinsesto e appelli', 'Iscrizioni, scadenze e incassi', 'Tutto anche dal telefono']
            : ['Le tue lezioni e i recuperi', 'Pagamenti, moduli e certificato', 'Il pass per entrare']
          ).map((x) => <li key={x}>{x}</li>)}
        </ul>
      </aside>
      <main className="accesso-corpo">
        <div className="accesso-scheda">
          <Link href="/?sito=1" className="accesso-logo" aria-label="Ritmo Metropolitano, torna alla home">
            <img src="/logo-marchio.png" alt="" width="78" height="50" />
          </Link>
          <span className={`accesso-chip${staff ? ' staff' : ''}`}>{staff ? 'Area staff' : 'Area iscritti'}</span>
          <h1>{titolo}</h1>
          {testo && <p className="accesso-testo">{testo}</p>}
          {children}
        </div>
        {altra && (
          <Link href={altra.href} className="accesso-altra">
            <span><strong>{altra.titolo}</strong><span>{altra.testo}</span></span>
            <span aria-hidden="true">→</span>
          </Link>
        )}
        <Link href="/?sito=1" className="accesso-home">← Torna al sito</Link>
      </main>
    </div>
  );
}
