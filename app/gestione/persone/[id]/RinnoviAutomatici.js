'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { euro } from '@/lib/formato';

const STATI = { attivo: 'attivo', in_ritardo: 'addebito non riuscito', da_disdire: 'da chiudere su Stripe' };

// I rinnovi automatici con carta (Stripe) del cliente: la segreteria li vede e può fermarli.
export default function RinnoviAutomatici({ rinnovi }) {
  const router = useRouter();
  const [invio, setInvio] = useState('');
  const [errore, setErrore] = useState('');
  if (!rinnovi.length) return null;

  async function ferma(r) {
    if (!confirm(`Fermare il rinnovo automatico di ${r.tipi_abbonamento?.nome || 'questo abbonamento'}? Non ci saranno altri addebiti; il mese già pagato resta valido.`)) return;
    setInvio(r.id); setErrore('');
    const res = await fetch('/api/stripe/disdici', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [r.id] }) });
    const j = await res.json().catch(() => ({}));
    setInvio('');
    if (!res.ok) { setErrore(j.errore || 'Non riuscito. Riprova.'); return; }
    router.refresh();
  }

  return (
    <div className="rinnovi-auto">
      {rinnovi.map((r) => (
        <div key={r.id} className="rinnovo-auto">
          <span>
            <span className="tag tag-ok">Rinnovo automatico</span>{' '}
            <strong>{r.tipi_abbonamento?.nome}</strong> · {r.corsi?.nome} · {euro(r.importo_cent)} al rinnovo
            <span className={`piccolo ${r.stato === 'attivo' ? 'muto' : 'testo-rosso'}`}> · {STATI[r.stato] || r.stato}</span>
          </span>
          <button type="button" className="link-btn piccolo" disabled={!!invio} onClick={() => ferma(r)}>{invio === r.id ? 'Un attimo…' : 'ferma il rinnovo'}</button>
        </div>
      ))}
      {errore && <div className="errore" role="alert">{errore}</div>}
    </div>
  );
}
