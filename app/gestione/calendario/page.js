import { settimana } from './dati';
import Barra from './Barra';
import Palinsesto from './Palinsesto';

export const dynamic = 'force-dynamic';

// Palinsesto: una colonna per giorno, con le schede delle lezioni
export default async function PaginaPalinsesto({ searchParams }) {
  const { da, sala, insegnante, mie } = await searchParams;
  const d = await settimana({ da, sala, insegnante, mie });

  return (
    <>
      <Barra base="/gestione/calendario" inizio={d.inizio} fine={d.fine}
             sale={d.sale} insegnanti={d.insegnanti} sala={sala} insegnante={insegnante} mie={mie} />
      <Palinsesto inizio={d.inizio} lezioni={d.lezioni} corsi={d.corsi} note={d.note} facce={d.facce}
                  palestraId={d.staff.palestra_id} gestione={d.staff.ruolo !== 'insegnante'} />
    </>
  );
}
