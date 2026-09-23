'use client';
import { useState } from 'react';
import Gestore from '../Gestore';
import Ricolora from './Ricolora';
import { dataBreve } from '@/lib/formato';

const SEZIONI = [
  ['categorie', 'Categorie'], ['discipline', 'Discipline'], ['livelli', 'Livelli'],
  ['fasce', "Fasce d'età"], ['sale', 'Sale'], ['insegnanti', 'Insegnanti'], ['chiusure', 'Chiusure'],
];

export default function Palinsesto({ palestraId, dati }) {
  const [sezione, setSezione] = useState('categorie');
  const fissi = { palestra_id: palestraId };
  const opz = (righe) => righe.map((r) => ({ v: r.id, l: r.nome }));

  return (
    <>
      <h1>Palinsesto</h1>
      <p className="muto">
        Da qui si imposta la struttura della scuola. I corsi con i loro orari si gestiscono nella sezione Corsi.
      </p>

      <div className="filtri">
        {SEZIONI.map(([k, l]) => (
          <a key={k} href="#" onClick={(e) => { e.preventDefault(); setSezione(k); }}
             aria-current={sezione === k ? 'true' : undefined}>{l}</a>
        ))}
      </div>

      {sezione === 'categorie' && (
        <>
          <h2>Categorie</h2>
          <p className="muto piccolo">Il primo bivio che vede il cliente: danza, acrobatica, benessere.</p>
          <Gestore
            tabella="categorie" fissi={fissi} righe={dati.categorie} etichettaNuovo="Aggiungi categoria"
            campi={[
              { k: 'nome', etichetta: 'Nome', tipo: 'testo', obbligatorio: true },
              { k: 'colore', etichetta: 'Colore di base', tipo: 'colore' },
              { k: 'descrizione', etichetta: 'Descrizione', tipo: 'testo' },
              { k: 'ordine', etichetta: 'Ordine', tipo: 'numero' },
              { k: 'attiva', etichetta: 'Attiva', tipo: 'check' },
            ]}
            riassunto={(r) => ({
              titolo: r.nome, dettaglio: r.descrizione, tag: r.attiva ? null : 'nascosta', colore: r.colore,
            })}
          />
        </>
      )}

      {sezione === 'discipline' && (
        <>
          <h2>Discipline</h2>
          <p className="muto piccolo">Stanno dentro una categoria: pole dance, danza aerea, contemporanea…</p>
          <Ricolora palestraId={fissi.palestra_id} />
          <Gestore
            tabella="discipline" fissi={fissi} righe={dati.discipline} etichettaNuovo="Aggiungi disciplina"
            campi={[
              { k: 'nome', etichetta: 'Nome', tipo: 'testo', obbligatorio: true },
              { k: 'categoria_id', etichetta: 'Categoria', tipo: 'select', opzioni: opz(dati.categorie), obbligatorio: true },
              { k: 'colore', etichetta: 'Colore di base', tipo: 'colore',
                aiuto: 'I corsi di questa disciplina prendono gradazioni di questo colore.' },
              { k: 'descrizione', etichetta: 'Descrizione', tipo: 'testo' },
              { k: 'ordine', etichetta: 'Ordine', tipo: 'numero' },
              { k: 'attiva', etichetta: 'Attiva', tipo: 'check' },
            ]}
            riassunto={(r) => ({
              titolo: r.nome,
              colore: r.colore,
              dettaglio: dati.categorie.find((c) => c.id === r.categoria_id)?.nome || 'Senza categoria',
              tag: r.attiva ? null : 'nascosta',
            })}
          />
        </>
      )}

      {sezione === 'livelli' && (
        <>
          <h2>Livelli</h2>
          <Gestore
            tabella="livelli" fissi={fissi} righe={dati.livelli} etichettaNuovo="Aggiungi livello"
            campi={[
              { k: 'nome', etichetta: 'Nome', tipo: 'testo', obbligatorio: true },
              { k: 'descrizione', etichetta: 'Come si presenta al cliente', tipo: 'testo', aiuto: 'Es. "Mai fatto o quasi: si parte da zero"' },
              { k: 'ordine', etichetta: 'Ordine', tipo: 'numero' },
            ]}
            riassunto={(r) => ({ titolo: r.nome, dettaglio: r.descrizione })}
          />
        </>
      )}

      {sezione === 'fasce' && (
        <>
          <h2>Fasce d'età</h2>
          <p className="muto piccolo">Il primo filtro del percorso di prova. Lascia vuota l'età massima per "e oltre".</p>
          <Gestore
            tabella="fasce_eta" fissi={fissi} righe={dati.fasce} etichettaNuovo="Aggiungi fascia"
            campi={[
              { k: 'nome', etichetta: 'Nome', tipo: 'testo', obbligatorio: true },
              { k: 'eta_min', etichetta: 'Età minima', tipo: 'numero', obbligatorio: true },
              { k: 'eta_max', etichetta: 'Età massima', tipo: 'numero' },
              { k: 'adulti', etichetta: 'È la fascia degli adulti', tipo: 'check' },
              { k: 'ordine', etichetta: 'Ordine', tipo: 'numero' },
            ]}
            riassunto={(r) => ({ titolo: r.nome, dettaglio: `${r.eta_min}-${r.eta_max ?? '∞'} anni`, tag: r.adulti ? 'adulti' : null })}
          />
        </>
      )}

      {sezione === 'sale' && (
        <>
          <h2>Sale</h2>
          <p className="muto piccolo">La capienza della sala vale come limite per i corsi che non ne hanno uno proprio.</p>
          <Gestore
            tabella="sale" fissi={fissi} righe={dati.sale} etichettaNuovo="Aggiungi sala"
            campi={[
              { k: 'nome', etichetta: 'Nome', tipo: 'testo', obbligatorio: true },
              { k: 'capienza', etichetta: 'Capienza', tipo: 'numero' },
            ]}
            riassunto={(r) => ({ titolo: r.nome, dettaglio: r.capienza ? `${r.capienza} posti` : 'Capienza non impostata' })}
          />
        </>
      )}

      {sezione === 'insegnanti' && (
        <>
          <h2>Insegnanti e staff</h2>
          <p className="muto piccolo">
            Per far accedere una persona all'app serve anche creare il suo utente in Supabase (Authentication → Users)
            e collegarlo a questa scheda.
          </p>
          <Gestore
            tabella="staff" fissi={fissi} righe={dati.insegnanti} etichettaNuovo="Aggiungi persona"
            campi={[
              { k: 'nome', etichetta: 'Nome', tipo: 'testo', obbligatorio: true },
              { k: 'cognome', etichetta: 'Cognome', tipo: 'testo' },
              { k: 'specialita', etichetta: 'Specialità', tipo: 'testo', aiuto: 'Es. "Aerea e acrobatica", "Segreteria"' },
              { k: 'ruolo', etichetta: 'Ruolo', tipo: 'select', obbligatorio: true,
                opzioni: [{ v: 'insegnante', l: 'Insegnante' }, { v: 'segreteria', l: 'Segreteria' }, { v: 'admin', l: 'Amministratore' }] },
              { k: 'email', etichetta: 'Email', tipo: 'testo' },
              { k: 'telefono', etichetta: 'Telefono', tipo: 'testo' },
              { k: 'bio', etichetta: 'Presentazione', tipo: 'testolungo' },
              { k: 'collaboratore', etichetta: 'Collaboratore esterno', tipo: 'check' },
              { k: 'attivo', etichetta: 'Attivo', tipo: 'check' },
            ]}
            riassunto={(r) => ({
              titolo: `${r.nome} ${r.cognome || ''}`.trim(),
              dettaglio: [r.specialita, r.ruolo, r.email].filter(Boolean).join(' · '),
              tag: r.user_id ? (r.collaboratore ? 'collaboratore' : null) : 'senza accesso',
            })}
          />
        </>
      )}

      {sezione === 'chiusure' && (
        <>
          <h2>Chiusure e festività</h2>
          <p className="muto piccolo">
            Le lezioni comprese nel periodo vengono annullate subito. Gli abbonamenti non si allungano:
            i prezzi sono già calcolati al netto delle festività.
          </p>
          <Gestore
            tabella="chiusure" fissi={fissi} righe={dati.chiusure} etichettaNuovo="Aggiungi chiusura"
            campi={[
              { k: 'dal', etichetta: 'Dal', tipo: 'data', obbligatorio: true },
              { k: 'al', etichetta: 'Al', tipo: 'data', obbligatorio: true },
              { k: 'motivo', etichetta: 'Motivo', tipo: 'testo', aiuto: 'Es. "Vacanze di Natale"' },
            ]}
            riassunto={(r) => ({ titolo: r.motivo || 'Chiusura', dettaglio: `${dataBreve(r.dal)} → ${dataBreve(r.al)}` })}
          />
        </>
      )}
    </>
  );
}
