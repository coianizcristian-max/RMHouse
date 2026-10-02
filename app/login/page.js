'use client';
import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import SchermataAccesso from '../SchermataAccesso';

function Modulo() {
  const router = useRouter();
  const sp = useSearchParams();
  const da = sp.get('da') || '/gestione';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mostra, setMostra] = useState(false);
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  // primo accesso o password dimenticata: codice dato dalla segreteria
  const [primo, setPrimo] = useState(sp.has('primo'));
  const [codice, setCodice] = useState('');
  const [conferma, setConferma] = useState('');
  const [fatto, setFatto] = useState('');
  async function attiva(e) {
    e.preventDefault();
    if (password.length < 8) { setErrore('La password deve avere almeno 8 caratteri.'); return; }
    if (password !== conferma) { setErrore('Le due password non sono uguali.'); return; }
    setInvio(true); setErrore('');
    const r = await fetch('/api/accesso/staff', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), codice: codice.trim(), password }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setInvio(false); setErrore(d.errore || 'Non riuscito. Riprova.'); return; }
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email: email.trim(), password });
    setInvio(false);
    if (error) { setPrimo(false); setFatto('Password salvata: ora entra con email e password.'); return; }
    router.replace('/gestione'); router.refresh();
  }

  async function entra(e) {
    e.preventDefault();
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
    setInvio(false);
    if (error) { setErrore('Email o password non corrette.'); return; }
    router.replace(da.startsWith('/') ? da : '/gestione');
    router.refresh();
  }

  if (primo) return (
    <form onSubmit={attiva}>
      <p className="accesso-testo" style={{ marginTop: -6 }}>Scrivi la tua email, il codice di 6 cifre che ti ha dato la segreteria e scegli la password.</p>
      {errore && <div className="errore" role="alert">{errore}</div>}
      <div className="campo"><label htmlFor="e">Email</label><input id="e" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <div className="campo"><label htmlFor="k">Codice della segreteria</label><input id="k" inputMode="numeric" required maxLength={6} autoComplete="one-time-code" value={codice} onChange={(e) => setCodice(e.target.value.replace(/\D/g, ''))} /></div>
      <div className="campo"><label htmlFor="p">Scegli la password (almeno 8 caratteri)</label><input id="p" type={mostra ? 'text' : 'password'} required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
      <div className="campo"><label htmlFor="c">Riscrivila</label><input id="c" type={mostra ? 'text' : 'password'} required autoComplete="new-password" value={conferma} onChange={(e) => setConferma(e.target.value)} /></div>
      <button className="btn btn-primario btn-pieno btn-grande" disabled={invio}>{invio ? 'Un attimo…' : 'Salva ed entra'}</button>
      <p style={{ textAlign: 'center', marginTop: 12 }}><button type="button" className="link-btn piccolo" onClick={() => { setPrimo(false); setErrore(''); }}>Ho già la password</button></p>
    </form>
  );
  return (
    <form onSubmit={entra}>
      {fatto && <div className="avviso-ok" role="status">{fatto}</div>}
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
      <button className="btn btn-primario btn-pieno btn-grande" disabled={invio}>{invio ? 'Accesso…' : 'Entra'}</button>
      <p style={{ textAlign: 'center', marginTop: 12 }}><button type="button" className="link-btn piccolo" onClick={() => { setPrimo(true); setErrore(''); }}>Primo accesso o password dimenticata?</button></p>
    </form>
  );
}

export default function Login() {
  return (
    <SchermataAccesso tipo="staff" titolo="Ciao!" testo="Segreteria e insegnanti: entra con la tua email e la password."
                      altra={{ href: '/area/accedi', titolo: 'Frequenti i corsi o sei un genitore?', testo: 'Entra nella tua area: basta l\'email' }}>
      <Suspense><Modulo /></Suspense>
    </SchermataAccesso>
  );
}
