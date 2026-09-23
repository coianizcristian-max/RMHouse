import Link from 'next/link';
import { oggiISO, spostaGiorni } from '@/lib/formato';

// Navigazione della settimana e filtri, uguali per palinsesto e agenda
export default function Barra({ base, inizio, fine, sale, insegnanti, sedi = [], sala, insegnante, mie, sede }) {
  const filtro = (chiave, valore) => {
    const p = new URLSearchParams();
    p.set('da', inizio);
    const attuali = { sala, insegnante, mie, sede };
    attuali[chiave] = valore;
    Object.entries(attuali).forEach(([k, v]) => v && p.set(k, v));
    if (!valore) p.delete(chiave);
    return `${base}?${p.toString()}`;
  };

  return (
    <>
      <div className="giorno-nav">
        <Link className="btn" href={`${base}?da=${spostaGiorni(inizio, -7)}`} aria-label="Settimana precedente">‹</Link>
        <h1 style={{ fontSize: 18, margin: 0 }}>
          {new Date(inizio + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} –{' '}
          {new Date(fine + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
        </h1>
        <Link className="btn" href={`${base}?da=${spostaGiorni(inizio, 7)}`} aria-label="Settimana successiva">›</Link>
      </div>

      {sedi.length > 1 && (
        <div className="filtri">
          <Link href={filtro('sede', '')} aria-current={!sede ? 'true' : undefined}>Tutte le sedi</Link>
          {sedi.map((s) => (
            <Link key={s.id} href={filtro('sede', s.id)} aria-current={sede === s.id ? 'true' : undefined}>{s.nome}</Link>
          ))}
        </div>
      )}

      <div className="filtri">
        <Link href={`${base}?da=${oggiISO()}`}>Questa settimana</Link>
        <Link href={filtro('mie', mie === '1' ? '' : '1')} aria-current={mie === '1' ? 'true' : undefined}>Solo le mie</Link>
        {sale.map((s) => (
          <Link key={s.id} href={filtro('sala', sala === s.id ? '' : s.id)}
                aria-current={sala === s.id ? 'true' : undefined}>{s.nome}</Link>
        ))}
        {insegnanti.map((i) => (
          <Link key={i.id} href={filtro('insegnante', insegnante === i.id ? '' : i.id)}
                aria-current={insegnante === i.id ? 'true' : undefined}>{i.nome}</Link>
        ))}
      </div>
    </>
  );
}
