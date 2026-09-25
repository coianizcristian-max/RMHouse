'use client';
import { useState } from 'react';

export default function PagaRata({ id }) {
  const [invio, setInvio] = useState(false);
  async function paga() {
    setInvio(true);
    const r = await fetch('/api/stripe/rata', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rata_id: id }) });
    const d = await r.json().catch(() => ({}));
    if (d.url) { window.location.href = d.url; return; }
    setInvio(false);
    alert(d.errore || 'Pagamento non disponibile, riprova.');
  }
  return <button className="btn btn-piccolo btn-primario" disabled={invio} onClick={paga}>{invio ? '…' : 'Paga online'}</button>;
}
