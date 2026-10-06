'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { oggiISO } from '@/lib/formato';

const VISTE = [[1, 'Giorno'], [3, '3 giorni'], [5, '5 giorni'], [7, 'Settimana']];

// 1 · 3 · 5 · 7 giorni: la scelta resta anche le volte dopo (su questo dispositivo)
export default function SceltaGiorni({ giorni, inizio, fine }) {
  const router = useRouter();
  const cerca = useSearchParams();
  function scegli(n) {
    try { document.cookie = `pal_giorni=${n}; path=/; max-age=31536000; samesite=lax`; } catch { /* niente */ }
    const p = new URLSearchParams(cerca.toString());
    // si parte da oggi se è nel periodo che si sta guardando, altrimenti dal primo giorno visto
    const oggi = oggiISO();
    p.set('da', inizio <= oggi && oggi <= fine ? oggi : inizio);
    p.set('giorni', String(n));
    const url = `/gestione/calendario?${p.toString()}`;
    router.push(url);
    // rete di sicurezza (come nei filtri): se la navigazione "morbida" si perde, si ricarica
    setTimeout(() => { if (window.location.search !== `?${p.toString()}`) window.location.assign(url); }, 1800);
  }
  return (
    <span className="scelta-giorni" role="group" aria-label="Quanti giorni vedere">
      {VISTE.map(([n, l]) => (
        <button key={n} type="button" aria-pressed={giorni === n} title={l} aria-label={l} onClick={() => scegli(n)}>
          {n === 7 ? '7' : n}<span className="sg-g">{n === 1 ? ' giorno' : ' giorni'}</span>
        </button>
      ))}
    </span>
  );
}
