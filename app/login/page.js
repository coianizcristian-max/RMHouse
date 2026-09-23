'use client';
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import Testata from '../Testata';

function Modulo() {
  const router = useRouter();
  const da = useSearchParams().get('da') || '/gestione';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      <h1>Accedi</h1>
      <p className="muto">Area riservata a segreteria e insegnanti.</p>
      {errore && <div className="errore" role="alert">{errore}</div>}
      <div className="campo"><label htmlFor="e">Email</label><input id="e" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <div className="campo"><label htmlFor="p">Password</label><input id="p" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
      <button className="btn btn-primario btn-pieno" disabled={invio}>{invio ? 'Accesso…' : 'Accedi'}</button>
    </form>
  );
}

export default function Login() {
  return (
    <>
      <Testata />
      <main className="pagina"><Suspense><Modulo /></Suspense></main>
    </>
  );
}
