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
  impostazioni: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  esci: <><path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" /><path d="m16 15 4-3-4-3M20 12H10" /></>,
};
const Icona = ({ nome }) => <svg viewBox="0 0 24 24" aria-hidden="true">{ICONE[nome]}</svg>;

export default function Guscio({ gestione, nome, ruolo, palestraId, funzioni = {}, nascoste = [], children }) {
  const path = usePathname();
  const router = useRouter();
  const attiva = areaDi(path);
  // una voce è visibile se il ruolo base la permette, la funzione è accesa e il ruolo su misura non la nasconde
  const visibile = (v) => (gestione || !v.soloGestione) && (!v.funzione || funzioni[v.funzione] !== false) && !nascoste.includes(v.href);
  const aree = AREE.filter((a) => (gestione || !a.soloGestione) && a.voci.some(visibile));
  const area = aree.find((a) => a.k === attiva) || aree[0];
  const voci = (area?.voci || []).filter(visibile);
  // la pagina aperta corrisponde a una voce nascosta dal ruolo su misura?
  const bloccata = nascoste.length > 0 && AREE.flatMap((a) => a.voci)
    .filter((v) => v.esatto ? path === v.href : path === v.href || path.startsWith(v.href + '/'))
    .sort((x, y) => y.href.length - x.href.length)[0];
  const vietata = bloccata && nascoste.includes(bloccata.href);

  useEffect(() => {
    document.body.classList.add('con-nav');
    return () => document.body.classList.remove('con-nav');
  }, []);

  // Ogni voce ha la sua pagina: si illumina solo quella giusta.
  // Fra due voci annidate (es. /gestione e /gestione/oggi) vince la più lunga.
  const combacia = (v) => {
    const base = v.href.split('?')[0];
    if (v.esatto) return path === base;
    return path === base || path.startsWith(base + '/');
  };
  const scelta = voci.filter(combacia).sort((a, b) => b.href.length - a.href.length)[0];
  const voceAttiva = (v) => v === scelta;

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
          <Link key={a.k} href={a.voci.find(visibile)?.href || a.href} aria-current={a.k === attiva ? 'page' : undefined}>
            <Icona nome={a.icona} />
            {a.titolo}
          </Link>
        ))}
        <button onClick={esci} className="solo-desktop"><Icona nome="esci" />Esci</button>
      </nav>

      <div className="colonna">
        <header className="barra">
          <div className="briciole">
            <span>{area?.titolo}</span>
            {scelta && <><span aria-hidden="true">›</span><span className="corrente">{scelta.testo}</span></>}
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

        <main className="contenuto">
          {vietata ? (
            <div className="vuoto" style={{ marginTop: 30 }}>
              <strong>Questa pagina non è disponibile per il tuo ruolo.</strong>
              <div className="piccolo muto" style={{ marginTop: 6 }}>Se ti serve, chiedi all'amministrazione.</div>
            </div>
          ) : children}
        </main>
        {gestione && <AzioniRapide palestraId={palestraId} />}
      </div>
    </div>
  );
}
