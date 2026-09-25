'use client';
import Gestore from '../Gestore';

// Aliquote e numerazioni: le decide la scuola con il commercialista
export default function Regole({ palestraId, aliquote, numerazioni }) {
  return (
    <>
      <section className="pannello">
        <h2>Aliquote e regimi IVA</h2>
        <p className="piccolo muto" style={{ marginTop: -4 }}>
          Quella "predefinita" va sui documenti; un abbonamento o una voce a listino possono averne una diversa.
          La natura (N2.2, N4…) serve quando l'IVA è zero: fattela confermare dal commercialista.
        </p>
        <Gestore
          tabella="aliquote_iva" fissi={{ palestra_id: palestraId }} righe={aliquote} etichettaNuovo="Aggiungi aliquota"
          campi={[
            { k: 'nome', etichetta: 'Nome', tipo: 'testo', obbligatorio: true },
            { k: 'percentuale', etichetta: 'Percentuale IVA', tipo: 'numero', obbligatorio: true },
            { k: 'natura', etichetta: 'Natura (se IVA a zero)', tipo: 'testo', aiuto: 'Es. N4 esente, N2.2 non soggetta' },
            { k: 'riferimento', etichetta: 'Dicitura sul documento', tipo: 'testo' },
            { k: 'predefinita', etichetta: 'Predefinita', tipo: 'check' },
            { k: 'attiva', etichetta: 'Attiva', tipo: 'check' },
          ]}
          riassunto={(x) => ({
            titolo: x.nome,
            dettaglio: [`${Number(x.percentuale)}%`, x.natura, x.riferimento].filter(Boolean).join(' · '),
            tag: x.predefinita ? 'predefinita' : x.attiva ? null : 'non attiva',
          })}
        />
      </section>
      <section className="pannello">
        <h2>Numerazioni</h2>
        <p className="piccolo muto" style={{ marginTop: -4 }}>
          Ogni tipo di documento ha la sua numerazione: riparte da 1 ogni anno, senza buchi. Il codice si stampa
          accanto al numero.
        </p>
        <Gestore
          tabella="numerazioni" fissi={{ palestra_id: palestraId }} righe={numerazioni} etichettaNuovo="Aggiungi numerazione"
          campi={[
            { k: 'codice', etichetta: 'Codice', tipo: 'testo', obbligatorio: true, aiuto: 'Breve: RNF, NC…' },
            { k: 'nome', etichetta: 'Nome', tipo: 'testo', obbligatorio: true },
            { k: 'tipo_documento', etichetta: 'Documenti', tipo: 'select', obbligatorio: true,
              opzioni: [{ v: 'ricevuta', l: 'Ricevute' }, { v: 'nota_credito', l: 'Note di credito' }] },
            { k: 'predefinita', etichetta: 'Usata per i nuovi documenti di questo tipo', tipo: 'check' },
            { k: 'attiva', etichetta: 'Attiva', tipo: 'check' },
          ]}
          riassunto={(x) => ({
            titolo: `${x.codice} · ${x.nome}`,
            dettaglio: x.tipo_documento === 'nota_credito' ? 'Note di credito' : 'Ricevute',
            tag: x.predefinita ? 'in uso' : x.attiva ? null : 'non attiva',
          })}
        />
      </section>
    </>
  );
}
