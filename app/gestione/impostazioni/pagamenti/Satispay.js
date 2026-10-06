'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { dataBreve } from '@/lib/formato';

// Collegamento con Satispay Business: basta il codice di attivazione (6 caratteri) dalla Dashboard Satispay.
// Le chiavi si creano sul server e restano lì: qui non si vedono mai.
export default function Satispay({ stato, admin }) {
  const router = useRouter();
  const [codice, setCodice] = useState('');
  const [ambiente, setAmbiente] = useState('reale');
  const [msg, setMsg] = useState('');
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const collegato = !!stato?.collegato;

  async function collega(e) {
    e.preventDefault(); setErrore(''); setMsg(''); setInvio(true);
    const r = await fetch('/api/satispay/collega', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codice, ambiente }) });
    const d = await r.json().catch(() => ({}));
    setInvio(false);
    if (!r.ok) { setErrore(d.errore || 'Collegamento non riuscito.'); return; }
    setCodice(''); setMsg(d.ambiente === 'prova' ? `Collegato in prova${d.firma === false ? ' (attenzione: la prova della firma non è passata)' : ''}.` : 'Collegato: Satispay è attivo.');
    router.refresh();
  }
  async function scollega() {
    if (!window.confirm('Scollegare Satispay? I pagamenti Satispay torneranno da segnare a mano.')) return;
    await fetch('/api/satispay/collega', { method: 'DELETE' });
    router.refresh();
  }

  return (
    <section className="pannello">
      <h2>Satispay</h2>
      <div className={`ingresso-esito ${collegato ? 'ok' : 'attenzione'}`} style={{ marginBottom: 12 }}>
        <div className="ie-segno" aria-hidden="true">{collegato ? '✓' : '!'}</div>
        <div>
          <div className="ie-titolo">{collegato ? `Collegato${stato.ambiente === 'prova' ? ' in modalità di prova' : ''}` : 'Non collegato'}</div>
          <div className="piccolo">
            {collegato
              ? `Dal ${dataBreve(String(stato.collegato_at).slice(0, 10))}. Nell'app compare "Paga con Satispay"; allo Sportello, scegliendo Satispay, la richiesta arriva sul telefono del cliente e il pagamento si conferma da solo.`
              : 'Senza collegamento Satispay si segna a mano come metodo di pagamento (come oggi).'}
          </div>
        </div>
      </div>
      {admin && !collegato && (
        <form onSubmit={collega} className="satispay-form">
          <ol className="piccolo">
            <li>Entra in <b>Satispay Business</b> dal computer (business.satispay.com) con l&apos;account della scuola.</li>
            <li>Vai in <b>Negozi online</b> (o Pagamenti online) → <b>Crea codice di attivazione</b>: è di 6 caratteri e vale una volta sola.</li>
            <li>Scrivilo qui sotto e premi Collega. Le chiavi si creano da sole sul server: non devi copiare nient&apos;altro.</li>
          </ol>
          <div className="satispay-riga">
            <input value={codice} onChange={(e) => setCodice(e.target.value.trim())} placeholder="Codice di attivazione" aria-label="Codice di attivazione" maxLength={12} autoComplete="off" />
            <select value={ambiente} onChange={(e) => setAmbiente(e.target.value)} aria-label="Ambiente">
              <option value="reale">Incassi veri</option>
              <option value="prova">Prova (sandbox Satispay)</option>
            </select>
            <button className="btn btn-primario" disabled={invio || codice.length < 4}>{invio ? 'Collego…' : 'Collega'}</button>
          </div>
        </form>
      )}
      {admin && collegato && <button type="button" className="link-btn piccolo" onClick={scollega}>Scollega Satispay</button>}
      {!admin && !collegato && <p className="piccolo muto">Lo collega l&apos;amministratore.</p>}
      {msg && <p className="piccolo" role="status">{msg}</p>}
      {errore && <div className="errore" role="alert">{errore}</div>}
    </section>
  );
}
