'use client';
import { useEffect, useState } from 'react';

// La pagina di benvenuto del link pubblico: la locandina a tutto schermo (computer e telefono).
// Toccandola si apre la prenotazione. Senza locandina si va diretti alla prenotazione.
export default function Benvenuto({ desktop, mobile, titolo, children }) {
  const [dentro, setDentro] = useState(!desktop && !mobile);
  // tornando indietro col telefono si rivede la locandina invece di uscire dalla pagina
  useEffect(() => {
    if (!dentro || (!desktop && !mobile)) return undefined;
    const via = () => setDentro(false);
    window.addEventListener('popstate', via);
    return () => window.removeEventListener('popstate', via);
  }, [dentro, desktop, mobile]);
  function entra() {
    setDentro(true);
    try { window.history.pushState({ prenota: 1 }, ''); window.scrollTo({ top: 0 }); } catch { /* niente */ }
  }
  if (dentro) return children;
  return (
    <button type="button" className="bg-benvenuto" onClick={entra} aria-label={`${titolo}: tocca per prenotare`}>
      <picture>
        {mobile && <source media="(max-width: 700px)" srcSet={mobile} />}
        <img src={desktop || mobile} alt={titolo} />
      </picture>
      <span className="bg-benvenuto-invito">Prenota il tuo posto →</span>
    </button>
  );
}
