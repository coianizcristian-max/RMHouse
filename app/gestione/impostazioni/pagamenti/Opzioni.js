'use client';
import { useState } from 'react';
import { useSalva } from '../Salva';

const VOCI = [
  ['prove_online', 'Prove a pagamento pagate online', 'Chi prenota una prova a pagamento dal sito paga subito con carta. Se non paga entro un\'ora il posto si libera.'],
  ['abbonamenti_online', 'Abbonamenti acquistabili dall\'area clienti', 'Solo quelli segnati "acquistabile online" in Abbonamenti. Il cliente sceglie corso e giorni; l\'iscrizione nasce da sola.'],
  ['rate_online', 'Rate pagabili online', 'Nell\'area clienti compare "Paga online" accanto alle rate.'],
  ['rinnovo_automatico', 'Rinnovo automatico mensile', 'Per gli abbonamenti mensili segnati così: la carta viene addebitata ogni mese e l\'iscrizione si rinnova da sola.'],
  ['ricevuta_automatica', 'Ricevuta emessa da sola', 'Dopo ogni pagamento online la ricevuta si emette in automatico.'],
];

export default function Opzioni({ palestra }) {
  const { salva, stato } = useSalva(palestra.id);
  const [s, setS] = useState(palestra.stripe || {});
  const acceso = (k) => (k === 'rinnovo_automatico' ? s[k] === true : s[k] !== false);

  async function cambia(k) {
    const nuovo = { ...s, [k]: !acceso(k) };
    setS(nuovo);
    await salva({ stripe: nuovo });
  }

  return (
    <section className="pannello">
      <h2>Cosa si paga online</h2>
      <div className="interruttori">
        {VOCI.map(([k, nome, descr]) => (
          <label key={k} className="interruttore">
            <span className="int-testo"><strong>{nome}</strong><span className="piccolo muto">{descr}</span></span>
            <input type="checkbox" role="switch" checked={acceso(k)} onChange={() => cambia(k)} />
          </label>
        ))}
      </div>
      <p className="piccolo muto" style={{ marginTop: 10 }}>
        In Italia non si può far pagare al cliente la commissione della carta: resta a carico della scuola e la vedi qui e nel riepilogo per il commercialista.
        {stato === 'fatto' && ' Salvato.'}
      </p>
    </section>
  );
}
