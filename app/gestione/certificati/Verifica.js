'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { dataBreve } from '@/lib/formato';

export default function Verifica({ certificato }) {
  const router = useRouter();
  const [scadenza, setScadenza] = useState(certificato.scadenza || '');
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);

  async function salva(nuovoStato) {
    if (nuovoStato === 'valido' && !scadenza) { setErrore('Inserisci la data di scadenza che leggi sul certificato.'); return; }
    setInvio(true); setErrore('');
    const { data: { user } } = await supabaseBrowser().auth.getUser();
    const { error } = await supabaseBrowser().from('certificati').update({
      scadenza: scadenza || null, stato: nuovoStato,
      verificato_da: user?.id, verificato_at: new Date().toISOString(),
    }).eq('id', certificato.id);
    setInvio(false);
    if (error) { setErrore('Salvataggio non riuscito. Riprova.'); return; }
    router.refresh();
  }

  if (certificato.stato !== 'da_verificare') {
    return (
      <p className="piccolo">
        <span className={`tag ${certificato.stato === 'valido' ? 'tag-ok' : 'tag-neutro'}`}>
          {certificato.stato === 'valido' ? `Valido fino al ${dataBreve(certificato.scadenza)}` : 'Rifiutato'}
        </span>
      </p>
    );
  }

  return (
    <div>
      {errore && <div className="errore" role="alert">{errore}</div>}
      <div className="riga-2">
        <div className="campo">
          <label htmlFor={`s-${certificato.id}`}>Scade il</label>
          {certificato.scadenza && <span className="piccolo muto">indicata da chi l'ha caricato: controlla sul documento</span>}
          <input id={`s-${certificato.id}`} type="date" value={scadenza} onChange={(e) => setScadenza(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'end', marginBottom: 16 }}>
          <button className="btn btn-primario" disabled={invio} onClick={() => salva('valido')}>Approva</button>
          <button className="btn" disabled={invio} onClick={() => salva('rifiutato')}>Rifiuta</button>
        </div>
      </div>
    </div>
  );
}
