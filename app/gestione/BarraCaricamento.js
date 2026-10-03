'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

// Appena si tocca un link (o "Mostra" di un filtro) compare in alto una barra rossa che avanza,
// e il link toccato si "accende": si capisce subito che la pagina sta arrivando, senza toccare di nuovo.
export default function BarraCaricamento() {
  const path = usePathname();
  const sp = useSearchParams();
  const [attiva, setAttiva] = useState(false);
  const meta = useRef(null);   // l'indirizzo che stiamo aspettando

  // pagina arrivata: via la barra
  useEffect(() => {
    setAttiva(false);
    document.querySelectorAll('[data-in-arrivo]').forEach((el) => el.removeAttribute('data-in-arrivo'));
  }, [path, sp]);

  useEffect(() => {
    const qui = () => window.location.pathname + window.location.search;
    function click(e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest?.('a[href]');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || !url.pathname.startsWith('/gestione')) return;
      if (url.pathname + url.search === qui()) return;          // stessa pagina (o solo un'ancora)
      a.setAttribute('data-in-arrivo', '');
      meta.current = url.pathname + url.search;
      setAttiva(true);
    }
    function invio(e) {
      const f = e.target;
      if (f?.method?.toLowerCase() === 'get' && (f.getAttribute('action') || '').startsWith('/gestione')) { meta.current = null; setAttiva(true); }
    }
    document.addEventListener('click', click, true);
    document.addEventListener('submit', invio, true);
    return () => { document.removeEventListener('click', click, true); document.removeEventListener('submit', invio, true); };
  }, []);

  // arrivati all'indirizzo giusto (o passato troppo tempo): via la barra
  useEffect(() => {
    if (!attiva) return;
    const partenza = window.location.pathname + window.location.search;
    const giro = setInterval(() => {
      const ora = window.location.pathname + window.location.search;
      if ((meta.current && ora === meta.current) || (!meta.current && ora !== partenza)) {
        setAttiva(false);
        document.querySelectorAll('[data-in-arrivo]').forEach((el) => el.removeAttribute('data-in-arrivo'));
      }
    }, 120);
    const t = setTimeout(() => setAttiva(false), 15000);
    return () => { clearInterval(giro); clearTimeout(t); };
  }, [attiva]);

  return <div className={`barra-caricamento${attiva ? ' attiva' : ''}`} role="progressbar" aria-hidden={!attiva} aria-label="Caricamento" />;
}
