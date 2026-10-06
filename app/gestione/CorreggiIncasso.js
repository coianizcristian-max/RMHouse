'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';

const METODI = [['contanti', 'Contanti'], ['pos', 'POS / carta al banco'], ['bonifico', 'Bonifico'], ['satispay', 'Satispay'], ['assegno', 'Assegno'], ['altro', 'Altro']];
const ERRORI = {
  pagamento_online: 'È un pagamento con la carta online: data e metodo li ha decisi Stripe, non si cambiano.',
  non_pagato: 'Si correggono solo gli incassi già registrati come pagati.',
  data_futura: 'La data non può essere nel futuro.',
  metodo_non_valido: 'Scegli un metodo valido.',
  non_autorizzato: 'Servono i permessi di segreteria.',
};

// "Correggi": data, metodo e descrizione di un incasso già registrato (sbagli al banco: data di ieri, POS invece di contanti…)
export default function CorreggiIncasso({ pagamento, onChiudi, compatto = false }) {
  const router = useRouter();
  const [f, setF] = useState({
    data: (pagamento.pagato_at || pagamento.created_at || '').slice(0, 10),
    metodo: pagamento.metodo, descrizione: pagamento.descrizione || '',
  });
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState('');
  const online = pagamento.metodo === 'stripe' || pagamento.metodo === 'online' || pagamento.stripe_payment_intent;

  async function salva(e) {
    e.preventDefault();
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().rpc('correggi_pagamento', {
      p_pagamento: pagamento.id,
      p_metodo: f.metodo !== pagamento.metodo ? f.metodo : null,
      p_pagato_at: f.data && f.data !== (pagamento.pagato_at || '').slice(0, 10) ? f.data : null,
      p_descrizione: f.descrizione.trim() !== (pagamento.descrizione || '') ? f.descrizione.trim() : null,
    });
    setInvio(false);
    if (error) { setErrore(ERRORI[Object.keys(ERRORI).find((k) => error.message?.includes(k))] || 'Correzione non riuscita. Riprova.'); return; }
    onChiudi?.(); router.refresh();
  }

  if (online) return <p className="piccolo muto">Pagamento con la carta online: data e metodo li ha registrati Stripe, non si cambiano. Se è sbagliato, si rimborsa.</p>;

  return (
    <form onSubmit={salva} className="azione-iscrizione" style={{ marginTop: 8 }}>
      <strong className="ai-titolo">Correggi l&apos;incasso</strong>
      {errore && <div className="errore" role="alert">{errore}</div>}
      <div className="ai-griglia">
        <div className="campo"><label htmlFor={`cd-${pagamento.id}`}>Data</label>
          <input id={`cd-${pagamento.id}`} type="date" value={f.data} max={new Date().toLocaleDateString('sv-SE')} onChange={(e) => setF({ ...f, data: e.target.value })} /></div>
        <div className="campo"><label htmlFor={`cm-${pagamento.id}`}>Metodo</label>
          <select id={`cm-${pagamento.id}`} value={f.metodo} onChange={(e) => setF({ ...f, metodo: e.target.value })}>
            {METODI.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select></div>
        {!compatto && (
          <div className="campo"><label htmlFor={`cs-${pagamento.id}`}>Descrizione</label>
            <input id={`cs-${pagamento.id}`} value={f.descrizione} onChange={(e) => setF({ ...f, descrizione: e.target.value })} /></div>
        )}
      </div>
      <p className="piccolo muto" style={{ margin: '4px 0 8px' }}>L&apos;importo non si corregge: se è sbagliato, annulla l&apos;incasso e registralo di nuovo. Se la ricevuta è già emessa, resta com&apos;era: se serve annullala e riemettila.</p>
      <div className="azioni">
        <button className="btn btn-primario btn-piccolo" disabled={invio}>{invio ? 'Salvo…' : 'Salva'}</button>
        <button type="button" className="btn btn-piccolo" onClick={onChiudi}>Chiudi</button>
      </div>
    </form>
  );
}
