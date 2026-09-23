import Link from 'next/link';
import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import Esci from './Esci';

export const dynamic = 'force-dynamic';

const VOCI = [
  ['/gestione/calendario', 'Calendario settimanale', 'Tutta la settimana a colpo d\'occhio, con quanto è piena ogni lezione'],
  ['/gestione/statistiche', 'Statistiche', 'Iscritti, abbandono, riempimento, conversione, ricavi e margini'],
  ['/gestione/spazi', 'Affitto spazi ed eventi', 'Richieste da confermare, agenda delle sale, feste e listino'],
  ['/gestione/costi', 'Costi', 'Affitti, fornitori, compensi orari: servono per i margini'],
  ['/gestione/certificati', 'Certificati', 'I documenti caricati dai clienti, da approvare'],
  ['/gestione/attese', "Liste d'attesa", 'Chi aspetta un posto in un corso o in una lezione'],
  ['/gestione/palinsesto', 'Palinsesto', "Categorie, discipline, livelli, fasce d'età, sale, insegnanti e chiusure"],
  ['/gestione/abbonamenti', 'Abbonamenti e regole', 'Tipi di abbonamento, recuperi ammessi, quota annuale'],
  ['/gestione/messaggi', 'Messaggi automatici', 'I testi di conferme, promemoria, follow-up e scadenze'],
  ['/gestione/importa', 'Importa da CSV', 'Carica clienti e iscrizioni da un file esportato'],
];

export default async function Impostazioni() {
  const { staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');

  return (
    <>
      <h1>Impostazioni</h1>
      <ul className="elenco">
        {VOCI.map(([href, titolo, testo]) => (
          <li key={href}>
            <Link className="voce" href={href}>
              <span />
              <span>
                <strong style={{ color: 'var(--nero)' }}>{titolo}</strong>
                <span className="piccolo muto" style={{ display: 'block' }}>{testo}</span>
              </span>
              <span aria-hidden="true">›</span>
            </Link>
          </li>
        ))}
      </ul>
      <Esci />
    </>
  );
}
