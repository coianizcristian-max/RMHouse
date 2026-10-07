'use client';
import { useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// Link del menù e dei pulsanti principali: la pagina parte a caricarsi PRIMA del clic.
// • appena il link entra nello schermo Next prepara lo scheletro della pagina (prefetch normale);
// • se il mouse resta sul link 120 ms (quindi non un passaggio di sfuggita), o appena si preme col dito,
//   si chiede al server la pagina intera: al clic è spesso già arrivata (vale un minuto, poi si rilegge).
export default function LinkVeloce({ href, children, prefetch, onPointerEnter, onPointerLeave, onPointerDown, onFocus, onBlur, ...resto }) {
  const router = useRouter();
  const timer = useRef(null);
  const fatto = useRef('');
  const prepara = () => {
    if (fatto.current === href) return;
    fatto.current = href;
    try { router.prefetch(href); } catch { /* niente */ }
  };
  // i gestori passati dal chiamante (es. il menù che si apre al passaggio) restano e si sommano ai nostri
  return (
    <Link href={href} prefetch={prefetch} {...resto}
          onPointerEnter={(e) => { onPointerEnter?.(e); if (e.pointerType === 'mouse') { clearTimeout(timer.current); timer.current = setTimeout(prepara, 120); } }}
          onPointerLeave={(e) => { onPointerLeave?.(e); clearTimeout(timer.current); }}
          onPointerDown={(e) => { onPointerDown?.(e); prepara(); }}
          onFocus={(e) => { onFocus?.(e); clearTimeout(timer.current); timer.current = setTimeout(prepara, 200); }}
          onBlur={(e) => { onBlur?.(e); clearTimeout(timer.current); }}>
      {children}
    </Link>
  );
}
