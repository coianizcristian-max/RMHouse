'use client';
import { useState } from 'react';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase/browser';
import SchermataAccesso from '../../SchermataAccesso';
import Benvenuto from './Benvenuto';

// Accesso dei clienti:
//  1. scrive l'email che ha lasciato in segreteria
//  2a. se ha già la password → la scrive ed entra
//  2b. primo accesso → conferma chi è (ultime cifre del cellulare o data di nascita) e si crea la password
//  password dimenticata → codice dalla segreteria ("in diretta") oppure link via email
const VERIFICA = {
  telefono: ['Ultime 4 cifre del tuo cellulare', 'Quelle del numero che hai dato in segreteria', 'numeric', 4],
  nascita: ['Data di nascita (tua o di tuo figlio)', 'Quella registrata in segreteria', 'date', null],
  segreteria: ['Codice dalla segreteria', 'Chiedilo in segreteria: sono 6 cifre', 'numeric', 6],
};

export default function Accedi({ errore: erroreIniziale, dove = '/area', emailIniziale = '' }) {
  const [passo, setPasso] = useState('email');      // email | password | crea | codice | dimenticata | sconosciuta | link
  const [email, setEmail] = useState(emailIniziale);
  const [verifica, setVerifica] = useState('telefono');
  const [nome, setNome] = useState('');
  const [f, setF] = useState({ password: '', conferma: '', risposta: '', codice: '' });
  const [vedi, setVedi] = useState(false);
  const [errore, setErrore] = useState(erroreIniziale ? 'Il link non è più valido: riprova.' : '');
  const [invio, setInvio] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const pulita = email.trim().toLowerCase();
  const entra = () => { window.location.href = dove; };

  async function avanti(e) {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(pulita)) { setErrore('Controlla l\'indirizzo email.'); return; }
    setInvio(true); setErrore('');
    const r = await fetch('/api/accesso/stato', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: pulita }) });
    const d = await r.json().catch(() => ({}));
    setInvio(false);
    if (!r.ok) { setErrore(d.errore || 'Riprova tra poco.'); return; }
    setNome(d.nome || '');
    if (d.stato === 'attiva') setPasso('password');
    else if (d.stato === 'da_attivare') { setVerifica(d.verifica || 'segreteria'); setPasso(d.verifica === 'segreteria' ? 'codice' : 'crea'); }
    else setPasso('sconosciuta');
  }

  async function conPassword(e) {
    e.preventDefault();
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email: pulita, password: f.password });
    setInvio(false);
    if (error) { setErrore('Password sbagliata. Riprova, oppure tocca "Password dimenticata?".'); return; }
    entra();
  }

  async function creaPassword(e, conCodice) {
    e.preventDefault();
    if (f.password.length < 8) { setErrore('La password deve avere almeno 8 caratteri.'); return; }
    if (f.password !== f.conferma) { setErrore('Le due password non sono uguali.'); return; }
    setInvio(true); setErrore('');
    const r = await fetch('/api/accesso/attiva', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: pulita, password: f.password, ...(conCodice ? { codice: f.codice } : { verifica: f.risposta }) }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setInvio(false); setErrore(d.errore || 'Non riuscito. Riprova.'); return; }
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email: pulita, password: f.password });
    setInvio(false);
    if (error) { setErrore('Password salvata: ora entra con la tua email e la password.'); setPasso('password'); return; }
    entra();
  }

  async function linkEmail() {
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().auth.resetPasswordForEmail(pulita, {
      redirectTo: `${window.location.origin}/auth/callback?next=/area/nuova-password`,
    });
    setInvio(false);
    if (error) { setErrore('Invio non riuscito: chiedi un codice alla segreteria.'); return; }
    setPasso('link');
  }

  const altra = { href: '/login', titolo: 'Sei della segreteria o insegni qui?', testo: 'Entra nell\'area staff' };
  const campoPassword = (k, etichetta, auto) => (
    <div className="campo">
      <label htmlFor={k}>{etichetta}</label>
      <div className="acc-password">
        <input id={k} type={vedi ? 'text' : 'password'} autoComplete={auto} value={f[k]} onChange={set(k)} />
        {k === 'password' && <button type="button" className="link-btn piccolo" onClick={() => setVedi(!vedi)}>{vedi ? 'nascondi' : 'mostra'}</button>}
      </div>
    </div>
  );
  const emailFissa = (
    <p className="accesso-testo acc-email">
      <strong>{pulita}</strong> <button type="button" className="link-btn piccolo" onClick={() => { setPasso('email'); setErrore(''); }}>cambia</button>
    </p>
  );

  if (passo === 'password') return (
    <SchermataAccesso tipo="iscritti" titolo={nome ? `Ciao ${nome}!` : 'Bentornato!'} altra={altra}>
      {emailFissa}
      {errore && <div className="errore" role="alert">{errore}</div>}
      <form onSubmit={conPassword}>
        {campoPassword('password', 'Password', 'current-password')}
        <button className="btn btn-primario btn-pieno btn-grande" disabled={invio}>{invio ? 'Entro…' : 'Entra'}</button>
      </form>
      <p className="piccolo" style={{ marginTop: 14, marginBottom: 0 }}>
        <button type="button" className="link-btn" onClick={() => { setPasso('dimenticata'); setErrore(''); }}>Password dimenticata?</button>
      </p>
    </SchermataAccesso>
  );

  if (passo === 'crea' || passo === 'codice') {
    const [etichetta, aiuto, modo, max] = VERIFICA[passo === 'codice' ? 'segreteria' : verifica];
    const k = passo === 'codice' ? 'codice' : 'risposta';
    return (
      <SchermataAccesso tipo="iscritti" titolo={passo === 'codice' ? 'Nuova password' : `Benvenuto${nome ? `, ${nome}` : ''}!`} altra={altra}
                        testo={passo === 'codice' ? 'Scrivi il codice che ti ha dato la segreteria e scegli la password.' : 'È il tuo primo accesso: conferma chi sei e scegli la password. Poi entri sempre con email e password.'}>
        {emailFissa}
        {errore && <div className="errore" role="alert">{errore}</div>}
        <form onSubmit={(e) => creaPassword(e, passo === 'codice')}>
          <div className="campo">
            <label htmlFor="ver">{etichetta}</label>
            {modo === 'date'
              ? <input id="ver" type="date" value={f[k]} onChange={set(k)} />
              : <input id="ver" inputMode="numeric" autoComplete="one-time-code" maxLength={max} value={f[k]} onChange={set(k)} />}
            <span className="piccolo muto">{aiuto}</span>
          </div>
          {campoPassword('password', 'Scegli la password (almeno 8 caratteri)', 'new-password')}
          {campoPassword('conferma', 'Riscrivila', 'new-password')}
          <button className="btn btn-primario btn-pieno btn-grande" disabled={invio}>{invio ? 'Un attimo…' : 'Salva ed entra'}</button>
        </form>
        {passo === 'crea' && (
          <p className="piccolo muto" style={{ marginTop: 14, marginBottom: 0 }}>
            Non ti tornano i dati? <button type="button" className="link-btn" onClick={() => { setPasso('codice'); setErrore(''); }}>Ho un codice dalla segreteria</button>
          </p>
        )}
      </SchermataAccesso>
    );
  }

  if (passo === 'dimenticata') return (
    <SchermataAccesso tipo="iscritti" titolo="Password dimenticata" altra={altra}>
      {emailFissa}
      {errore && <div className="errore" role="alert">{errore}</div>}
      <div className="acc-scelte">
        <button type="button" className="btn btn-primario btn-pieno" onClick={() => { setPasso('codice'); setErrore(''); }}>Ho un codice dalla segreteria</button>
        <button type="button" className="btn btn-pieno" disabled={invio} onClick={linkEmail}>{invio ? 'Invio…' : 'Mandami un link via email'}</button>
      </div>
      <p className="piccolo muto" style={{ marginTop: 12, marginBottom: 0 }}>Il codice lo chiedi in segreteria (anche su WhatsApp): vale 3 giorni e una volta sola.</p>
    </SchermataAccesso>
  );

  if (passo === 'link') return (
    <SchermataAccesso tipo="iscritti" titolo="Controlla la posta" altra={altra}>
      <p className="accesso-testo">Ti abbiamo mandato un link a <strong>{pulita}</strong>: aprilo da questo telefono e scegli la nuova password.</p>
      <p className="piccolo muto">Non arriva? Guarda nello spam, oppure <button className="link-btn" onClick={() => setPasso('codice')}>usa un codice della segreteria</button>.</p>
    </SchermataAccesso>
  );

  if (passo === 'sconosciuta') return (
    <SchermataAccesso tipo="iscritti" titolo="Non ti troviamo" altra={altra}>
      {emailFissa}
      <p className="accesso-testo">Questa email non è fra quelle registrate in segreteria. Forse ne hai lasciata un'altra: scrivici e la sistemiamo.</p>
      <p className="accesso-testo">Non sei ancora iscritto? <Link href="/prova">Prenota una lezione di prova</Link>.</p>
    </SchermataAccesso>
  );

  return (
    <>
    <Benvenuto />
    <SchermataAccesso tipo="iscritti" titolo="Ciao!" altra={altra}
                      testo="Allievi e genitori: scrivi l'email che hai lasciato in segreteria.">
      {errore && <div className="errore" role="alert">{errore}</div>}
      <form onSubmit={avanti}>
        <div className="campo">
          <label htmlFor="em">Email</label>
          <input id="em" type="email" autoComplete="email" inputMode="email" value={email}
                 onChange={(e) => setEmail(e.target.value)} placeholder="nome@esempio.it" autoFocus />
        </div>
        <button className="btn btn-primario btn-pieno btn-grande" disabled={invio}>{invio ? 'Un attimo…' : 'Avanti'}</button>
      </form>
    </SchermataAccesso>
    </>
  );
}
