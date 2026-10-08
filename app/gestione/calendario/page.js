import { cookies } from 'next/headers';
import { settimana, giorniValidi } from './dati';
import Barra from './Barra';
import Palinsesto from './Palinsesto';
import Legenda from './Legenda';
import SceltaGiorni from './SceltaGiorni';

export const dynamic = 'force-dynamic';

// Palinsesto: una colonna per giorno, con le schede delle lezioni
export default async function PaginaPalinsesto({ searchParams }) {
  const { da, sala, insegnante, mie, sede, corso, giorni } = await searchParams;
  // quanti giorni vedere: dal link, altrimenti l'ultima scelta fatta su questo dispositivo
  const vista = giorniValidi(giorni || (await cookies()).get('pal_giorni')?.value);
  const d = await settimana({ da, sala, insegnante, mie, sede, corso, giorni: vista });

  return (
    <>
      <Barra base="/gestione/calendario" inizio={d.inizio} fine={d.fine}
             sale={d.sale} insegnanti={d.insegnanti} giorniChiusi={d.giorniChiusi} sedi={d.sedi} corsi={d.corsi}
             sala={sala} insegnante={insegnante} mie={mie} sede={sede} corso={corso} giorni={d.giorni} fondo>
        <span className="bc-destra">
          <SceltaGiorni giorni={d.giorni} inizio={d.inizio} fine={d.fine} />
          <Legenda />
        </span>
      </Barra>
      <Palinsesto giorniVisti={d.giorni} inizio={d.inizio} lezioni={d.lezioni} corsi={d.corsi} note={d.note} facce={d.facce} coda={d.coda} workshop={d.workshop}
                  sale={d.sale} insegnanti={d.insegnanti} giorniChiusi={d.giorniChiusi}
                  palestraId={d.staff.palestra_id} gestione={d.staff.ruolo !== 'insegnante'} />
    </>
  );
}
