import { euro } from '@/lib/formato';
import { giornoOra, testoScaglioni } from '@/lib/workshop';
import { TestoRicco } from '@/lib/testoRicco';

// La presentazione di un workshop (app e pagina pubblica): locandina, titolo, insegnante, quando e dove, descrizione,
// i momenti con i posti e le opzioni con i prezzi. Niente stato: va bene sia sul server sia nel browser.
export default function Dettaglio({ w, esterno = null, compatta = false }) {
  const momenti = w.momenti || [];
  return (
    <div className={`wp${compatta ? ' compatta' : ''}`}>
      {w.locandina_url && <img src={w.locandina_url} alt={`Locandina: ${w.titolo}`} className="wp-locandina" />}
      <div className="wp-testo">
        <div className="occhiello">Workshop{w.insegnante ? ` con ${w.insegnante}` : ''}</div>
        <h1>{w.titolo}</h1>
        {w.sottotitolo && <p className="wp-sotto">{w.sottotitolo}</p>}
        {w.stato === 'annullato' && <div className="errore" role="status">Questo workshop è stato annullato.</div>}
        <ul className="wp-quando">
          {momenti.map((m) => {
            const liberi = m.posti != null ? Math.max(m.posti - (m.occupati || 0), 0) : null;
            return (
              <li key={m.id}>
                <strong>{momenti.length > 1 ? `${m.titolo} · ` : ''}{giornoOra(m.inizio, m.fine)}</strong>
                <span className="piccolo muto">{[m.sala, w.luogo].filter(Boolean).join(' · ')}{liberi != null ? ` · ${liberi ? `${liberi} ${liberi === 1 ? 'posto libero' : 'posti liberi'}` : 'completo'}` : ''}</span>
              </li>
            );
          })}
        </ul>
        {w.descrizione && <TestoRicco testo={w.descrizione} className="wp-descr testo-ricco" />}
        {w.info_pratiche && <div className="wp-info"><strong>Cosa sapere</strong><TestoRicco testo={w.info_pratiche} /></div>}
        <div className="wp-prezzi">
          <h2>Prezzi</h2>
          <ul>
            {(w.opzioni || []).map((o) => (
              <li key={o.id}>
                <span><strong>{o.nome}</strong>{o.descrizione && <span className="piccolo muto"> · {o.descrizione}</span>}
                  {(w.opzioni.length > 1 || momenti.length > 1) && <span className="piccolo muto" style={{ display: 'block' }}>
                    {momenti.filter((m) => (o.momenti || []).includes(m.id)).map((m) => m.titolo).join(' + ')}</span>}
                </span>
                <span className="wp-prezzo">
                  {esterno === null ? (
                    <>
                      <span>Allievi della scuola: {testoScaglioni(o.prezzi)}</span>
                      {o.prezzo_esterni !== o.prezzo_allievi || (o.prezzi || []).some((s) => s.esterni != null && s.esterni !== s.allievi)
                        ? <span>Esterni: {testoScaglioni(o.prezzi, true)}</span> : null}
                    </>
                  ) : <span>{testoScaglioni(o.prezzi, esterno)}</span>}
                  {o.liberi === 0 && <span className="tag tag-neutro">completo</span>}
                </span>
              </li>
            ))}
          </ul>
          {w.quota_cent > 0 && (esterno === null || esterno) && (
            <p className="piccolo muto">Chi non ha ancora la quota associativa annuale della scuola la paga insieme all&apos;iscrizione ({euro(w.quota_cent)}): vale per tutto l&apos;anno.</p>
          )}
          {w.certificato_richiesto && <p className="piccolo muto">Per partecipare serve il certificato medico valido.</p>}
        </div>
      </div>
    </div>
  );
}
