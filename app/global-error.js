'use client';
import { useEffect } from 'react';

// Errore anche nel layout principale (raro): se è una versione vecchia rimasta aperta, si ricarica da sola.
export default function ErroreGlobale({ error }) {
  useEffect(() => {
    if (!/Loading (CSS )?chunk|ChunkLoadError|dynamically imported module/i.test(`${error?.name || ''} ${error?.message || ''}`)) return;
    let ultima = 0;
    try { ultima = Number(sessionStorage.getItem('rm-ricaricata-per-versione') || 0); } catch { /* niente */ }
    if (Date.now() - ultima > 30000) {
      try { sessionStorage.setItem('rm-ricaricata-per-versione', String(Date.now())); } catch { /* niente */ }
      window.location.reload();
    }
  }, [error]);
  return (
    <html lang="it">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
        <h1>Qualcosa non ha funzionato</h1>
        <p>Ricarica la pagina. Se succede di nuovo, controlla la connessione.</p>
        <button onClick={() => window.location.reload()} style={{ padding: '10px 18px', fontSize: 16 }}>Ricarica la pagina</button>
      </body>
    </html>
  );
}
