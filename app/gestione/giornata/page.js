import { oggiISO } from '@/lib/formato';
import { giornata } from './dati';
import BarraGiorno from './BarraGiorno';
import Giornata from './Giornata';

export const dynamic = 'force-dynamic';

// Vista stanze: una colonna per sala, lezioni e affitti del giorno
export default async function PaginaGiornataSale({ searchParams }) {
  const { giorno, sede } = await searchParams;
  const d = await giornata({ giorno, sede });
  const sale = d.sale.filter((s) => !d.sedeScelta || s.sede_id === d.sedeScelta);
  const lezioni = d.lezioni.filter((l) => !d.sedeScelta || l.sede_id === d.sedeScelta || !l.sede_id);
  const colonne = [
    ...sale.map((s) => ({
      id: s.id, nome: s.nome,
      sotto: `${lezioni.filter((l) => l.sala_id === s.id && l.stato === 'programmata').length} lezioni`,
    })),
    ...(lezioni.some((l) => !l.sala_id) ? [{ id: 'nessuna', nome: 'Senza sala' }] : []),
  ];
  const blocchi = [
    ...lezioni.map((l) => ({
      id: l.lezione_id, colonna: l.sala_id || 'nessuna', inizio: l.inizio, fine: l.fine, colore: l.colore,
      titolo: l.corso_nome, annullata: l.stato === 'annullata',
      sotto: [`${l.iscritti}${l.capienza ? `/${l.capienza}` : ''}${l.prove ? ` +${l.prove} prova` : ''}`, l.insegnante_nome || 'senza insegnante']
        .join(' · '),
      href: `/gestione/appello/${l.lezione_id}`,
    })),
    ...d.affitti.filter((a) => sale.some((s) => s.id === a.sala_id)).map((a) => ({
      id: a.id, colonna: a.sala_id, inizio: a.inizio, fine: a.fine, tipo: 'affitto',
      titolo: a.titolo || 'Affitto sala', sotto: a.contatto_nome, href: '/gestione/spazi',
    })),
  ];

  return (
    <>
      <BarraGiorno base="/gestione/giornata" data={d.data} sede={d.sedeScelta} sedi={d.sedi} vista="sale" />
      <Giornata colonne={colonne} blocchi={blocchi} oggi={d.data === oggiISO()} />
    </>
  );
}
