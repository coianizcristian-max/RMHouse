'use client';
import Gestore from '../../Gestore';

const GIORNI = [[1, 'Lunedì'], [2, 'Martedì'], [3, 'Mercoledì'], [4, 'Giovedì'], [5, 'Venerdì'], [6, 'Sabato'], [7, 'Domenica']];

export default function Orari({ palestraId, corsoId, orari, sale, insegnanti }) {
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
        { k: 'insegnante_id', etichetta: 'Insegnante', tipo: 'select', opzioni: insegnanti.map((i) => ({ v: i.id, l: `${i.nome} ${i.cognome || ''}`.trim() })) },
        { k: 'valido_dal', etichetta: 'Valido dal', tipo: 'data' },
        { k: 'valido_al', etichetta: 'Valido fino al', tipo: 'data', aiuto: 'Vuoto = senza scadenza' },
        { k: 'attivo', etichetta: 'Attivo', tipo: 'check' },
      ]}
      riassunto={(o) => ({
        titolo: `${GIORNI.find(([v]) => v === o.giorno_settimana)?.[1] || ''} ${String(o.ora_inizio).slice(0, 5)}`,
        dettaglio: [
          `${o.durata_min} minuti`,
          sale.find((s) => s.id === o.sala_id)?.nome,
          insegnanti.find((i) => i.id === o.insegnante_id)?.nome,
        ].filter(Boolean).join(' · '),
        tag: o.attivo ? null : 'sospeso',
      })}
    />
  );
}
