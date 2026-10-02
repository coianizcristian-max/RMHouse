'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// Schermata di benvenuto dell'app (solo telefono, una volta per apertura):
// pagina bianca con il logo, "Scorri verso l'alto per iniziare" che pulsa,
// e con il dito verso l'alto (o un tocco) sale e lascia vedere l'accesso.
// dopo: dove andare quando la pagina bianca sale (sul sito da telefono: l'area clienti, cioè l'accesso)
export default function Benvenuto({ dopo = null }) {
  const router = useRouter();
  const [mostra, setMostra] = useState(false);
  const [via, setVia] = useState(false);
  const [spinta, setSpinta] = useState(0);
  const inizio = useRef(null);

  useEffect(() => {
    try {
      const telefono = window.matchMedia('(max-width: 899px)').matches;
      if (telefono && !sessionStorage.getItem('rm-benvenuto')) setMostra(true);
      if (telefono && dopo) router.prefetch?.(dopo);
    } catch { /* niente */ }
  }, []);

  function chiudi() {
    setVia(true);
    try { sessionStorage.setItem('rm-benvenuto', '1'); } catch { /* niente */ }
    if (dopo) { setTimeout(() => router.push(dopo), 380); return; }
    setTimeout(() => setMostra(false), 520);
  }
  if (!mostra) return null;

  return (
    <div className={`benvenuto${via ? ' via' : ''}`} role="dialog" aria-label="Benvenuto"
         style={!via && spinta ? { transform: `translateY(${-spinta}px)`, transition: 'none' } : undefined}
         onTouchStart={(e) => { inizio.current = e.touches[0].clientY; }}
         onTouchMove={(e) => { if (inizio.current != null) setSpinta(Math.max(0, inizio.current - e.touches[0].clientY)); }}
         onTouchEnd={() => { if (spinta > 60) chiudi(); else setSpinta(0); inizio.current = null; }}
         onWheel={(e) => { if (e.deltaY > 10) chiudi(); }}
         onClick={chiudi}>
      <h1>Ciao!</h1>
      <img src="/logo.png" alt="Ritmo Metropolitano" className="bv-logo" />
      <button type="button" className="bv-scorri" onClick={chiudi}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6" /></svg>
        <span>Scorri verso l'alto per iniziare</span>
      </button>
    </div>
  );
}
