'use client';
import { useState } from 'react';

// "Legenda": spiega i simboli delle schede del palinsesto (come il pulsante Legenda della vecchia app)
export default function Legenda() {
  const [aperta, setAperta] = useState(false);
  return (
    <span className="pal-legenda">
      <button type="button" className="btn btn-piccolo pal-btn-legenda" aria-expanded={aperta} onClick={() => setAperta(!aperta)}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h10M4 17h16" /></svg>
        Legenda
      </button>
      {aperta && (
        <>
          <div className="pal-velo" onClick={() => setAperta(false)} />
          <div className="pal-legenda-box" role="dialog" aria-label="Legenda">
            <div><span className="pal-cerchio verde">8</span> prenotati alla lezione (iscritti fissi, recuperi e ingressi)</div>
            <div><span className="pal-cerchio blu">4</span> posti ancora liberi (∞ se la lezione non ha un limite)</div>
            <div><span className="pal-cerchio rosso">1</span> persone in prova</div>
            <div><span className="pal-piu" aria-hidden="true">+</span> aggiungi qualcuno alla lezione (recupero o ingresso)</div>
            <div><span className="pal-faccia" style={{ marginLeft: 0 }}>MR</span> chi è prenotato (bordo rosso = in prova); <span className="pal-altri">…</span> ce ne sono altri: passa sopra per i nomi</div>
            <div><span className="pal-barra" style={{ width: 56, display: 'inline-block', margin: 0 }}><span style={{ width: '60%' }} /></span> quanto è piena la lezione</div>
            <div><span className="pal-check" style={{ position: 'static', transform: 'none', display: 'inline-block' }} aria-hidden="true" /> seleziona più lezioni insieme: insegnante, sala, posti, nota, annulla</div>
            <div><span className="pal-etichetta" style={{ margin: 0 }}>Corso non prenotabile</span> dall&apos;app i clienti non si prenotano</div>
            <div><span className="pal-etichetta" style={{ margin: 0 }}>Corso non visibile</span> il corso non è pubblico nell&apos;app</div>
            <div><span className="pal-angolo" style={{ position: 'static', display: 'inline-block' }} aria-hidden="true" /> la lezione ha una nota (passa sopra per leggerla)</div>
            <p className="piccolo muto" style={{ margin: '6px 0 0' }}>Tocca una scheda per appello e azioni rapide; il menu ⋮ del giorno mostra chi arriva in prova, i recuperi, gli affitti e le note.</p>
          </div>
        </>
      )}
    </span>
  );
}
