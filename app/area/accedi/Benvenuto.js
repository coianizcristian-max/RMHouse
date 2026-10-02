'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// Schermata di benvenuto dell'app (solo telefono, una volta per apertura):
// pagina bianca con il logo, "Scorri verso l'alto per iniziare" che pulsa,
// e con il dito verso l'alto (o un tocco) sale e lascia vedere l'accesso.
// dopo: dove andare quando la pagina bianca sale (sul sito da telefono: l'area clienti, cioè l'accesso)
// subito: sul sito da telefono la pagina bianca c'è da subito, ogni volta che si apre la home
// (tranne quando si torna dal "Torna al sito": indirizzo con ?sito=1)
export default function Benvenuto({ dopo = null, subito = false }) {
  const router = useRouter();
  const [mostra, setMostra] = useState(subito);
  const [via, setVia] = useState(false);
  const [spinta, setSpinta] = useState(0);
  const inizio = useRef(null);

  useEffect(() => {
    try {
      const telefono = window.matchMedia('(max-width: 899px)').matches;
      if (subito) {
        if (!telefono || new URLSearchParams(window.location.search).has('sito')) setMostra(false);
      } else if (telefono && !sessionStorage.getItem('rm-benvenuto')) setMostra(true);
      if (telefono && dopo) router.prefetch?.(dopo);
    } catch { /* niente */ }
  }, []);

  function chiudi() {
    setVia(true);
    try { sessionStorage.setItem('rm-benvenuto', '1'); } catch { /* niente */ }
    // sul sito: la pagina resta bianca (niente home che si intravede sotto), il logo sale e si apre la pagina dopo.
    // replace: col tasto indietro non si torna alla pagina bianca
    if (dopo) { router.replace(dopo); return; }
    setTimeout(() => setMostra(false), 520);
  }
  if (!mostra) return null;

  return (
    <div className={`benvenuto${via ? (dopo ? ' parte' : ' via') : ''}`} role="dialog" aria-label="Benvenuto"
         style={!via && spinta && !dopo ? { transform: `translateY(${-spinta}px)`, transition: 'none' } : undefined}
         onTouchStart={(e) => { inizio.current = e.touches[0].clientY; }}
         onTouchMove={(e) => { if (inizio.current != null) setSpinta(Math.max(0, inizio.current - e.touches[0].clientY)); }}
         onTouchEnd={() => { if (spinta > 60) chiudi(); else setSpinta(0); inizio.current = null; }}
         onWheel={(e) => { if (e.deltaY > 10) chiudi(); }}
         onClick={chiudi}>
      <div className="bv-dentro" style={dopo && spinta && !via ? { transform: `translateY(${-spinta}px)`, transition: 'none' } : undefined}>
        <h1>Ciao!</h1>
        <img src="/logo.png" alt="Ritmo Metropolitano" className="bv-logo" />
        <button type="button" className="bv-scorri" onClick={chiudi}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6" /></svg>
          <span>Scorri verso l'alto per iniziare</span>
        </button>
      </div>
    </div>
  );
}
