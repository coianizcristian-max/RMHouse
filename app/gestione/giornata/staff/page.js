import { oggiISO } from '@/lib/formato';
import { giornata } from '../dati';
import BarraGiorno from '../BarraGiorno';
import Giornata from '../Giornata';
import { bloccoWorkshop } from '../blocchi';

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
  // i workshop tenuti da una persona dello staff vanno nella sua colonna (gli esterni in "Workshop esterni")
  for (const w of d.workshop) {
    const k = w.insegnante_id || 'ws-esterni';
    const minuti = (new Date(w.fine) - new Date(w.inizio)) / 60000;
    const x = persone.get(k) || { id: k, nome: w.insegnante_id ? (w.insegnante || 'Insegnante') : 'Workshop esterni', minuti: 0, n: 0 };
    x.minuti += minuti; x.n += 1;
    persone.set(k, x);
  }
  const colonne = [...persone.values()]
    .sort((a, b) => (a.id === 'nessuno' || a.id === 'ws-esterni') - (b.id === 'nessuno' || b.id === 'ws-esterni') || a.nome.localeCompare(b.nome))
    .map((x) => ({
      id: x.id, nome: x.nome,
      sotto: `${x.n} lezioni · ${Math.floor(x.minuti / 60)}h${x.minuti % 60 ? String(x.minuti % 60).padStart(2, '0') : ''}`,
    }));
  const blocchi = lezioni.map((l) => ({
    id: l.lezione_id, colonna: l.insegnante_id || 'nessuno', inizio: l.inizio, fine: l.fine, colore: l.colore,
    titolo: l.corso_nome, sotto: [l.sala_nome || 'senza sala', `${l.iscritti}${l.capienza ? `/${l.capienza}` : ''}`].join(' · '),
    href: `/gestione/appello/${l.lezione_id}`,
  })).concat(d.workshop.map((w) => bloccoWorkshop(w, w.insegnante_id || 'ws-esterni', [w.sala || w.luogo || 'senza sala', `${w.iscritti}${w.posti ? `/${w.posti}` : ''}`])));

  return (
    <>
      <BarraGiorno base="/gestione/giornata/staff" data={d.data} vista="staff" />
      <Giornata colonne={colonne} blocchi={blocchi} oggi={d.data === oggiISO()} />
    </>
  );
}
