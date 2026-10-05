'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';

// ---------------------------------------------------------------------
// Aiuti per scrivere in fretta e giusto
// ---------------------------------------------------------------------
const maiuscole = (s) => s.trim().toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
const soloCifre = (s) => s.replace(/\D/g, '');

// "12052015" → "12/05/2015"; accetta anche 12-5-2015, 12.5.15
function formattaData(v) {
  const c = soloCifre(v).slice(0, 8);
  if (c.length <= 2) return c;
  if (c.length <= 4) return `${c.slice(0, 2)}/${c.slice(2)}`;
  return `${c.slice(0, 2)}/${c.slice(2, 4)}/${c.slice(4)}`;
}
function dataISO(v) {
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  let [, g, mm, a] = m;
  if (a.length === 2) a = (Number(a) > new Date().getFullYear() % 100 ? '19' : '20') + a;
  const d = new Date(`${a}-${mm.padStart(2, '0')}-${g.padStart(2, '0')}T12:00:00`);
  if (Number.isNaN(d.getTime()) || d.getDate() !== Number(g)) return null;
  return `${a}-${mm.padStart(2, '0')}-${g.padStart(2, '0')}`;
}
const daISO = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

// Dal codice fiscale: data di nascita e sesso
const MESI_CF = 'ABCDEHLMPRST';
function leggiCF(cf) {
  const s = cf.toUpperCase().replace(/\s/g, '');
  if (!/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(s)) return null;
  const num = (x) => Number(x.split('').map((c) => ('LMNPQRSTUV'.includes(c) ? 'LMNPQRSTUV'.indexOf(c) : c)).join(''));
  const aa = num(s.slice(6, 8)), mese = MESI_CF.indexOf(s[8]) + 1; let gg = num(s.slice(9, 11));
  if (!mese) return null;
  const sesso = gg > 40 ? 'F' : 'M'; if (gg > 40) gg -= 40;
  const anno = aa > new Date().getFullYear() % 100 ? 1900 + aa : 2000 + aa;
  return { data: `${anno}-${String(mese).padStart(2, '0')}-${String(gg).padStart(2, '0')}`, sesso };
}
const eta = (iso) => {
  if (!iso) return null;
  const n = new Date(iso), o = new Date();
  return o.getFullYear() - n.getFullYear() - (o < new Date(o.getFullYear(), n.getMonth(), n.getDate()) ? 1 : 0);
};

const VUOTO = {
  modo: 'adulto',
  nome: '', cognome: '', telefono: '', email: '', cf: '', nascita: '', sesso: '',
  indirizzo: '', cap: '', citta: '', provincia: '',
  f_nome: '', f_cognome: '', f_nascita: '', f_cf: '', f_sesso: '',
  certificato: '', privacy: true, marketing: false,
};
const MOTIVI = {
  nome_mancante: 'Scrivi almeno il nome.',
  email_non_valida: "L'email non sembra giusta: controllala.",
  data_nascita_mancante: 'Manca la data di nascita di chi frequenta.',
};

function Data({ id, valore, onChange, etichetta }) {
  const [testo, setTesto] = useState(daISO(valore));
  useEffect(() => { setTesto(daISO(valore)); }, [valore]);
  const iso = dataISO(testo);
  const anni = eta(iso);
  return (
    <div className="campo">
      {/* l'età (o "non valida") sta accanto all'etichetta: niente riga in più sotto */}
      <label htmlFor={id}>{etichetta}
        {testo && !iso ? <span className="eti-info errore-testo"> · non valida</span>
          : anni != null && etichetta.startsWith('Data') ? <span className="eti-info"> · {anni} anni</span> : null}
      </label>
      <input id={id} inputMode="numeric" placeholder="gg/mm/aaaa" title="Si può scrivere anche 12052015" value={testo} autoComplete="off"
             onChange={(e) => { const t = formattaData(e.target.value); setTesto(t); onChange(dataISO(t) || ''); }} />
    </div>
  );
}

export default function NuovaPersona({ palestraId }) {
  const router = useRouter();
  const [f, setF] = useState(VUOTO);
  const [altri, setAltri] = useState(false);
  const [doppioni, setDoppioni] = useState([]);
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState('');
  const [fatti, setFatti] = useState([]);   // registrati in questa sessione
  const primo = useRef(null);
  const figlio = f.modo === 'figlio';

  const set = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const sistema = (k, fn) => () => setF((v) => ({ ...v, [k]: fn(v[k]) }));

  // il codice fiscale riempie data di nascita e sesso
  function cambiaCF(k, kData, kSesso) {
    return (e) => {
      const cf = e.target.value.toUpperCase().replace(/\s/g, '').slice(0, 16);
      const letto = leggiCF(cf);
      setF((v) => ({ ...v, [k]: cf, ...(letto ? { [kData]: v[kData] || letto.data, [kSesso]: letto.sesso } : {}) }));
    };
  }

  // doppioni: mentre si scrive
  useEffect(() => {
    const t = setTimeout(async () => {
      const cercaNome = figlio ? f.f_nome : f.nome, cercaCognome = figlio ? f.f_cognome : f.cognome;
      if (!(f.email.includes('@') || soloCifre(f.telefono).length >= 8 || (f.cf || f.f_cf).length === 16
            || (cercaNome.trim().length >= 2 && cercaCognome.trim().length >= 2))) { setDoppioni([]); return; }
      const { data } = await supabaseBrowser().rpc('cerca_doppioni', {
        p_palestra: palestraId, p_nome: cercaNome, p_cognome: cercaCognome,
        p_email: f.email, p_telefono: f.telefono, p_cf: figlio ? f.f_cf : f.cf,
      });
      setDoppioni(data || []);
    }, 350);
    return () => clearTimeout(t);
  }, [f.nome, f.cognome, f.email, f.telefono, f.cf, f.f_nome, f.f_cognome, f.f_cf, figlio, palestraId]);

  async function salva(dopo) {
    setErrore('');
    if (!f.nome.trim()) { setErrore(figlio ? 'Scrivi il nome del genitore.' : 'Scrivi il nome.'); return; }
    if (figlio && !f.f_nome.trim()) { setErrore('Scrivi il nome di chi frequenta.'); return; }
    if (!(figlio ? f.f_nascita : f.nascita)) { setErrore('Manca la data di nascita di chi frequenta.'); return; }
    setInvio(dopo);
    const { data, error } = await supabaseBrowser().rpc('crea_persona', { p: {
      palestra_id: palestraId,
      titolare: {
        nome: maiuscole(f.nome), cognome: maiuscole(f.cognome), email: f.email.trim().toLowerCase(), telefono: f.telefono.trim(),
        codice_fiscale: f.cf, indirizzo: f.indirizzo, cap: f.cap, citta: maiuscole(f.citta), provincia: f.provincia,
        data_nascita: f.nascita, sesso: f.sesso,
      },
      allievo: figlio ? { nome: maiuscole(f.f_nome), cognome: maiuscole(f.f_cognome || f.cognome), data_nascita: f.f_nascita,
                          codice_fiscale: f.f_cf, sesso: f.f_sesso } : {},
      certificato_scadenza: f.certificato, consenso_privacy: f.privacy, consenso_marketing: f.marketing, fonte: 'segreteria',
    } });
    setInvio('');
    if (error) {
      const k = Object.keys(MOTIVI).find((m) => error.message?.includes(m));
      setErrore(k ? MOTIVI[k] : 'Salvataggio non riuscito.'); return;
    }
    const chi = figlio ? `${maiuscole(f.f_nome)} ${maiuscole(f.f_cognome || f.cognome)}` : `${maiuscole(f.nome)} ${maiuscole(f.cognome)}`;
    if (dopo === 'iscrivi') { router.push(`/gestione/persone/${data.allievo_id}?iscrivi=1`); return; }
    if (dopo === 'scheda') { router.push(`/gestione/persone/${data.allievo_id}`); return; }
    setFatti((v) => [{ id: data.allievo_id, chi, gia: data.allievo_nuovo === false }, ...v].slice(0, 6));
    if (dopo === 'fratello') {
      // stesso genitore, nuovo figlio
      setF((v) => ({ ...v, f_nome: '', f_nascita: '', f_cf: '', f_sesso: '', certificato: '' }));
    } else {
      setF({ ...VUOTO, modo: f.modo });
    }
    setDoppioni([]);
    setTimeout(() => primo.current?.focus(), 50);
  }

  return (
    <div className="registra">
      <div className="intestazione">
        <div className="occhiello">Persone</div>
        <h1>Nuovo cliente</h1>
        <p>Scrivi in fretta: maiuscole, date e codice fiscale si sistemano da soli, e se la persona c'è già te lo dico subito.</p>
      </div>

      <div className="reg-modo" role="tablist">
        <button type="button" role="tab" aria-selected={!figlio} onClick={() => setF({ ...f, modo: 'adulto' })}>Si iscrive lui / lei</button>
        <button type="button" role="tab" aria-selected={figlio} onClick={() => setF({ ...f, modo: 'figlio' })}>Un genitore iscrive un figlio o una figlia</button>
      </div>

      {errore && <div className="errore" role="alert">{errore}</div>}

      <form className="reg-griglia" onSubmit={(e) => { e.preventDefault(); salva('iscrivi'); }}>
        <div className="reg-colonna">
          <section className="pannello">
            <h2>{figlio ? 'Il genitore (paga e riceve i messaggi)' : 'Chi si iscrive'}</h2>
            <div className="reg-campi">
              <div className="campo"><label htmlFor="n">Nome</label>
                <input id="n" ref={primo} value={f.nome} onChange={set('nome')} onBlur={sistema('nome', maiuscole)} autoFocus autoComplete="off" /></div>
              <div className="campo"><label htmlFor="c">Cognome</label>
                <input id="c" value={f.cognome} onChange={set('cognome')} onBlur={sistema('cognome', maiuscole)} autoComplete="off" /></div>
              <div className="campo"><label htmlFor="t">Telefono</label>
                <input id="t" type="tel" inputMode="tel" value={f.telefono} onChange={set('telefono')} placeholder="per WhatsApp" autoComplete="off" /></div>
              <div className="campo"><label htmlFor="e">Email</label>
                <input id="e" type="email" inputMode="email" value={f.email} onChange={set('email')} onBlur={sistema('email', (x) => x.trim().toLowerCase())}
                       placeholder="per l'area clienti" autoComplete="off" /></div>
              <div className="campo"><label htmlFor="cf">Codice fiscale</label>
                <input id="cf" value={f.cf} onChange={cambiaCF('cf', 'nascita', 'sesso')} autoComplete="off" spellCheck={false} />
                {f.cf.length === 16 && !leggiCF(f.cf) && <span className="piccolo" style={{ color: 'var(--attenzione)' }}>Codice fiscale da controllare</span>}</div>
              {!figlio && <Data id="dn" etichetta="Data di nascita" valore={f.nascita} onChange={(v) => setF((x) => ({ ...x, nascita: v }))} />}
              {/* per il genitore non serve la data di nascita: al suo posto il pulsante dell'indirizzo */}
              {figlio && (
                <div className="campo reg-cella-btn">
                  <button type="button" className="link-btn piccolo" onClick={() => setAltri(!altri)}>
                    {altri ? '− nascondi indirizzo' : '+ indirizzo, CAP, città'}
                  </button>
                </div>
              )}
            </div>
            {!figlio && (
              <button type="button" className="link-btn piccolo" onClick={() => setAltri(!altri)}>
                {altri ? '− nascondi indirizzo' : '+ indirizzo, CAP, città (per ricevute e tessera)'}
              </button>
            )}
            {altri && (
              <div className="reg-campi" style={{ marginTop: 8 }}>
                <div className="campo reg-largo"><label htmlFor="in">Indirizzo</label><input id="in" value={f.indirizzo} onChange={set('indirizzo')} /></div>
                <div className="campo"><label htmlFor="cap">CAP</label><input id="cap" inputMode="numeric" maxLength={5} value={f.cap} onChange={set('cap')} /></div>
                <div className="campo"><label htmlFor="ci">Città</label><input id="ci" value={f.citta} onChange={set('citta')} onBlur={sistema('citta', maiuscole)} /></div>
                <div className="campo"><label htmlFor="pr">Provincia</label><input id="pr" maxLength={2} value={f.provincia} onChange={(e) => setF({ ...f, provincia: e.target.value.toUpperCase() })} placeholder="VI" /></div>
              </div>
            )}
          </section>

          {figlio && (
            <section className="pannello">
              <h2>Chi frequenta</h2>
              <div className="reg-campi reg-4">
                <div className="campo"><label htmlFor="fn">Nome</label>
                  <input id="fn" value={f.f_nome} onChange={set('f_nome')} onBlur={sistema('f_nome', maiuscole)} autoComplete="off" /></div>
                <div className="campo"><label htmlFor="fc">Cognome</label>
                  <input id="fc" value={f.f_cognome} onChange={set('f_cognome')} onBlur={sistema('f_cognome', maiuscole)}
                         placeholder={f.cognome || 'come il genitore'} autoComplete="off" /></div>
                <div className="campo"><label htmlFor="fcf">Codice fiscale</label>
                  <input id="fcf" value={f.f_cf} onChange={cambiaCF('f_cf', 'f_nascita', 'f_sesso')} autoComplete="off" spellCheck={false} /></div>
                <Data id="fdn" etichetta="Data di nascita" valore={f.f_nascita} onChange={(v) => setF((x) => ({ ...x, f_nascita: v }))} />
              </div>
            </section>
          )}

          <section className="pannello reg-chiusura">
            <Data id="cert" etichetta="Certificato medico: scade il" valore={f.certificato} onChange={(v) => setF((x) => ({ ...x, certificato: v }))} />
            <div className="reg-consensi">
              <label className="spunta"><input type="checkbox" checked={f.privacy} onChange={set('privacy')} /><span>Privacy accettata</span></label>
              <label className="spunta"><input type="checkbox" checked={f.marketing} onChange={set('marketing')} /><span>Vuole ricevere novità e promozioni</span></label>
            </div>
          </section>

          <div className="reg-azioni">
            <button className="btn btn-primario btn-grande" disabled={!!invio}>{invio === 'iscrivi' ? 'Salvo…' : 'Crea e iscrivi a un corso ↵'}</button>
            <button type="button" className="btn" disabled={!!invio} onClick={() => salva('altro')}>Crea e registra un'altra persona</button>
            {figlio && <button type="button" className="btn" disabled={!!invio} onClick={() => salva('fratello')}>Crea e aggiungi un fratello o una sorella</button>}
            <button type="button" className="link-btn" disabled={!!invio} onClick={() => salva('scheda')}>Crea e apri la scheda</button>
          </div>
        </div>

        <aside className="reg-lato">
          <section className={`pannello${doppioni.length ? ' reg-doppioni' : ''}`}>
            <h2>{doppioni.length ? 'Forse c\'è già' : 'Controllo doppioni'}</h2>
            {doppioni.length === 0 ? (
              <p className="piccolo muto" style={{ margin: 0 }}>Mentre scrivi nome, telefono, email o codice fiscale controllo che la persona non sia già registrata.</p>
            ) : (
              <ul className="mini-lista">
                {doppioni.map((d) => (
                  <li key={d.allievo_id}>
                    <a href={`/gestione/persone/${d.allievo_id}`}>
                      <span className="ml-testo">
                        <strong>{d.cognome} {d.nome}</strong>
                        <span className="piccolo muto">{d.motivo}{d.data_nascita ? ` · ${daISO(d.data_nascita)}` : ''}{d.telefono ? ` · ${d.telefono}` : ''}</span>
                      </span>
                      <span className="piccolo">apri →</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {fatti.length > 0 && (
            <section className="pannello">
              <h2>Appena registrati</h2>
              <ul className="mini-lista">
                {fatti.map((x) => (
                  <li key={x.id}><a href={`/gestione/persone/${x.id}?iscrivi=1`}>
                    <span className="ml-testo"><strong>{x.chi}</strong>{x.gia && <span className="piccolo muto"> · c'era già, scheda aggiornata</span>}</span><span className="piccolo">iscrivi →</span></a></li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </form>
    </div>
  );
}
