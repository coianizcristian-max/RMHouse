'use client';
import { useState } from 'react';
import Gestore from '../../Gestore';
import { euro } from '@/lib/formato';

const GIORNI = ['', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];

export default function Listino({ palestraId, tariffe, pacchetti, sale }) {
  const [sezione, setSezione] = useState('tariffe');
  const fissi = { palestra_id: palestraId };
  const nomeSala = (id) => sale.find((s) => s.id === id)?.nome;

  return (
    <>
      <h1>Listino e pacchetti</h1>
      <div className="filtri">
        {[['tariffe', 'Tariffe orarie'], ['pacchetti', 'Feste ed eventi']].map(([k, l]) => (
          <a key={k} href="#" onClick={(e) => { e.preventDefault(); setSezione(k); }}
             aria-current={sezione === k ? 'true' : undefined}>{l}</a>
        ))}
      </div>

      {sezione === 'tariffe' && (
        <>
          <p className="muto piccolo">
            Il prezzo si calcola da solo in base al giorno e all'ora di inizio. Se più tariffe combaciano,
            vince quella più specifica (prima la sala, poi i giorni).
            Per i giorni scrivi i numeri separati da virgola tra graffe: <code>{'{1,2,3,4,5}'}</code> per i feriali,
            <code>{'{6,7}'}</code> per il weekend. Lascia vuoto per "tutti i giorni".
          </p>
          <Gestore
            tabella="tariffe_spazi" fissi={fissi} righe={tariffe} etichettaNuovo="Aggiungi tariffa"
            vuoto="Nessuna tariffa: senza listino il sito non può fare preventivi."
            campi={[
              { k: 'nome', etichetta: 'Nome', tipo: 'testo', obbligatorio: true, aiuto: 'Es. "Feriale serale"' },
              { k: 'sala_id', etichetta: 'Sala', tipo: 'select', opzioni: sale.map((s) => ({ v: s.id, l: s.nome })), vuotoTesto: 'Tutte le sale' },
              { k: 'giorni', etichetta: 'Giorni', tipo: 'testo', aiuto: 'Es. {1,2,3,4,5}. Vuoto = tutti i giorni.' },
              { k: 'ora_da', etichetta: 'Dalle', tipo: 'ora', obbligatorio: true },
              { k: 'ora_a', etichetta: 'Alle', tipo: 'ora', obbligatorio: true },
              { k: 'prezzo_ora_cent', etichetta: 'Prezzo orario (€)', tipo: 'euro', obbligatorio: true },
              { k: 'minimo_ore', etichetta: 'Minimo ore', tipo: 'numero' },
              { k: 'attiva', etichetta: 'Attiva', tipo: 'check' },
            ]}
            riassunto={(t) => ({
              titolo: `${t.nome} — ${euro(t.prezzo_ora_cent)}/ora`,
              dettaglio: [
                nomeSala(t.sala_id) || 'tutte le sale',
                `${String(t.ora_da).slice(0, 5)}–${String(t.ora_a).slice(0, 5)}`,
                t.giorni ? t.giorni.map((g) => GIORNI[g]).join(', ') : 'tutti i giorni',
                t.minimo_ore > 1 ? `minimo ${t.minimo_ore} ore` : null,
              ].filter(Boolean).join(' · '),
              tag: t.attiva ? null : 'non attiva',
            })}
          />
        </>
      )}

      {sezione === 'pacchetti' && (
        <>
          <p className="muto piccolo">
            I pacchetti compaiono sul sito nella pagina degli spazi: il cliente sceglie data e ora,
            vede il prezzo con gli invitati extra e manda la richiesta.
          </p>
          <Gestore
            tabella="pacchetti_evento" fissi={fissi} righe={pacchetti} etichettaNuovo="Aggiungi pacchetto"
            campi={[
              { k: 'nome', etichetta: 'Nome', tipo: 'testo', obbligatorio: true },
              { k: 'descrizione', etichetta: 'Descrizione breve', tipo: 'testo' },
              { k: 'incluso', etichetta: 'Cosa comprende', tipo: 'testolungo' },
              { k: 'durata_min', etichetta: 'Durata (minuti)', tipo: 'numero', obbligatorio: true },
              { k: 'prezzo_cent', etichetta: 'Prezzo (€)', tipo: 'euro', obbligatorio: true },
              { k: 'ospiti_inclusi', etichetta: 'Invitati compresi', tipo: 'numero' },
              { k: 'prezzo_ospite_cent', etichetta: 'Prezzo invitato extra (€)', tipo: 'euro' },
              { k: 'sala_id', etichetta: 'Sala', tipo: 'select', opzioni: sale.map((s) => ({ v: s.id, l: s.nome })) },
              { k: 'acconto_pct', etichetta: 'Acconto (%)', tipo: 'numero' },
              { k: 'prenotabile_online', etichetta: 'Visibile sul sito', tipo: 'check' },
              { k: 'attivo', etichetta: 'Attivo', tipo: 'check' },
            ]}
            riassunto={(p) => ({
              titolo: `${p.nome} — ${euro(p.prezzo_cent)}`,
              dettaglio: [
                `${Math.round(p.durata_min / 60)} ore`,
                p.ospiti_inclusi ? `${p.ospiti_inclusi} invitati compresi` : null,
                p.prezzo_ospite_cent ? `extra ${euro(p.prezzo_ospite_cent)}` : null,
                nomeSala(p.sala_id),
              ].filter(Boolean).join(' · '),
              tag: p.attivo ? (p.prenotabile_online ? null : 'non sul sito') : 'non attivo',
            })}
          />
        </>
      )}
    </>
  );
}
