import { settimana } from '../calendario/dati';
import Barra from '../calendario/Barra';
import Settimana from '../calendario/Settimana';

export const dynamic = 'force-dynamic';

// Agenda settimanale: la griglia oraria, per chi ragiona a fasce
export default async function PaginaAgenda({ searchParams }) {
  const { da, sala, insegnante, mie } = await searchParams;
  const d = await settimana({ da, sala, insegnante, mie });

  return (
    <>
      <Barra base="/gestione/agenda" inizio={d.inizio} fine={d.fine}
             sale={d.sale} insegnanti={d.insegnanti} sala={sala} insegnante={insegnante} mie={mie} />
      <Settimana inizio={d.inizio} lezioni={d.lezioni} corsi={d.corsi}
                 palestraId={d.staff.palestra_id} gestione={d.staff.ruolo !== 'insegnante'} />
    </>
  );
}
