'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';

const I = (d) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
const ICONE = {
  lezioni: I(<><path d="M4 6h16M4 12h16M4 18h10" /></>),
  orario: I(<><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M8 2v4M16 2v4M3 10h18" /></>),
  prenota: I(<><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M8 2v4M16 2v4M12 11v6M9 14h6" /></>),
  io: I(<><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>),
  abbonamenti: I(<><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V4h8v3" /></>),
  carrello: I(<><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2 3h3l2.5 12h11l2-8H6.5" /></>),
  personal: I(<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>),
  sala: I(<><path d="M3 21V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v16" /><path d="M9 21v-6h6v6" /></>),
  euro: I(<><path d="M17 6a7 7 0 1 0 0 12" /><path d="M4 10h9M4 14h9" /></>),
  eventi: I(<><path d="M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" /></>),
  workshop: I(<><path d="M4 20h16" /><path d="M6 20V9l6-5 6 5v11" /><path d="M10 20v-5h4v5" /><path d="M12 4v-1" /></>),
  moduli: I(<><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></>),
  messaggi: I(<><path d="M21 12a8 8 0 0 1-12 7l-5 1 1-4.5A8 8 0 1 1 21 12Z" /></>),
  privacy: I(<><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v5h1" /></>),
  esci: I(<><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><path d="M10 17l-5-5 5-5M5 12h11" /></>),
};

// Il menù a scomparsa dell'app (come in APP Palestre, ma con le voci che servono a una scuola di danza)
export default function MenuLaterale({ aperto, chiudi, esci }) {
  const path = usePathname();
  const [chi, setChi] = useState(null);
  const [tema, setTema] = useState('auto');

  useEffect(() => { try { setTema(localStorage.getItem('rm-tema') || 'auto'); } catch { /* niente */ } }, []);
  useEffect(() => { chiudi(); }, [path]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!aperto || chi) return;
    supabaseBrowser().rpc('area_riepilogo').then(({ data }) => {
      if (data?.collegato) setChi({ nome: [data.titolare?.nome, data.titolare?.cognome].filter(Boolean).join(' '), email: data.titolare?.email, famiglia: (data.allievi || []).map((a) => a.nome) });
    });
  }, [aperto, chi]);

  function cambiaTema(t) {
    setTema(t);
    try { localStorage.setItem('rm-tema', t); } catch { /* niente */ }
    if (t === 'auto') document.documentElement.removeAttribute('data-tema');
    else document.documentElement.setAttribute('data-tema', t === 'scuro' ? 'scuro' : 'chiaro');
  }
  const voce = (href, testo, icona) => (
    // il menù si chiude sempre al tocco (anche se la pagina è la stessa o cambia solo la parte dopo #)
    <li><Link prefetch={false} href={href} onClick={chiudi} aria-current={path === href.split('#')[0] ? 'page' : undefined}>{ICONE[icona]}{testo}</Link></li>
  );

  return (
    <>
      <div className={`cl-velo${aperto ? ' visibile' : ''}`} onClick={chiudi} aria-hidden="true" />
      <aside className={`cl-cassetto${aperto ? ' aperto' : ''}`} aria-hidden={!aperto} aria-label="Menù">
        <Link prefetch={false} href="/area/io" className="cl-chi" onClick={chiudi}>
          <span className="cl-foto">{(chi?.nome || '?').split(' ').map((p) => p[0]).slice(0, 2).join('')}</span>
          <span>
            <strong>{chi?.nome || 'La mia area'}</strong>
            <span>{chi?.email || ''}</span>
            {chi?.famiglia?.length > 1 && <span style={{ display: 'block' }}>Famiglia: {chi.famiglia.join(' · ')}</span>}
          </span>
        </Link>

        <div className="cl-tema" role="group" aria-label="Tema">
          {[['auto', 'Automatico'], ['chiaro', 'Chiaro'], ['scuro', 'Scuro']].map(([k, t]) => (
            <button key={k} type="button" aria-pressed={tema === k} onClick={() => cambiaTema(k)}>{t}</button>
          ))}
        </div>

        <ul className="cl-voci">
          {voce('/area', 'Lezioni', 'lezioni')}
          {voce('/area/orario', 'Orario', 'orario')}
          {voce('/area/recuperi', 'Prenota', 'prenota')}
          {voce('/area/io', 'Io', 'io')}
        </ul>

        <Link prefetch={false} href="/area/scuola" className="cl-scuola" onClick={chiudi}>
          <img src="/logo-marchio.png" alt="" /> Ritmo Metropolitano
        </Link>

        <ul className="cl-voci">
          {voce('/area/iscriviti', 'Abbonati o rinnova', 'carrello')}
          {voce('/area/io#abbonamenti', 'I miei abbonamenti', 'abbonamenti')}
          {voce('/area/personal', 'Lezione privata', 'personal')}
          {voce('/area/sala', 'Prenota una sala', 'sala')}
          {voce('/area/pagamenti', 'Pagamenti e ricevute', 'euro')}
          {voce('/area/workshop', 'Workshop', 'workshop')}
          {voce('/area/eventi', 'Eventi e stage', 'eventi')}
          {voce('/area/moduli', 'Moduli e documenti', 'moduli')}
          {voce('/area/scuola', 'Contatti e WhatsApp', 'messaggi')}
        </ul>

        <ul className="cl-voci" style={{ borderBottom: 0 }}>
          {voce('/area/privacy', 'Privacy e i miei dati', 'privacy')}
          <li><button type="button" onClick={esci}>{ICONE.esci}Esci</button></li>
        </ul>
      </aside>
    </>
  );
}
