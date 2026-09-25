import { oggiISO } from '@/lib/formato';
import { giornata } from '../dati';
import BarraGiorno from '../BarraGiorno';
import Giornata from '../Giornata';

export const dynamic = 'force-dynamic';

// Calendario dello staff: una colonna per insegnante, con le ore della giornata
export default async function PaginaGiornataStaff({ searchParams }) {
  const { giorno } = await searchParams;
  const d = await giornata({ giorno });
  const lezioni = d.lezioni.filter((l) => l.stato === 'programmata');

  const persone = new Map();
  for (const l of lezioni) {
    const k = l.insegnante_id || 'nessuno';
    const minuti = (new Date(l.fine) - new Date(l.inizio)) / 60000;
    const x = persone.get(k) || { id: k, nome: l.insegnante_nome || 'Senza insegnante', minuti: 0, n: 0 };
    x.minuti += minuti; x.n += 1;
    persone.set(k, x);
  }
  const colonne = [...persone.values()]
    .sort((a, b) => (a.id === 'nessuno') - (b.id === 'nessuno') || a.nome.localeCompare(b.nome))
    .map((x) => ({
      id: x.id, nome: x.nome,
      sotto: `${x.n} lezioni · ${Math.floor(x.minuti / 60)}h${x.minuti % 60 ? String(x.minuti % 60).padStart(2, '0') : ''}`,
    }));
  const blocchi = lezioni.map((l) => ({
    id: l.lezione_id, colonna: l.insegnante_id || 'nessuno', inizio: l.inizio, fine: l.fine, colore: l.colore,
    titolo: l.corso_nome, sotto: [l.sala_nome || 'senza sala', `${l.iscritti}${l.capienza ? `/${l.capienza}` : ''}`].join(' · '),
    href: `/gestione/appello/${l.lezione_id}`,
  }));

  return (
    <>
      <BarraGiorno base="/gestione/giornata/staff" data={d.data} vista="staff" />
      <Giornata colonne={colonne} blocchi={blocchi} oggi={d.data === oggiISO()} />
    </>
  );
}
