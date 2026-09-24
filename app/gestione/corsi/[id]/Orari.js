'use client';
import Gestore from '../../Gestore';

const GIORNI = [[1, 'Lunedì'], [2, 'Martedì'], [3, 'Mercoledì'], [4, 'Giovedì'], [5, 'Venerdì'], [6, 'Sabato'], [7, 'Domenica']];

export default function Orari({ palestraId, corsoId, orari, sale, insegnanti, abilitati = [] }) {
  // prima chi è abilitato sul corso, poi tutti gli altri
  const scelta = [...insegnanti].sort((a, b) =>
    (abilitati.includes(b.id) - abilitati.includes(a.id)) || a.nome.localeCompare(b.nome));
  return (
    <Gestore
      tabella="orari"
      fissi={{ palestra_id: palestraId, corso_id: corsoId }}
      righe={orari}
      etichettaNuovo="Aggiungi orario"
      vuoto="Nessun orario: finché non ne aggiungi uno, non esistono lezioni da prenotare."
      campi={[
        { k: 'giorno_settimana', etichetta: 'Giorno', tipo: 'select', obbligatorio: true,
          opzioni: GIORNI.map(([v, l]) => ({ v, l })) },
        { k: 'ora_inizio', etichetta: 'Ora di inizio', tipo: 'ora', obbligatorio: true },
        { k: 'durata_min', etichetta: 'Durata (minuti)', tipo: 'numero', obbligatorio: true },
        { k: 'sala_id', etichetta: 'Sala', tipo: 'select', opzioni: sale.map((s) => ({ v: s.id, l: s.nome })) },
        { k: 'insegnante_id', etichetta: 'Insegnante', tipo: 'select', opzioni: scelta.map((i) => ({ v: i.id, l: `${i.nome} ${i.cognome || ''}`.trim() + (abilitati.length && !abilitati.includes(i.id) ? ' · non sul corso' : '') })) },
        { k: 'valido_dal', etichetta: 'Valido dal', tipo: 'data' },
        { k: 'valido_al', etichetta: 'Valido fino al', tipo: 'data', aiuto: 'Vuoto = senza scadenza' },
        { k: 'prenotabile', etichetta: 'Prenotabile online', tipo: 'check',
          aiuto: 'Tolto: le lezioni di questo orario non si prenotano dal sito né dall\'area cliente' },
        { k: 'attivo', etichetta: 'Attivo', tipo: 'check' },
      ]}
      riassunto={(o) => ({
        titolo: `${GIORNI.find(([v]) => v === o.giorno_settimana)?.[1] || ''} ${String(o.ora_inizio).slice(0, 5)}`,
        dettaglio: [
          `${o.durata_min} minuti`,
          sale.find((s) => s.id === o.sala_id)?.nome,
          insegnanti.find((i) => i.id === o.insegnante_id)?.nome,
        ].filter(Boolean).join(' · '),
        tag: !o.attivo ? 'sospeso' : o.prenotabile === false ? 'non prenotabile' : null,
      })}
    />
  );
}
