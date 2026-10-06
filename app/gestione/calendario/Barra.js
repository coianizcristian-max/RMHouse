import Link from 'next/link';
import { oggiISO, spostaGiorni } from '@/lib/formato';
import Filtri from './Filtri';

const breve = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });

// Navigazione della settimana e filtri, uguali per palinsesto e agenda.
// Con `fondo` la navigazione della settimana diventa la barra flottante in basso ("‹ Oggi › 15 mar – 21 mar 2027"),
// come nella vecchia app; in alto restano solo i filtri (e quello che la pagina aggiunge, es. la Legenda).
export default function Barra({ base, inizio, fine, sale, insegnanti, sedi = [], corsi = [], sala, insegnante, mie, sede, corso, giorni, fondo = false, children }) {
  const settimanaCorrente = inizio <= oggiISO() && oggiISO() <= fine;
  const passo = giorni || 7;   // ‹ › vanno avanti e indietro di quanti giorni si vedono
  const qs = (da) => {
    const p = new URLSearchParams({ da });
    Object.entries({ sala, insegnante, mie, sede, corso, giorni }).forEach(([k, v]) => v && p.set(k, v));
    return `${base}?${p.toString()}`;
  };
  const anno = fine.slice(0, 4);
  const periodo = inizio === fine
    ? new Date(inizio + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })
    : `${breve(inizio)} – ${breve(fine)}`;
  const nomePasso = passo === 1 ? 'Giorno' : passo === 7 ? 'Settimana' : `${passo} giorni`;
  const navigazione = fondo ? (
    <div className="barra-fondo" role="navigation" aria-label="Settimana">
      <Link prefetch={false} className="bf-btn" href={qs(spostaGiorni(inizio, -passo))} aria-label={`${nomePasso} precedente`}>‹</Link>
      <Link prefetch={false} className="bf-oggi" href={qs(oggiISO())} aria-current={settimanaCorrente ? 'date' : undefined}>Oggi</Link>
      <Link prefetch={false} className="bf-btn" href={qs(spostaGiorni(inizio, passo))} aria-label={`${nomePasso} successiv${passo === 1 || passo === 7 ? 'a' : 'i'}`}>›</Link>
      <span className="bf-sep" />
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
      <strong>{periodo} <span className="bf-anno">{anno}</span></strong>
    </div>
  ) : (
    <div className="bc-settimana">
      <Link prefetch={false} className="btn btn-piccolo" href={qs(spostaGiorni(inizio, -7))} aria-label="Settimana precedente">‹</Link>
      <strong>{breve(inizio)} – {breve(fine)}</strong>
      <Link prefetch={false} className="btn btn-piccolo" href={qs(spostaGiorni(inizio, 7))} aria-label="Settimana successiva">›</Link>
      {!settimanaCorrente && <Link prefetch={false} className="btn btn-piccolo" href={qs(oggiISO())}>Oggi</Link>}
    </div>
  );
  return (
    <div className="barra-cal">
      {navigazione}
      <Filtri base={base} inizio={inizio} giorni={giorni} sale={sale} insegnanti={insegnanti} sedi={sedi} corsi={corsi}
              scelti={{ sala: sala || '', insegnante: insegnante || '', mie: mie || '', sede: sede || '', corso: corso || '' }}
              extra={children} />
    </div>
  );
}
