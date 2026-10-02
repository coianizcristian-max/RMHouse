'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import Testata from '../Testata';
import Benvenuto from './accedi/Benvenuto';
import MenuArea from './MenuArea';
import MenuLaterale from './MenuLaterale';
import ChiediNotifiche from './ChiediNotifiche';
import { useEffect, useState } from 'react';

// Testata e menù dell'area clienti, tranne che nella pagina di accesso (che ha la sua impaginazione)
export default function ContornoArea({ children }) {
  const path = usePathname();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  // tema scelto a mano (Automatico / Chiaro / Scuro), ricordato sul telefono
  useEffect(() => {
    try { const t = localStorage.getItem('rm-tema'); if (t === 'chiaro' || t === 'scuro') document.documentElement.setAttribute('data-tema', t); } catch { /* niente */ }
  }, []);
  async function esci() {
    await supabaseBrowser().auth.signOut();
    router.replace('/area/accedi');
    router.refresh();
  }
  if (path.startsWith('/area/accedi') || path.startsWith('/area/nuova-password')) return children;
  return (
    <>
      <Testata home="/area" sinistra={
        <button type="button" className="hamburger" aria-label="Apri il menù" aria-expanded={menu} onClick={() => setMenu(true)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
      } destra={
        <span className="testata-area">
          {/* il pass si apre da qualsiasi pagina: alla reception basta un tocco */}
          <Link prefetch={false} href="/area/pass" className="pulsante-pass" aria-label="Il mio pass">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3M21 14v7h-7" />
            </svg>
            <span>Pass</span>
          </Link>
          <button type="button" className="testata-link solo-desktop" onClick={esci}>Esci</button>
        </span>
      } />
      <Benvenuto />
      <ChiediNotifiche />
      <MenuLaterale aperto={menu} chiudi={() => setMenu(false)} esci={esci} />
      <MenuArea />
      <main className="pagina pagina-area">{children}</main>
    </>
  );
}
