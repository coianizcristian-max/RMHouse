'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { dataBreve } from '@/lib/formato';

// Privacy della persona: consensi, copia dei dati, cancellazione su richiesta
export default function Privacy({ allievoId, nome, account, admin }) {
  const router = useRouter();
  const [invio, setInvio] = useState(false);
  const [esito, setEsito] = useState('');

  async function cancella() {
    if (!confirm(`Cancellare i dati di ${nome}? Nome, contatti, codice fiscale, foto, certificati e note spariscono per sempre. Ricevute e incassi restano, come vuole la legge.`)) return;
    if (prompt('Per confermare scrivi CANCELLA') !== 'CANCELLA') return;
    setInvio(true); setEsito('');
    const r = await fetch(`/api/privacy/${allievoId}`, { method: 'POST' });
    const d = await r.json().catch(() => ({}));
    setInvio(false);
    if (!r.ok) { setEsito(d.errore || 'Cancellazione non riuscita.'); return; }
    setEsito('Dati cancellati.');
    router.refresh();
  }

  return (
    <section className="pannello">
      <h2>Privacy</h2>
      <dl className="dati">
        <dt>Privacy</dt>
        <dd>{account?.consenso_privacy_at ? `accettata il ${dataBreve(account.consenso_privacy_at)}` : <span className="muto">non registrata</span>}</dd>
        <dt>Comunicazioni</dt>
        <dd>{account?.consenso_marketing ? 'sì, promozioni e novità' : 'solo messaggi di servizio'}</dd>
      </dl>
      <div className="azioni" style={{ marginTop: 10 }}>
        <a className="btn btn-piccolo" href={`/api/privacy/${allievoId}`}>Scarica i suoi dati</a>
        {admin && <button className="btn btn-piccolo" disabled={invio} onClick={cancella}>{invio ? 'Cancello…' : 'Cancella i dati'}</button>}
      </div>
      <p className="piccolo muto" style={{ marginTop: 8 }}>
        Per le richieste di accesso o di cancellazione. La cancellazione la fa solo l'amministrazione.
      </p>
      {esito && <p className="piccolo" role="status">{esito}</p>}
    </section>
  );
}
