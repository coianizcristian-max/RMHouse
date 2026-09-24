'use client';
import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import Testata from '../Testata';

function Modulo() {
  const router = useRouter();
  const da = useSearchParams().get('da') || '/gestione';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mostra, setMostra] = useState(false);
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);

  async function entra(e) {
    e.preventDefault();
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
    setInvio(false);
    if (error) { setErrore('Email o password non corrette.'); return; }
    router.replace(da.startsWith('/') ? da : '/gestione');
    router.refresh();
  }

  return (
    <form onSubmit={entra}>
      <div className="intestazione">
        <div className="occhiello">Area staff</div>
        <h1>Accedi</h1>
        <p>Riservato a segreteria e insegnanti: entri con email e password.</p>
      </div>
      <p className="muto">Area riservata a segreteria e insegnanti.</p>
      {errore && <div className="errore" role="alert">{errore}</div>}
      <div className="campo"><label htmlFor="e">Email</label><input id="e" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <div className="campo">
        <label htmlFor="p">Password</label>
        <div className="campo-password">
          <input id="p" type={mostra ? 'text' : 'password'} required autoComplete="current-password"
                 value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="button" onClick={() => setMostra(!mostra)}
                  aria-label={mostra ? 'Nascondi la password' : 'Mostra la password'}
                  aria-pressed={mostra} title={mostra ? 'Nascondi' : 'Mostra'}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
                 strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" />
              <circle cx="12" cy="12" r="3" />
              {mostra && <path d="m4 20 16-16" />}
            </svg>
          </button>
        </div>
      </div>
      <button className="btn btn-primario btn-pieno" disabled={invio}>{invio ? 'Accesso…' : 'Accedi'}</button>
    </form>
  );
}

export default function Login() {
  return (
    <>
      <Testata />
      <main className="pagina"><Suspense><Modulo /></Suspense></main>
      <p className="piccolo muto" style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--linea)' }}>
        Sei un allievo o un genitore? <Link href="/area/accedi">Entra nell'area iscritti</Link>: lì basta l'email.
      </p>
    </>
  );
}
