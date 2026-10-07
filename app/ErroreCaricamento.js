'use client';
import { useEffect } from 'react';

// Dopo un aggiornamento pubblicato su Vercel, una pagina aperta prima cerca i pezzi della versione vecchia
// ("Loading chunk … failed"): non è un guasto, basta ricaricare. Qui si ricarica da sola (una volta ogni 30 secondi,
// così non gira in tondo) e il pulsante fa un ricaricamento vero, non un semplice "riprova".
export const erroreDiVersione = (e) => /Loading (CSS )?chunk|ChunkLoadError|dynamically imported module|Importing a module script failed/i
  .test(`${e?.name || ''} ${e?.message || ''}`);
const CHIAVE = 'rm-ricaricata-per-versione';

export default function ErroreCaricamento({ error, reset }) {
  const versione = erroreDiVersione(error);
  useEffect(() => {
    if (!versione) return;
    let ultima = 0;
    try { ultima = Number(sessionStorage.getItem(CHIAVE) || 0); } catch { /* niente */ }
    if (Date.now() - ultima > 30000) {
      try { sessionStorage.setItem(CHIAVE, String(Date.now())); } catch { /* niente */ }
      window.location.reload();
    }
  }, [versione]);

  if (versione) {
    return (
      <div style={{ padding: '8px 0' }}>
        <h1>È uscita una versione nuova</h1>
        <p className="muto">Il gestionale è stato aggiornato mentre la pagina era aperta: la ricarico.</p>
        <div className="azioni">
          <button className="btn btn-primario" onClick={() => window.location.reload()}>Ricarica la pagina</button>
        </div>
      </div>
    );
  }
  return (
    <div style={{ padding: '8px 0' }}>
      <h1>Qualcosa non ha funzionato</h1>
      <p className="muto">La pagina non è riuscita a caricare i dati. Se succede di nuovo, controlla la connessione.</p>
      <div className="azioni">
        <button className="btn btn-primario" onClick={reset}>Riprova</button>
        <button className="btn" onClick={() => window.location.reload()}>Ricarica la pagina</button>
      </div>
      <p className="piccolo muto" style={{ marginTop: 20 }}>{error?.message}</p>
    </div>
  );
}
