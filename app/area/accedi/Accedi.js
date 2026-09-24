'use client';
import { useState } from 'react';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase/browser';

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

  if (inviato) {
    return (
      <>
        <h1>Controlla la posta</h1>
        <p>Ti abbiamo mandato un link a <strong>{email.trim().toLowerCase()}</strong>: aprilo da questo telefono ed entri direttamente, senza password.</p>
        <p className="piccolo muto">Non lo trovi? Guarda nello spam, oppure <button className="link-btn" onClick={() => setInviato(false)}>riprova</button>.</p>
      </>
    );
  }

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Area iscritti</div>
        <h1>Entra con la tua email</h1>
        <p>
          Qui entrano gli allievi e i genitori: usa l'indirizzo che hai lasciato in segreteria e ti arriva un
          link, niente password da ricordare.
        </p>
      </div>

      {errore && <div className="errore" role="alert">{errore}</div>}

      <form onSubmit={manda}>
        <div className="campo">
          <label htmlFor="em">Email</label>
          <input id="em" type="email" autoComplete="email" value={email}
                 onChange={(e) => setEmail(e.target.value)} placeholder="nome@esempio.it" />
        </div>
        <button className="btn btn-primario btn-pieno" disabled={invio}>
          {invio ? 'Invio…' : 'Mandami il link'}
        </button>
      </form>

      <p className="piccolo muto" style={{ marginTop: 20 }}>
        Se l'indirizzo non risulta, vuol dire che in segreteria ne è registrato un altro: scrivici e lo sistemiamo.
      </p>

      <p className="piccolo muto" style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--linea)' }}>
        Sei della segreteria o insegni qui? <Link href="/login">Entra dall'accesso staff</Link>, con email e password.
      </p>
    </>
  );
}
