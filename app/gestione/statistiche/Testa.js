import Link from 'next/link';
import SceltaPeriodo from '../SceltaPeriodo';
import { qsPeriodo } from '@/lib/periodo';

export const SCHEDE = [
  ['', 'Panoramica', 'I numeri principali e l\'andamento della stagione.'],
  ['iscrizioni', 'Iscrizioni e rinnovi', 'Nuovi, rinnovi, chi esce, abbonamenti più scelti, confronto con la stagione scorsa.'],
  ['frequenza', 'Frequenza', 'Presenze, giorni e orari più pieni, appelli, disdette e recuperi.'],
  ['corsi', 'Corsi e insegnanti', 'Quanto sono pieni i corsi, quanto rendono, insegnanti e sale.'],
  ['persone', 'Chi frequenta', 'Età, genere, discipline, da quanto tempo, da dove arrivano.'],
  ['prove', 'Prove e contatti', 'Dalla richiesta all\'iscrizione, e perché chi prova non si iscrive.'],
  ['economia', 'Economia', 'Ricavi, costi, margine, cassa e come si paga.'],
];

// Testa comune delle statistiche: titolo, sottopagine, periodo
export default function Testa({ scheda = '', per }) {
  const [, titolo, testo] = SCHEDE.find(([k]) => k === scheda);
  const qs = qsPeriodo(per);
  return (
    <>
      <div className="st-testa">
        <div>
          <div className="occhiello">Statistiche</div>
          <h1>{titolo}</h1>
          <p>{testo}</p>
        </div>
      </div>
      <nav className="st-schede" aria-label="Sezioni delle statistiche">
        {SCHEDE.map(([k, t]) => (
          <Link prefetch={false} key={k || 'pan'} href={`/gestione/statistiche${k ? `/${k}` : ''}?${qs}`} aria-current={k === scheda ? 'page' : undefined}>{t}</Link>
        ))}
      </nav>
      <SceltaPeriodo base={`/gestione/statistiche${scheda ? `/${scheda}` : ''}`} per={per} conOggi={false} />
    </>
  );
}

// riquadro con titolo e link "vedi tutto"
export function Blocco({ titolo, nota, link, per, children }) {
  return (
    <section className="scheda st-blocco">
      <div className="st-titolo">
        <strong>{titolo}</strong>
        {link ? <Link prefetch={false} href={`/gestione/statistiche/${link}?${qsPeriodo(per)}`}>vedi tutto →</Link> : nota ? <span>{nota}</span> : null}
      </div>
      {children}
    </section>
  );
}
