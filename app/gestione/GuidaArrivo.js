'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { GUIDE } from '@/lib/guide';

// Arrivando da "Tutte le funzioni" (?guida=…) in cima alla pagina restano scritti i passi.
// La guida accompagna anche le pagine successive (es. Staff → scheda dell'insegnante), in piccolo, finché non si chiude.
const CHIAVE = 'rm-guida';
export default function GuidaArrivo() {
  const sp = useSearchParams();
  const path = usePathname();
  const router = useRouter();
  const [attiva, setAttiva] = useState(null);     // { id, path di arrivo }
  const [aperta, setAperta] = useState(true);

  useEffect(() => {
    const id = sp.get('guida');
    if (id && GUIDE[id]) {
      const v = { id, path };
      setAttiva(v); setAperta(true);
      try { sessionStorage.setItem(CHIAVE, JSON.stringify(v)); } catch { /* niente */ }
      return;
    }
    try {
      const v = JSON.parse(sessionStorage.getItem(CHIAVE) || 'null');
      if (v && GUIDE[v.id]) { setAttiva(v); setAperta(v.path === path); } else setAttiva(null);
    } catch { setAttiva(null); }
  }, [sp, path]);

  const g = attiva && GUIDE[attiva.id];
  if (!g) return null;
  function chiudi() {
    try { sessionStorage.removeItem(CHIAVE); } catch { /* niente */ }
    setAttiva(null);
    if (sp.get('guida')) {
      const p = new URLSearchParams(sp.toString()); p.delete('guida');
      router.replace(`${path}${p.toString() ? `?${p}` : ''}`, { scroll: false });
    }
  }
  return (
    <aside className={aperta ? 'guida-arrivo' : 'guida-arrivo compatta'} role="note" aria-label={`Come si fa: ${g.titolo}`}>
      <div className="ga-testa">
        <strong>Come si fa: {g.titolo}</strong>
        <span className="azioni-riga" style={{ gap: 6 }}>
          <button type="button" className="link-btn piccolo" onClick={() => setAperta(!aperta)}>{aperta ? 'riduci' : 'mostra i passi'}</button>
          <button type="button" className="link-btn piccolo" onClick={chiudi}>chiudi</button>
        </span>
      </div>
      {aperta && <ol>{g.passi.map((x, i) => <li key={i}>{x}</li>)}</ol>}
    </aside>
  );
}
