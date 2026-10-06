'use client';
import { useState } from 'react';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase/browser';
import SchermataAccesso from '../../../SchermataAccesso';
import { Data, eta, maiuscole } from '../../../gestione/sportello/campi';

const FIGLIO = { nome: '', cognome: '', nascita: '' };

// Registrazione di un nuovo cliente in due schermate:
// 1) chi viene a lezione (io / mio figlio / entrambi)  2) i dati, i figli, la password
export default function Registrati({ emailIniziale = '', corso = '', da = '' }) {
  const [chi, setChi] = useState('');           // io | figli | entrambi
  const [f, setF] = useState({ nome: '', cognome: '', nascita: '', telefono: '', email: emailIniziale, password: '', privacy: false, marketing: false });
  const [figli, setFigli] = useState([{ ...FIGLIO }]);
  const [errore, setErrore] = useState('');
  const [gia, setGia] = useState(false);
  const [invio, setInvio] = useState(false);
  const set = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const bello = (k) => () => setF((v) => ({ ...v, [k]: v[k] ? maiuscole(v[k]) : '' }));
  const conFigli = chi === 'figli' || chi === 'entrambi';
  const frequenta = chi === 'io' || chi === 'entrambi';
  const dopo = da && da !== '/area' ? da : `/area/iscriviti${corso ? `?corso=${corso}` : ''}`;

  async function crea(e) {
    e.preventDefault();
    setErrore(''); setGia(false);
    if (!f.nome.trim() || !f.cognome.trim()) { setErrore('Scrivi il tuo nome e cognome.'); return; }
    if (frequenta && !f.nascita) { setErrore('Scrivi la tua data di nascita.'); return; }
    if (frequenta && eta(f.nascita) < 14) { setErrore('Sotto i 14 anni si registra il genitore: scegli "Mio figlio/a".'); return; }
    const validi = figli.filter((x) => x.nome.trim());
    if (conFigli && !validi.length) { setErrore('Scrivi il nome di tuo figlio/a.'); return; }
    if (conFigli && validi.some((x) => !x.nascita)) { setErrore('Scrivi la data di nascita di ogni figlio.'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) { setErrore('Controlla l\'email.'); return; }
    if (f.telefono.replace(/\D/g, '').length < 8) { setErrore('Scrivi il cellulare: serve per gli avvisi sulle lezioni.'); return; }
    if (f.password.length < 8) { setErrore('La password deve avere almeno 8 caratteri.'); return; }
    if (!f.privacy) { setErrore('Per continuare serve il consenso alla privacy.'); return; }
    setInvio(true);
    const r = await fetch('/api/accesso/registrati', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...f, email: f.email.trim(), frequenta, figli: conFigli ? validi : [] }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setInvio(false); setErrore(d.errore || 'Registrazione non riuscita. Riprova.'); setGia(!!d.gia); return; }
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email: f.email.trim().toLowerCase(), password: f.password });
    if (error) { window.location.href = `/area/accedi?email=${encodeURIComponent(f.email.trim())}&da=${encodeURIComponent(dopo)}`; return; }
    window.location.href = dopo;
  }

  if (!chi) return (
    <SchermataAccesso tipo="iscritti" titolo="Iscriviti" testo="In pochi passi: ti registri, scegli il corso, i giorni e paghi. Chi viene a lezione?">
      <div className="reg-scelte">
        <button type="button" onClick={() => setChi('io')}><strong>Io</strong><span>mi iscrivo io</span></button>
        <button type="button" onClick={() => setChi('figli')}><strong>Mio figlio / mia figlia</strong><span>sono il genitore, anche più figli</span></button>
        <button type="button" onClick={() => setChi('entrambi')}><strong>Io e mio figlio/a</strong><span>veniamo tutti e due</span></button>
      </div>
      <p className="accesso-testo">Sei già nostro cliente? <Link href="/area/accedi">Entra da qui</Link>.</p>
    </SchermataAccesso>
  );

  return (
    <SchermataAccesso tipo="iscritti" titolo="I tuoi dati" testo={conFigli ? 'Prima i dati del genitore (riceve avvisi e ricevute), poi quelli dei figli.' : 'Ti servono per l\'iscrizione, gli avvisi e la ricevuta.'}>
      <form onSubmit={crea} className="reg-form">
        <button type="button" className="link-btn piccolo reg-indietro" onClick={() => setChi('')}>← cambia: {chi === 'io' ? 'io' : chi === 'figli' ? 'mio figlio/a' : 'io e mio figlio/a'}</button>
        <div className="reg-riga">
          <div className="campo"><label htmlFor="r-nome">Nome</label><input id="r-nome" autoComplete="given-name" value={f.nome} onChange={set('nome')} onBlur={bello('nome')} /></div>
          <div className="campo"><label htmlFor="r-cognome">Cognome</label><input id="r-cognome" autoComplete="family-name" value={f.cognome} onChange={set('cognome')} onBlur={bello('cognome')} /></div>
        </div>
        {frequenta && <Data id="r-nascita" etichetta="La tua data di nascita" valore={f.nascita} onChange={(v) => setF((x) => ({ ...x, nascita: v }))} mostraEta />}
        <div className="campo"><label htmlFor="r-tel">Cellulare</label><input id="r-tel" type="tel" inputMode="tel" autoComplete="tel" value={f.telefono} onChange={set('telefono')} /></div>
        <div className="campo"><label htmlFor="r-email">Email</label><input id="r-email" type="email" inputMode="email" autoComplete="email" value={f.email} onChange={set('email')} /></div>

        {conFigli && (
          <fieldset className="reg-figli" aria-label="Figli">
            <div className="reg-figli-titolo">{figli.length > 1 ? 'I tuoi figli' : 'Tuo figlio / tua figlia'}</div>
            {figli.map((x, i) => (
              <div key={i} className="reg-figlio">
                <div className="reg-riga">
                  <div className="campo"><label htmlFor={`f-nome-${i}`}>Nome</label>
                    <input id={`f-nome-${i}`} value={x.nome} onChange={(e) => setFigli((l) => l.map((y, j) => (j === i ? { ...y, nome: e.target.value } : y)))}
                           onBlur={() => setFigli((l) => l.map((y, j) => (j === i && y.nome ? { ...y, nome: maiuscole(y.nome) } : y)))} /></div>
                  <div className="campo"><label htmlFor={`f-cognome-${i}`}>Cognome</label>
                    <input id={`f-cognome-${i}`} value={x.cognome} placeholder={f.cognome} onChange={(e) => setFigli((l) => l.map((y, j) => (j === i ? { ...y, cognome: e.target.value } : y)))} /></div>
                </div>
                <Data id={`f-nascita-${i}`} etichetta="Data di nascita" valore={x.nascita} mostraEta onChange={(v) => setFigli((l) => l.map((y, j) => (j === i ? { ...y, nascita: v } : y)))} />
                {figli.length > 1 && <button type="button" className="link-btn piccolo" onClick={() => setFigli((l) => l.filter((_, j) => j !== i))}>togli</button>}
              </div>
            ))}
            {figli.length < 6 && <button type="button" className="btn btn-piccolo" onClick={() => setFigli((l) => [...l, { ...FIGLIO }])}>+ un altro figlio</button>}
          </fieldset>
        )}

        <div className="campo"><label htmlFor="r-pw">Scegli una password</label>
          <input id="r-pw" type="password" autoComplete="new-password" value={f.password} onChange={set('password')} placeholder="almeno 8 caratteri" /></div>
        <label className="spunta"><input type="checkbox" checked={f.privacy} onChange={set('privacy')} />
          <span>Ho letto l&apos;<Link href="/privacy" target="_blank">informativa privacy</Link> e acconsento al trattamento dei dati per l&apos;iscrizione</span></label>
        <label className="spunta"><input type="checkbox" checked={f.marketing} onChange={set('marketing')} /><span>Voglio ricevere novità su corsi ed eventi (facoltativo)</span></label>
        {errore && <div className="errore" role="alert">{errore}{gia && <> <Link href={`/area/accedi?email=${encodeURIComponent(f.email.trim())}`}>Vai ad Accedi →</Link></>}</div>}
        <button className="btn btn-primario btn-pieno btn-grande" disabled={invio}>{invio ? 'Un attimo…' : 'Crea l\'account e scegli il corso →'}</button>
      </form>
    </SchermataAccesso>
  );
}
