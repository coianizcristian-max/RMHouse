'use client';
import { useState } from 'react';

// Crea un link di pagamento Stripe (valido 23 ore) da mandare al cliente
export default function LinkPagamento({ pagamentoId, rataId, telefono, nome }) {
  const [url, setUrl] = useState('');
  const [invio, setInvio] = useState(false);
  const [copiato, setCopiato] = useState(false);

  async function crea() {
    setInvio(true);
    const r = await fetch('/api/stripe/link', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rataId ? { rata_id: rataId } : { pagamento_id: pagamentoId }) });
    const d = await r.json().catch(() => ({}));
    setInvio(false);
    if (!d.url) { alert(d.errore || 'Link non creato.'); return; }
    setUrl(d.url);
    try { await navigator.clipboard.writeText(d.url); setCopiato(true); } catch { /* lo copia a mano */ }
  }

  if (!url) return <button className="link-btn piccolo" disabled={invio} onClick={crea}>{invio ? 'creo…' : 'link di pagamento'}</button>;
  const testo = `Ciao${nome ? ` ${nome}` : ''}! Ecco il link per pagare online con carta: ${url}`;
  return (
    <span className="piccolo">
      {copiato ? 'copiato ✓' : <a href={url} target="_blank" rel="noreferrer">apri il link</a>}
      {telefono && <> · <a href={`https://wa.me/39${telefono.replace(/\D/g, '').replace(/^39/, '')}?text=${encodeURIComponent(testo)}`} target="_blank" rel="noreferrer">WhatsApp</a></>}
    </span>
  );
}
