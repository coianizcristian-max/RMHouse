import Link from 'next/link';
import { oggiISO, spostaGiorni } from '@/lib/formato';
import Filtri from './Filtri';

// Navigazione della settimana e filtri, uguali per palinsesto e agenda: tutto su una riga,
// i filtri sono menù a tendina invece di decine di pulsanti
export default function Barra({ base, inizio, fine, sale, insegnanti, sedi = [], sala, insegnante, mie, sede }) {
  const settimanaCorrente = inizio <= oggiISO() && oggiISO() <= fine;
  const qs = (da) => {
    const p = new URLSearchParams({ da });
    Object.entries({ sala, insegnante, mie, sede }).forEach(([k, v]) => v && p.set(k, v));
    return `${base}?${p.toString()}`;
  };
  return (
    <div className="barra-cal">
      <div className="bc-settimana">
        <Link prefetch={false} className="btn btn-piccolo" href={qs(spostaGiorni(inizio, -7))} aria-label="Settimana precedente">‹</Link>
        <strong>
          {new Date(inizio + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} –{' '}
          {new Date(fine + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
        </strong>
        <Link prefetch={false} className="btn btn-piccolo" href={qs(spostaGiorni(inizio, 7))} aria-label="Settimana successiva">›</Link>
        {!settimanaCorrente && <Link prefetch={false} className="btn btn-piccolo" href={qs(oggiISO())}>Oggi</Link>}
      </div>
      <Filtri base={base} inizio={inizio} sale={sale} insegnanti={insegnanti} sedi={sedi}
              scelti={{ sala: sala || '', insegnante: insegnante || '', mie: mie || '', sede: sede || '' }} />
    </div>
  );
}
