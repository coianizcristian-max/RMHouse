'use client';
import { useState } from 'react';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase/browser';
import SchermataAccesso from '../../SchermataAccesso';

// Accesso senza password: arriva un link per email
export default function Accedi({ errore: erroreIniziale }) {
  const [email, setEmail] = useState('');
  const [inviato, setInviato] = useState(false);
  const [errore, setErrore] = useState(erroreIniziale ? 'Il link non è più valido: chiedine uno nuovo.' : '');
  const [invio, setInvio] = useState(false);

  async function manda(e) {
    e.preventDefault();
    const pulita = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(pulita)) { setErrore('Controlla l\'indirizzo email.'); return; }
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email: pulita,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/area` },
    });
    setInvio(false);
    if (error) { setErrore('Invio non riuscito. Riprova tra poco.'); return; }
    setInviato(true);
  }

  const altra = { href: '/login', titolo: 'Sei della segreteria o insegni qui?', testo: 'Entra nell\'area staff con email e password' };

  if (inviato) {
    return (
      <SchermataAccesso tipo="iscritti" titolo="Controlla la posta" altra={altra}>
        <p className="accesso-testo">
          Ti abbiamo mandato un link a <strong>{email.trim().toLowerCase()}</strong>: aprilo da questo telefono ed entri
          direttamente, senza password.
        </p>
        <p className="piccolo muto">Non lo trovi? Guarda nello spam, oppure <button className="link-btn" onClick={() => setInviato(false)}>riprova</button>.</p>
      </SchermataAccesso>
    );
  }

  return (
    <SchermataAccesso tipo="iscritti" titolo="Ciao!" altra={altra}
                      testo="Allievi e genitori: scrivi l'email che hai lasciato in segreteria e ti mandiamo un link per entrare. Niente password.">
      {errore && <div className="errore" role="alert">{errore}</div>}
      <form onSubmit={manda}>
        <div className="campo">
          <label htmlFor="em">Email</label>
          <input id="em" type="email" autoComplete="email" inputMode="email" value={email}
                 onChange={(e) => setEmail(e.target.value)} placeholder="nome@esempio.it" />
        </div>
        <button className="btn btn-primario btn-pieno btn-grande" disabled={invio}>
          {invio ? 'Invio…' : 'Mandami il link'}
        </button>
      </form>
      <p className="piccolo muto" style={{ marginTop: 14, marginBottom: 0 }}>
        Se l'indirizzo non risulta, in segreteria ne è registrato un altro: scrivici e lo sistemiamo.
      </p>
    </SchermataAccesso>
  );
}
