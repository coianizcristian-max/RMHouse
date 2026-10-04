'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { euro } from '@/lib/formato';

// "Rimborsa sulla carta": i soldi tornano al cliente tramite Stripe, senza uscire dal gestionale.
export default function RimborsoCarta({ pagamento, conDocumento = true }) {
  const router = useRouter();
  const residuo = pagamento.importo_cent - (pagamento.rimborsato_cent || 0);
  const [aperto, setAperto] = useState(false);
  const [importo, setImporto] = useState((residuo / 100).toFixed(2).replace('.', ','));
  const [motivo, setMotivo] = useState('');
  const [nota, setNota] = useState(conDocumento);
  const [invio, setInvio] = useState(false);
  const [esito, setEsito] = useState('');
  const [errore, setErrore] = useState('');

  if (residuo <= 0) return null;
  if (!aperto) return <button type="button" className="link-btn piccolo" onClick={() => setAperto(true)}>rimborsa sulla carta</button>;

  async function rimborsa() {
    const cent = Math.round(Number(importo.replace(',', '.')) * 100);
    if (!cent || cent <= 0 || cent > residuo) { setErrore(`Importo tra 0,01 e ${euro(residuo)}.`); return; }
    if (!motivo.trim()) { setErrore('Scrivi il motivo.'); return; }
    if (!confirm(`Restituire ${euro(cent)} sulla carta del cliente?\nL'operazione su Stripe non si può annullare.`)) return;
    setInvio(true); setErrore('');
    const r = await fetch('/api/stripe/rimborso', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pagamento_id: pagamento.id, importo_cent: cent, motivo: motivo.trim(), nota_credito: nota }) });
    const d = await r.json().catch(() => ({}));
    setInvio(false);
    if (!r.ok) { setErrore(d.errore || 'Rimborso non riuscito.'); return; }
    setEsito(d.avviso || `Rimborso di ${euro(cent)} fatto${d.nota ? ' e nota di credito emessa' : ''}. Il cliente vede i soldi sulla carta in 5-10 giorni.`);
    router.refresh();
  }

  if (esito) return <span className="piccolo" style={{ color: 'var(--ok)' }}>{esito}</span>;
  return (
    <div className="rimborso">
      <strong>Rimborso sulla carta</strong>
      <label><span>Importo (€)</span>
        <input inputMode="decimal" value={importo} onChange={(e) => setImporto(e.target.value)} aria-label="Importo da rimborsare" />
        <span className="piccolo muto">massimo {euro(residuo)}</span></label>
      <label><span>Motivo</span>
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Es. corso non partito" maxLength={300} /></label>
      {conDocumento && (
        <label className="spunta" style={{ margin: 0 }}>
          <input type="checkbox" checked={nota} onChange={(e) => setNota(e.target.checked)} />
          <span className="piccolo">Emetti subito la nota di credito sulla ricevuta</span>
        </label>
      )}
      {errore && <span className="piccolo" style={{ color: 'var(--rosso-scuro)' }}>{errore}</span>}
      <span className="rimborso-azioni">
        <button type="button" className="btn btn-piccolo btn-primario" disabled={invio} onClick={rimborsa}>{invio ? 'Un attimo…' : 'Rimborsa'}</button>
        <button type="button" className="link-btn piccolo" onClick={() => setAperto(false)}>annulla</button>
      </span>
    </div>
  );
}
