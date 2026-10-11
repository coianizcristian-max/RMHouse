'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { euro, dataBreve } from '@/lib/formato';

// Chi deve ancora pagare (query 152): le voci da incassare (incassi "non pagato" e rate scadute),
// si sceglie come paga e si incassa con la ricevuta. Usato nello Sportello e nella home ("Da saldare").
const METODI_SALDO = [['contanti', 'Contanti'], ['pos', 'POS / carta'], ['satispay', 'Satispay'], ['bonifico', 'Bonifico'], ['assegno', 'Assegno']];
export default function DaSaldare({ d, palestraId, email, onFatto, compatto = false }) {
  const [metodo, setMetodo] = useState('contanti');
  const [ricevuta, setRicevuta] = useState(true);
  const [scelte, setScelte] = useState(() => d.voci.map((x) => x.id));
  const [invio, setInvio] = useState(false);
  const [msg, setMsg] = useState('');
  const totale = d.voci.filter((x) => scelte.includes(x.id)).reduce((t, x) => t + x.importo_cent, 0);
  async function incassa() {
    if (!scelte.length) return;
    setInvio(true); setMsg('');
    const { data, error } = await supabaseBrowser().rpc('salda_voci', {
      p_palestra: palestraId, p_voci: d.voci.filter((x) => scelte.includes(x.id)).map((x) => ({ tipo: x.tipo, id: x.id })),
      p_metodo: metodo, p_ricevuta: ricevuta, p_email: null,
    });
    setInvio(false);
    if (error) { setMsg(error.message?.includes('numerazione') ? 'Manca la numerazione delle ricevute.' : 'Non riuscito: riprova.'); return; }
    setMsg(`Incassato ${euro(totale)}${data?.ricevute?.length ? ` · ${data.ricevute.length === 1 ? 'ricevuta fatta' : `${data.ricevute.length} ricevute fatte`}` : ''}.`);
    onFatto?.({ ...data, tutte: scelte.length === d.voci.length });
  }
  return (
    <div className={`sp-saldo${compatto ? ' compatto' : ''}`} role="group" aria-label="Da saldare">
      <div className="sp-saldo-testa"><b>Da saldare: {euro(d.totale_cent)}</b>
        <span className="piccolo">da {d.giorni === 0 ? 'oggi' : d.giorni === 1 ? 'ieri' : `${d.giorni} giorni`}</span></div>
      <ul className="sp-saldo-voci">
        {d.voci.map((x) => (
          <li key={x.id}>
            <label className="spunta"><input type="checkbox" checked={scelte.includes(x.id)}
                   onChange={() => setScelte((c) => (c.includes(x.id) ? c.filter((y) => y !== x.id) : [...c, x.id]))} />
              <span>{x.descrizione}{x.tipo === 'rata' ? ` · scaduta il ${dataBreve(x.dal)}` : ''}</span></label>
            <strong>{euro(x.importo_cent)}</strong>
          </li>
        ))}
      </ul>
      <div className="sp-saldo-azioni">
        <select value={metodo} onChange={(e) => setMetodo(e.target.value)} aria-label="Come paga">
          {METODI_SALDO.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </select>
        <label className="spunta"><input type="checkbox" checked={ricevuta} onChange={(e) => setRicevuta(e.target.checked)} /><span>ricevuta</span></label>
        <button type="button" className="btn btn-piccolo btn-primario" disabled={invio || !scelte.length} onClick={incassa}>
          {invio ? '…' : `Incassa ${euro(totale)}`}</button>
      </div>
      {msg && <p className="piccolo" role="status" style={{ margin: '6px 0 0' }}>{msg}</p>}
    </div>
  );
}
