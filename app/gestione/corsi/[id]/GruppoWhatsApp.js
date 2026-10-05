'use client';
import { useState } from 'react';

// "Per il gruppo WhatsApp": chi ha detto sì (con il numero da copiare), chi ha detto no, a chi non è stato chiesto.
// Il gruppo si crea in WhatsApp: qui si prendono i numeri giusti, senza sbagliare chi non vuole.
export default function GruppoWhatsApp({ iscritti }) {
  const [copiato, setCopiato] = useState('');
  // una riga per persona, anche se ha due abbonamenti sul corso
  const visti = new Set();
  iscritti = iscritti.filter((i) => !visti.has(i.allievo_id) && visti.add(i.allievo_id));
  const si = iscritti.filter((i) => i.consenso_whatsapp === true);
  const no = iscritti.filter((i) => i.consenso_whatsapp === false);
  const nd = iscritti.filter((i) => i.consenso_whatsapp == null);
  const numeri = [...new Set(si.map((i) => (i.telefono || '').trim()).filter(Boolean))];

  async function copia() {
    try {
      await navigator.clipboard.writeText(numeri.join('\n'));
      setCopiato(`Copiati ${numeri.length} numeri: incollali in WhatsApp → Nuovo gruppo.`);
    } catch {
      setCopiato('Non riesco a copiare: seleziona i numeri qui sotto e copiali a mano.');
    }
  }

  return (
    <div className="gruppo-wa">
      <p className="piccolo muto" style={{ marginTop: 0 }}>
        Il consenso al gruppo del corso si raccoglie con il modulo «Privacy, comunicazioni e immagini» (dall&apos;app o
        con «Fai firmare» dalla scheda). Il gruppo si crea in WhatsApp: da qui prendi i numeri di chi ha detto sì.
      </p>
      <div className="azioni-riga" style={{ marginBottom: 10 }}>
        <button className="btn btn-primario btn-piccolo" disabled={!numeri.length} onClick={copia}>Copia i {numeri.length} numeri di chi ha detto sì</button>
        {copiato && <span className="piccolo">{copiato}</span>}
      </div>
      {[['Hanno detto sì', si, 'tag-ok'], ['Hanno detto no', no, 'tag-neutro'], ['Non ancora chiesto', nd, 'tag-tenue']].map(([titolo, lista, tono]) => (
        <div key={titolo} style={{ marginBottom: 12 }}>
          <div className="etichetta" style={{ marginBottom: 4 }}>{titolo} <span className={`tag ${tono}`}>{lista.length}</span></div>
          {lista.length === 0 ? <div className="piccolo muto">nessuno</div> : (
            <ul className="elenco-iscritti">
              {lista.map((i) => (
                <li key={i.iscrizione_id}>
                  <div className="ei-testa">
                    <span>{i.cognome} {i.nome}{i.titolare_nome !== i.nome ? <span className="piccolo muto"> · {i.titolare_nome} {i.titolare_cognome || ''}</span> : null}</span>
                    <span className="ei-segni">
                      {i.telefono ? <a className="piccolo" href={`tel:${i.telefono}`}>{i.telefono}</a> : <span className="piccolo muto">senza telefono</span>}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
