'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import SchermataAccesso from '../../SchermataAccesso';

// Arrivo dal link "password dimenticata" ricevuto via email: si sceglie la nuova password
export default function NuovaPassword() {
  const [p, setP] = useState(''); const [c, setC] = useState('');
  const [errore, setErrore] = useState(''); const [invio, setInvio] = useState(false);
  async function salva(e) {
    e.preventDefault();
    if (p.length < 8) { setErrore('Almeno 8 caratteri.'); return; }
    if (p !== c) { setErrore('Le due password non sono uguali.'); return; }
    setInvio(true);
    const { error } = await supabaseBrowser().auth.updateUser({ password: p });
    setInvio(false);
    if (error) { setErrore('Il link è scaduto: chiedine uno nuovo o un codice alla segreteria.'); return; }
    window.location.href = '/area';
  }
  return (
    <SchermataAccesso tipo="iscritti" titolo="Nuova password">
      {errore && <div className="errore" role="alert">{errore}</div>}
      <form onSubmit={salva}>
        <div className="campo"><label htmlFor="p">Nuova password (almeno 8 caratteri)</label><input id="p" type="password" autoComplete="new-password" value={p} onChange={(e) => setP(e.target.value)} /></div>
        <div className="campo"><label htmlFor="c">Riscrivila</label><input id="c" type="password" autoComplete="new-password" value={c} onChange={(e) => setC(e.target.value)} /></div>
        <button className="btn btn-primario btn-pieno btn-grande" disabled={invio}>{invio ? 'Salvo…' : 'Salva ed entra'}</button>
      </form>
    </SchermataAccesso>
  );
}
