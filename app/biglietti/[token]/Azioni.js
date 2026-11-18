'use client';
import { useState } from 'react';

// Stampa dei biglietti e pagamento con carta (se acceso)
export default function Azioni({ token, carta = false, stampa = false }) {
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  if (stampa) return <button type="button" className="btn btn-pieno" onClick={() => window.print()}>Stampa i biglietti</button>;
  if (!carta) return null;
  return (
    <>
      <button type="button" className="btn btn-pieno" disabled={invio} onClick={async () => {
        setInvio(true); setErrore('');
        const r = await fetch('/api/biglietteria/paga', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) }).catch(() => null);
        const d = r ? await r.json().catch(() => ({})) : {};
        if (d.url) { window.location.href = d.url; return; }
        setInvio(false); setErrore(d.errore || 'Il pagamento non si è aperto. Riprova.');
      }}>{invio ? 'Un attimo…' : 'Paga con carta'}</button>
      {errore && <div className="errore" role="alert">{errore}</div>}
    </>
  );
}
