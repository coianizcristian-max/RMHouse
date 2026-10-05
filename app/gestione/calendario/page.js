import { settimana } from './dati';
import Barra from './Barra';
import Palinsesto from './Palinsesto';
import Legenda from './Legenda';

export const dynamic = 'force-dynamic';

// Palinsesto: una colonna per giorno, con le schede delle lezioni
export default async function PaginaPalinsesto({ searchParams }) {
  const { da, sala, insegnante, mie, sede, corso } = await searchParams;
  const d = await settimana({ da, sala, insegnante, mie, sede, corso });

  return (
    <>
      <Barra base="/gestione/calendario" inizio={d.inizio} fine={d.fine}
             sale={d.sale} insegnanti={d.insegnanti} sedi={d.sedi} corsi={d.corsi}
             sala={sala} insegnante={insegnante} mie={mie} sede={sede} corso={corso} fondo>
        <Legenda />
      </Barra>
      <Palinsesto inizio={d.inizio} lezioni={d.lezioni} corsi={d.corsi} note={d.note} facce={d.facce}
                  sale={d.sale} insegnanti={d.insegnanti}
                  palestraId={d.staff.palestra_id} gestione={d.staff.ruolo !== 'insegnante'} />
    </>
  );
}
