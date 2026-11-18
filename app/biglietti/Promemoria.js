import { qrSvg } from '@/lib/qr';
import { euro } from '@/lib/formato';
import { quandoSpettacolo, quandoScade, MODIFICHE_SEGRETERIA } from '@/lib/biglietteria';

// Il promemoria di pagamento (NON è una ricevuta): si vede dopo la conferma e nella pagina della prenotazione,
// si stampa o si salva in PDF. Contiene importo, causale, scadenza e il link per pagare (anche come QR).
export default function Promemoria({ p }) {
  const causale = `SAGGIO ${p.codice} ${String(p.cognome || '').toUpperCase()}`;
  const eventi = p.eventi || [];
  return (
    <article className="bg-promemoria" aria-label="Promemoria di pagamento">
      <header className="bg-prom-testa">
        <div>
          <span className="occhiello">{p.evento}</span>
          <h3>Promemoria di pagamento</h3>
        </div>
        <span className="bg-prom-avviso">NON è una ricevuta<br />né un biglietto</span>
      </header>
      <p className="bg-prom-chi">Prenotazione <strong className="bg-codice">{p.codice}</strong> a nome di <strong>{p.nome} {p.cognome}</strong></p>
      <table className="bg-prom-tabella">
        <tbody>
          {eventi.map((e, k) => (
            <tr key={k}>
              <td><strong>{e.spettacolo}</strong><br /><span className="piccolo">{quandoSpettacolo(e.inizio)} · {e.posti} {e.posti === 1 ? 'posto' : 'posti'}
                {e.extra_testo ? ` · ${e.extra_testo}` : e.pizze ? ` · ${e.pizze} pizz${e.pizze === 1 ? 'a' : 'e'}` : ''}{e.allievo ? ` · per ${e.allievo}` : ''}</span></td>
              <td className="bg-prom-euro">{e.totale_cent ? euro(e.totale_cent) : 'gratis'}</td>
            </tr>
          ))}
          <tr className="bg-prom-totale"><td>Totale da pagare</td><td className="bg-prom-euro">{euro(p.totale_cent)}</td></tr>
        </tbody>
      </table>
      <div className="bg-prom-pagare">
        <div>
          <p>Causale: <strong>{causale}</strong></p>
          {p.scade_at && <p>Paga entro <strong>{quandoScade(p.scade_at)}</strong>: dopo, la prenotazione scade e i posti tornano liberi.</p>}
          {p.link_pagamento && <p>Paga qui: <a href={p.link_pagamento} target="_blank" rel="noopener noreferrer" className="bg-prom-link">{p.link_pagamento}</a></p>}
          {p.istruzioni_pagamento && <p className="piccolo" style={{ whiteSpace: 'pre-line' }}>{p.istruzioni_pagamento}</p>}
          {p.paga_in_segreteria && (
            <p>Oppure passa in segreteria a saldare la prenotazione entro {p.scade_at ? <strong>{quandoScade(p.scade_at)}</strong> : `${p.giorni_per_pagare} giorni lavorativi`},
              oltre la prenotazione decade.</p>
          )}
        </div>
        {p.link_pagamento && <div className="bg-prom-qr" aria-hidden="true" dangerouslySetInnerHTML={{ __html: qrSvg(p.link_pagamento) }} />}
      </div>
      <p className="piccolo bg-prom-piede">I biglietti (un QR per persona) arrivano in una email nei prossimi giorni, quando il pagamento è stato verificato e confermato dalla segreteria.</p>
      <p className="piccolo bg-prom-piede">{MODIFICHE_SEGRETERIA}</p>
    </article>
  );
}
