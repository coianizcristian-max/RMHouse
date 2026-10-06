'use client';
import { useEffect, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import ControlloCF from '../persone/[id]/ControlloCF';
import { Data, maiuscole, soloCifre, eta } from './campi';

const MOTIVI = {
  nome_mancante: 'Scrivi almeno il nome.',
  email_non_valida: "L'email non sembra giusta: controllala.",
  data_nascita_mancante: 'Manca la data di nascita di chi frequenta.',
};

// Nuovo cliente in una colonna: adulto oppure minore con il genitore che paga.
// Mentre si scrive avvisa se la persona c'è già (stessa ricerca del modulo "Nuovo cliente").
export default function NuovoCliente({ palestraId, testoIniziale = '', onCreato, onUsa, onAnnulla }) {
  const parti = testoIniziale.trim().split(/\s+/).filter(Boolean);
  const [f, setF] = useState({
    minore: false,
    nome: parti[0] ? maiuscole(parti[0]) : '', cognome: parti.slice(1).join(' ') ? maiuscole(parti.slice(1).join(' ')) : '',
    nascita: '', sesso: '', luogo: '', cf: '', email: '', telefono: '',
    g_nome: '', g_cognome: '', g_cf: '',
    indirizzo: '', cap: '', citta: '', provincia: '', privacy: true,
  });
  const [doppioni, setDoppioni] = useState([]);
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const primo = useRef(null);
  useEffect(() => { primo.current?.focus(); }, []);

  const set = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const bello = (k) => () => setF((v) => ({ ...v, [k]: v[k] ? maiuscole(v[k]) : '' }));
  const anni = eta(f.nascita);

  // se dalla data è minorenne, si passa da solo a "minore con genitore"
  useEffect(() => { if (anni != null && anni < 18 && !f.minore) setF((v) => ({ ...v, minore: true })); }, [anni]); // eslint-disable-line

  const ultima = useRef(0);
  useEffect(() => {
    const utile = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim()) || soloCifre(f.telefono).length >= 8 || f.cf.length === 16
      || (f.nome.trim().length >= 2 && f.cognome.trim().length >= 2) || !!f.nascita;
    if (!utile) { setDoppioni([]); return undefined; }
    const t = setTimeout(async () => {
      const n = ++ultima.current;
      const { data } = await supabaseBrowser().rpc('possibili_doppioni', {
        p_palestra: palestraId, p_nome: f.nome, p_cognome: f.cognome, p_nascita: f.nascita || null,
        p_cf: f.cf, p_email: f.email, p_telefono: f.telefono,
      });
      if (n === ultima.current) setDoppioni((data || []).filter((d) => d.livello !== 'famiglia' || f.minore));
    }, 350);
    return () => clearTimeout(t);
  }, [f.nome, f.cognome, f.nascita, f.cf, f.email, f.telefono, f.minore, palestraId]);

  async function salva(e) {
    e.preventDefault();
    setErrore('');
    if (!f.nome.trim() || !f.cognome.trim()) { setErrore('Scrivi nome e cognome.'); return; }
    if (!f.nascita) { setErrore('Scrivi la data di nascita.'); return; }
    if (f.minore && !f.g_nome.trim()) { setErrore('Per un minore scrivi il nome del genitore che paga.'); return; }
    if (!f.email.trim() && !soloCifre(f.telefono)) { setErrore('Serve almeno un\'email o un cellulare (per la ricevuta e gli avvisi).'); return; }
    setInvio(true);
    const contatti = { email: f.email.trim(), telefono: f.telefono.trim(), indirizzo: f.indirizzo.trim(), cap: f.cap.trim(), citta: f.citta.trim(), provincia: f.provincia.trim() };
    const persona = { nome: f.nome.trim(), cognome: f.cognome.trim(), data_nascita: f.nascita, codice_fiscale: f.cf.trim(), sesso: f.sesso };
    const { data, error } = await supabaseBrowser().rpc('crea_persona', {
      p: {
        palestra_id: palestraId, fonte: 'segreteria', consenso_privacy: f.privacy,
        titolare: f.minore ? { nome: f.g_nome.trim(), cognome: f.g_cognome.trim() || f.cognome.trim(), codice_fiscale: f.g_cf.trim(), ...contatti }
                           : { ...persona, ...contatti },
        allievo: f.minore ? persona : {},
      },
    });
    if (error) {
      setInvio(false);
      const k = Object.keys(MOTIVI).find((x) => error.message?.includes(x));
      setErrore(MOTIVI[k] || 'Salvataggio non riuscito. Riprova.');
      return;
    }
    // il luogo di nascita (serve per il codice fiscale e la tessera) non passa da crea_persona
    if (f.luogo.trim()) await supabaseBrowser().from('allievi').update({ luogo_nascita: f.luogo.trim() }).eq('id', data.allievo_id);
    setInvio(false);
    onCreato(data.allievo_id);
  }

  return (
    <form className="sp-nuovo" onSubmit={salva}>
      <div className="sp-titolo-riga">
        <h3>Nuovo cliente</h3>
        <button type="button" className="link-btn piccolo" onClick={onAnnulla}>← torna a cercare</button>
      </div>
      <div className="sp-scelta" role="radiogroup" aria-label="Chi frequenta">
        <button type="button" role="radio" aria-checked={!f.minore} className={!f.minore ? 'attiva' : ''} onClick={() => setF((v) => ({ ...v, minore: false }))}>Adulto</button>
        <button type="button" role="radio" aria-checked={f.minore} className={f.minore ? 'attiva' : ''} onClick={() => setF((v) => ({ ...v, minore: true }))}>Minore (paga il genitore)</button>
      </div>

      {doppioni.length > 0 && (
        <div className={`sp-doppioni${doppioni.some((d) => d.livello === 'sicuro') ? ' forte' : ''}`} role="status">
          <strong>{doppioni.some((d) => d.livello === 'sicuro') ? 'C\'è già:' : 'Forse c\'è già:'}</strong>
          {doppioni.slice(0, 3).map((d) => (
            <div key={d.allievo_id} className="sp-doppione">
              <span>{d.nome} {d.cognome}{d.data_nascita ? ` · ${d.data_nascita.split('-').reverse().join('/')}` : ''}<span className="muto"> · {d.motivo}</span></span>
              <button type="button" className="btn btn-piccolo" onClick={() => onUsa(d.allievo_id)}>È lei/lui</button>
            </div>
          ))}
        </div>
      )}

      <div className="sp-campi-2">
        <div className="campo"><label htmlFor="sp-nome">Nome</label><input id="sp-nome" ref={primo} value={f.nome} onChange={set('nome')} onBlur={bello('nome')} autoComplete="off" /></div>
        <div className="campo"><label htmlFor="sp-cognome">Cognome</label><input id="sp-cognome" value={f.cognome} onChange={set('cognome')} onBlur={bello('cognome')} autoComplete="off" /></div>
        <Data id="sp-nascita" etichetta="Data di nascita" valore={f.nascita} onChange={(v) => setF((x) => ({ ...x, nascita: v }))} mostraEta />
        <div className="campo"><label htmlFor="sp-sesso">Sesso</label>
          <select id="sp-sesso" value={f.sesso} onChange={set('sesso')}><option value="">—</option><option value="F">F</option><option value="M">M</option></select>
        </div>
        <div className="campo"><label htmlFor="sp-luogo">Luogo di nascita</label><input id="sp-luogo" value={f.luogo} onChange={set('luogo')} onBlur={bello('luogo')} placeholder="es. Vicenza" autoComplete="off" /></div>
        <div className="campo"><label htmlFor="sp-cf">Codice fiscale</label><input id="sp-cf" value={f.cf} onChange={(e) => setF((v) => ({ ...v, cf: e.target.value.toUpperCase().replace(/\s/g, '').slice(0, 16) }))} autoComplete="off" /></div>
      </div>
      <ControlloCF nome={f.nome} cognome={f.cognome} data={f.nascita} sesso={f.sesso} luogo={f.luogo} cf={f.cf}
                   onCambia={(patch) => setF((v) => ({
                     ...v,
                     ...(patch.cf_allievo ? { cf: patch.cf_allievo } : {}),
                     ...(patch.nome ? { nome: patch.nome, cognome: patch.cognome } : {}),
                     ...(patch.sesso ? { sesso: patch.sesso } : {}),
                     ...(patch.data_nascita ? { nascita: patch.data_nascita } : {}),
                     ...(patch.luogo_nascita ? { luogo: patch.luogo_nascita } : {}),
                   }))} />

      {f.minore && (
        <div className="sp-campi-3">
          <div className="campo"><label htmlFor="sp-gnome">Genitore: nome</label><input id="sp-gnome" value={f.g_nome} onChange={set('g_nome')} onBlur={bello('g_nome')} autoComplete="off" /></div>
          <div className="campo"><label htmlFor="sp-gcognome">Cognome</label><input id="sp-gcognome" value={f.g_cognome} onChange={set('g_cognome')} onBlur={bello('g_cognome')} placeholder={f.cognome} autoComplete="off" /></div>
          <div className="campo"><label htmlFor="sp-gcf">Cod. fiscale (ricevuta)</label><input id="sp-gcf" value={f.g_cf} onChange={(e) => setF((v) => ({ ...v, g_cf: e.target.value.toUpperCase().replace(/\s/g, '').slice(0, 16) }))} autoComplete="off" /></div>
        </div>
      )}
      <div className="sp-campi-2">
        <div className="campo"><label htmlFor="sp-tel">{f.minore ? 'Cellulare del genitore' : 'Cellulare'}</label><input id="sp-tel" inputMode="tel" value={f.telefono} onChange={set('telefono')} autoComplete="off" /></div>
        <div className="campo"><label htmlFor="sp-email">{f.minore ? 'Email del genitore' : 'Email'}</label><input id="sp-email" type="email" value={f.email} onChange={set('email')} autoComplete="off" /></div>
      </div>
      <div className="sp-campi-indirizzo">
        <div className="campo"><label htmlFor="sp-ind">Indirizzo</label><input id="sp-ind" value={f.indirizzo} onChange={set('indirizzo')} onBlur={bello('indirizzo')} autoComplete="off" /></div>
        <div className="campo"><label htmlFor="sp-cap">CAP</label><input id="sp-cap" inputMode="numeric" value={f.cap} onChange={set('cap')} autoComplete="off" /></div>
        <div className="campo"><label htmlFor="sp-citta">Comune</label><input id="sp-citta" value={f.citta} onChange={set('citta')} onBlur={bello('citta')} autoComplete="off" /></div>
        <div className="campo"><label htmlFor="sp-prov">Prov.</label><input id="sp-prov" value={f.provincia} maxLength={2} onChange={(e) => setF((v) => ({ ...v, provincia: e.target.value.toUpperCase() }))} autoComplete="off" /></div>
      </div>
      <label className="spunta piccolo"><input type="checkbox" checked={f.privacy} onChange={set('privacy')} /><span>Ha firmato il modulo privacy</span></label>
      {errore && <div className="errore" role="alert">{errore}</div>}
      <button className="btn btn-primario sp-largo" disabled={invio}>{invio ? 'Salvo…' : 'Salva e continua →'}</button>
    </form>
  );
}
