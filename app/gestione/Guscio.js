'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { AREE, areaDi } from '@/lib/menu';
import AzioniRapide from './AzioniRapide';

const ICONE = {
  oggi: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></>,
  calendario: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M9 9v12M15 9v12" /></>,
  struttura: <><path d="M4 21V8l8-5 8 5v13" /><path d="M9 21v-6h6v6" /></>,
  persone: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /><path d="M16 8.2a3 3 0 0 0 0-.4M17 14.8c2.4.5 4 2.5 4 5.2" /></>,
  conti: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  esci: <><path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" /><path d="m16 15 4-3-4-3M20 12H10" /></>,
};
const Icona = ({ nome }) => <svg viewBox="0 0 24 24" aria-hidden="true">{ICONE[nome]}</svg>;

export default function Guscio({ gestione, nome, ruolo, palestraId, children }) {
  const path = usePathname();
  const router = useRouter();
  const attiva = areaDi(path);
  const aree = AREE.filter((a) => gestione || !a.soloGestione);
  const area = aree.find((a) => a.k === attiva) || aree[0];
  const voci = (area?.voci || []).filter((v) => gestione || !v.soloGestione);

  useEffect(() => {
    document.body.classList.add('con-nav');
    return () => document.body.classList.remove('con-nav');
  }, []);

  const vocePiena = (href) => href.split('?')[0];
  const voceAttiva = (v) => {
    const base = vocePiena(v.href);
    if (v.esatto) return path === base && !v.href.includes('?');
    return path === base || path.startsWith(base + '/');
  };

  async function esci() {
    await supabaseBrowser().auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <div className="guscio">
      {/* colonna delle aree: a sinistra su desktop, in basso su telefono */}
      <nav className="aree" aria-label="Aree">
        {aree.map((a) => (
          <Link key={a.k} href={a.href} aria-current={a.k === attiva ? 'page' : undefined}>
            <Icona nome={a.icona} />
            {a.titolo}
          </Link>
        ))}
        <button onClick={esci} className="solo-desktop"><Icona nome="esci" />Esci</button>
      </nav>

      <div className="colonna">
        <header className="barra">
          <div>
            <div className="piccolo muto">{area?.titolo}</div>
            <strong>{voci.find(voceAttiva)?.testo || area?.titolo}</strong>
          </div>
          <div className="piccolo muto solo-desktop">{nome} · {ruolo}</div>
          <button className="link-btn piccolo solo-mobile" onClick={esci}>Esci</button>
        </header>

        {voci.length > 0 && (
          <nav className="sottomenu" aria-label={area?.titolo}>
            <div className="titolo-colonna solo-desktop">{area?.titolo}</div>
            {voci.map((v) => (
              <Link key={v.href} href={v.href} aria-current={voceAttiva(v) ? 'page' : undefined}>{v.testo}</Link>
            ))}
          </nav>
        )}

        <main className="contenuto">{children}</main>
        {gestione && <AzioniRapide palestraId={palestraId} />}
      </div>
    </div>
  );
}
