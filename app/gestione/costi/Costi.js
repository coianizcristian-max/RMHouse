'use client';
import { useState } from 'react';
import Gestore from '../Gestore';
import { dataBreve, euro } from '@/lib/formato';

const CATEGORIE = ['affitto', 'utenze', 'compensi', 'marketing', 'materiali', 'assicurazioni', 'software', 'manutenzione', 'tasse', 'altro'];
const PERIODI = [
  { v: 'una_tantum', l: 'Una tantum' }, { v: 'mensile', l: 'Ogni mese' },
  { v: 'bimestrale', l: 'Ogni 2 mesi' }, { v: 'trimestrale', l: 'Ogni 3 mesi' }, { v: 'annuale', l: 'Ogni anno' },
];
const mensile = (s) => ({ mensile: 1, bimestrale: 1 / 2, trimestrale: 1 / 3, annuale: 1 / 12, una_tantum: 0 }[s.periodicita] * s.importo_cent);

export default function Costi({ palestraId, spese, fornitori, sale, corsi, insegnanti }) {
  const [sezione, setSezione] = useState('spese');
  const fissi = { palestra_id: palestraId };
  const totaleMese = Math.round(spese.reduce((t, s) => t + mensile(s), 0));

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Conti</div>
        <h1>Costi e fornitori</h1>
        <p>Affitti, compensi e spese ricorrenti: è quello che rende veri i margini.</p>
      </div>

      <div className="filtri">
        {[['spese', 'Spese'], ['fornitori', 'Fornitori'], ['compensi', 'Compensi'], ['sale', 'Costo sale']].map(([k, l]) => (
          <a key={k} href="#" onClick={(e) => { e.preventDefault(); setSezione(k); }}
             aria-current={sezione === k ? 'true' : undefined}>{l}</a>
        ))}
      </div>

      {sezione === 'spese' && (
        <>
          <div className="scheda" style={{ marginBottom: 16 }}>
            <div className="piccolo muto">Costi fissi al mese (esclusi i compensi orari)</div>
            <div style={{ fontSize: 24, fontWeight: 850 }}>{euro(totaleMese)}</div>
          </div>
          <Gestore
            tabella="spese" fissi={fissi} righe={spese} etichettaNuovo="Aggiungi spesa"
            vuoto="Nessuna spesa registrata: senza queste, il margine dei corsi non è attendibile."
            campi={[
              { k: 'descrizione', etichetta: 'Descrizione', tipo: 'testo', obbligatorio: true },
              { k: 'categoria', etichetta: 'Categoria', tipo: 'select', obbligatorio: true, opzioni: CATEGORIE.map((c) => ({ v: c, l: c })) },
              { k: 'importo_cent', etichetta: 'Importo (€)', tipo: 'euro', obbligatorio: true },
              { k: 'periodicita', etichetta: 'Ogni quanto', tipo: 'select', obbligatorio: true, opzioni: PERIODI },
              { k: 'data', etichetta: 'Data', tipo: 'data', obbligatorio: true },
              { k: 'fornitore_id', etichetta: 'Fornitore', tipo: 'select', opzioni: fornitori.map((f) => ({ v: f.id, l: f.nome })) },
              { k: 'sala_id', etichetta: 'Sala', tipo: 'select', opzioni: sale.map((s) => ({ v: s.id, l: s.nome })) },
              { k: 'corso_id', etichetta: 'Corso', tipo: 'select', opzioni: corsi.map((c) => ({ v: c.id, l: c.nome })),
                aiuto: 'Solo se la spesa riguarda un corso preciso: finisce nel suo margine.' },
              { k: 'pagata', etichetta: 'Pagata', tipo: 'check' },
              { k: 'note', etichetta: 'Note', tipo: 'testo' },
            ]}
            riassunto={(s) => ({
              titolo: `${s.descrizione} — ${euro(s.importo_cent)}`,
              dettaglio: [
                PERIODI.find((p) => p.v === s.periodicita)?.l,
                dataBreve(s.data),
                fornitori.find((f) => f.id === s.fornitore_id)?.nome,
                s.periodicita !== 'una_tantum' ? `${euro(Math.round(mensile(s)))} al mese` : null,
              ].filter(Boolean).join(' · '),
              tag: s.categoria,
            })}
          />
        </>
      )}

      {sezione === 'fornitori' && (
        <Gestore
          tabella="fornitori" fissi={fissi} righe={fornitori} etichettaNuovo="Aggiungi fornitore"
          campi={[
            { k: 'nome', etichetta: 'Nome', tipo: 'testo', obbligatorio: true },
            { k: 'categoria', etichetta: 'Categoria', tipo: 'select', obbligatorio: true, opzioni: CATEGORIE.map((c) => ({ v: c, l: c })) },
            { k: 'referente', etichetta: 'Referente', tipo: 'testo' },
            { k: 'email', etichetta: 'Email', tipo: 'testo' },
            { k: 'telefono', etichetta: 'Telefono', tipo: 'testo' },
            { k: 'note', etichetta: 'Note', tipo: 'testolungo' },
            { k: 'attivo', etichetta: 'Attivo', tipo: 'check' },
          ]}
          riassunto={(f) => ({
            titolo: f.nome,
            dettaglio: [f.categoria, f.referente, f.telefono].filter(Boolean).join(' · '),
            tag: f.attivo ? null : 'non attivo',
          })}
        />
      )}

      {sezione === 'compensi' && (
        <>
          <p className="piccolo muto">
            Il compenso orario moltiplicato per le ore di lezione dà il costo di ogni corso.
            Se un insegnante è socio o non retribuito, lascia vuoto.
          </p>
          <Gestore
            tabella="staff" fissi={fissi} righe={insegnanti} etichettaNuovo="Aggiungi insegnante"
            campi={[
              { k: 'nome', etichetta: 'Nome', tipo: 'testo', obbligatorio: true },
              { k: 'cognome', etichetta: 'Cognome', tipo: 'testo' },
              { k: 'compenso_ora_cent', etichetta: 'Compenso orario (€)', tipo: 'euro' },
            ]}
            riassunto={(i) => ({
              titolo: `${i.nome} ${i.cognome || ''}`.trim(),
              dettaglio: i.compenso_ora_cent ? `${euro(i.compenso_ora_cent)} all'ora` : 'compenso non impostato',
            })}
          />
        </>
      )}

      {sezione === 'sale' && (
        <>
          <p className="piccolo muto">
            Dividi l'affitto mensile per le ore in cui la sala è davvero usata: ottieni il costo orario,
            che serve a capire se una lezione semivuota si ripaga.
          </p>
          <Gestore
            tabella="sale" fissi={fissi} righe={sale} etichettaNuovo="Aggiungi sala"
            campi={[
              { k: 'nome', etichetta: 'Nome', tipo: 'testo', obbligatorio: true },
              { k: 'capienza', etichetta: 'Capienza', tipo: 'numero' },
              { k: 'costo_ora_cent', etichetta: 'Costo orario (€)', tipo: 'euro' },
            ]}
            riassunto={(s) => ({
              titolo: s.nome,
              dettaglio: [s.capienza ? `${s.capienza} posti` : null, s.costo_ora_cent ? `${euro(s.costo_ora_cent)} all'ora` : 'costo non impostato']
                .filter(Boolean).join(' · '),
            })}
          />
        </>
      )}
    </>
  );
}
