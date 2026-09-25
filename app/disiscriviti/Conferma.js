'use client';
import { useState } from 'react';

// Si conferma con un tocco: i programmi antivirus delle email aprono i link da soli
export default function Conferma({ token }) {
  const [stato, setStato] = useState('');
  async function conferma() {
    setStato('invio');
    const r = await fetch('/api/disiscriviti', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
    setStato(r.ok ? 'fatto' : 'errore');
  }
  if (stato === 'fatto') {
    return <><h1>Fatto</h1><p>Non riceverai più promozioni e novità. Continueranno ad arrivarti solo i messaggi necessari: conferme, promemoria delle lezioni, scadenze.</p></>;
  }
  return (
    <>
      <h1>Niente più promozioni?</h1>
      <p>Tocca il pulsante e non ti manderemo più email con offerte e novità. I messaggi necessari (conferme, promemoria, scadenze) continueranno ad arrivare.</p>
      {stato === 'errore' && <div className="errore" role="alert">Non ci siamo riusciti: scrivici e lo facciamo noi.</div>}
      <button className="btn btn-primario btn-pieno" disabled={stato === 'invio'} onClick={conferma}>
        {stato === 'invio' ? 'Un attimo…' : 'Non voglio più ricevere promozioni'}
      </button>
    </>
  );
}
