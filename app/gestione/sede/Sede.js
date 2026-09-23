'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import Immagine from '../Immagine';

const VUOTO = {
  nome: '', tipologia: '', via: '', civico: '', cap: '', citta: '', provincia: '', regione: '', nazione: 'IT',
  telefono: '', email: '', sito_web: '', facebook: '', instagram: '', logo_url: null, visibile: true, principale: false,
};

export default function Sede({ palestraId, sedi, palestra }) {
  const router = useRouter();
  const [apri, setApri] = useState(null);
  const [f, setF] = useState(VUOTO);
  const [errore, setErrore] = useState('');
  const [avviso, setAvviso] = useState('');
  const [invio, setInvio] = useState(false);
  const [gen, setGen] = useState({
    nome: palestra.nome || '', email: palestra.email || '', telefono: palestra.telefono || '',
    base_url: palestra.base_url || '', email_mittente: palestra.email_mittente || '',
    google_review_url: palestra.google_review_url || '',
  });

  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const setG = (k) => (e) => setGen({ ...gen, [k]: e.target.value });

  function modifica(s) {
    setF({ ...VUOTO, ...Object.fromEntries(Object.keys(VUOTO).map((k) => [k, s[k] ?? VUOTO[k]])) });
    setApri(s.id); setErrore('');
  }

  async function salvaSede(e) {
    e.preventDefault();
    if (!f.nome.trim()) { setErrore('Serve il nome della sede.'); return; }
    setInvio(true); setErrore('');
    const dati = { ...f, nome: f.nome.trim() };
    const db = supabaseBrowser();
    const { error } = apri === 'nuovo'
      ? await db.from('sedi').insert({ ...dati, palestra_id: palestraId })
      : await db.from('sedi').update(dati).eq('id', apri);
    setInvio(false);
    if (error) { setErrore('Salvataggio non riuscito.'); return; }
    setApri(null); router.refresh();
  }

  async function salvaGenerali(e) {
    e.preventDefault();
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().from('palestre').update({
      nome: gen.nome, email: gen.email || null, telefono: gen.telefono || null,
      base_url: gen.base_url || null, email_mittente: gen.email_mittente || null,
      google_review_url: gen.google_review_url || null,
    }).eq('id', palestraId);
    setInvio(false);
    if (error) { setErrore('Salvataggio non riuscito.'); return; }
    setAvviso('Dati salvati.'); setTimeout(() => setAvviso(''), 2500);
    router.refresh();
  }

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Struttura</div>
        <h1>Sede e contatti</h1>
        <p>I dati che finiscono sul sito, nelle email e sulle fatture.</p>
      </div>

      {errore && <div className="errore" role="alert">{errore}</div>}
      {avviso && <div className="errore" style={{ background: 'var(--ok-tenue)', color: 'var(--ok)' }}>{avviso}</div>}

      <form onSubmit={salvaGenerali} className="scheda" style={{ marginBottom: 24 }}>
        <h2 style={{ marginTop: 0 }}>Dati della scuola</h2>
        <div className="riga-2">
          <div className="campo"><label htmlFor="gn">Nome</label><input id="gn" value={gen.nome} onChange={setG('nome')} /></div>
          <div className="campo"><label htmlFor="gt">Telefono</label><input id="gt" value={gen.telefono} onChange={setG('telefono')} /></div>
        </div>
        <div className="riga-2">
          <div className="campo"><label htmlFor="ge">Email</label><input id="ge" type="email" value={gen.email} onChange={setG('email')} /></div>
          <div className="campo">
            <label htmlFor="gm">Mittente delle email</label>
            <input id="gm" value={gen.email_mittente} onChange={setG('email_mittente')} placeholder="Ritmo Metropolitano <info@...>" />
          </div>
        </div>
        <div className="campo">
          <label htmlFor="gu">Indirizzo del sito</label>
          <input id="gu" value={gen.base_url} onChange={setG('base_url')} placeholder="https://..." />
          <span className="piccolo muto">Serve per i link dentro le email: senza, arrivano monchi.</span>
        </div>
        <div className="campo">
          <label htmlFor="gr">Link recensioni Google</label>
          <input id="gr" value={gen.google_review_url} onChange={setG('google_review_url')} />
        </div>
        <button className="btn btn-primario" disabled={invio}>Salva i dati della scuola</button>
      </form>

      <h2 className="sezione">Sedi</h2>

      {apri ? (
        <form onSubmit={salvaSede} className="compare">
          <h3>{apri === 'nuovo' ? 'Nuova sede' : 'Modifica sede'}</h3>
          <Immagine url={f.logo_url} cartella="sedi" etichetta="Logo o foto della sede"
                    onChange={(url) => setF({ ...f, logo_url: url })} />
          <div className="riga-2">
            <div className="campo"><label htmlFor="n">Nome sede</label><input id="n" value={f.nome} onChange={set('nome')} /></div>
            <div className="campo">
              <label htmlFor="ti">Tipologia</label>
              <input id="ti" value={f.tipologia} onChange={set('tipologia')} placeholder="Scuola di danza, centro acrobatico…" />
            </div>
          </div>
          <div className="riga-2">
            <div className="campo"><label htmlFor="vi">Via</label><input id="vi" value={f.via} onChange={set('via')} /></div>
            <div className="campo"><label htmlFor="ci">Civico</label><input id="ci" value={f.civico} onChange={set('civico')} /></div>
          </div>
          <div className="riga-2">
            <div className="campo"><label htmlFor="co">Comune</label><input id="co" value={f.citta} onChange={set('citta')} /></div>
            <div className="campo"><label htmlFor="ca">CAP</label><input id="ca" value={f.cap} onChange={set('cap')} /></div>
          </div>
          <div className="riga-2">
            <div className="campo"><label htmlFor="pr">Provincia</label><input id="pr" value={f.provincia} onChange={set('provincia')} /></div>
            <div className="campo"><label htmlFor="re">Regione</label><input id="re" value={f.regione} onChange={set('regione')} /></div>
          </div>
          <div className="riga-2">
            <div className="campo"><label htmlFor="te">Telefono</label><input id="te" value={f.telefono} onChange={set('telefono')} /></div>
            <div className="campo"><label htmlFor="em">Email</label><input id="em" type="email" value={f.email} onChange={set('email')} /></div>
          </div>
          <div className="campo"><label htmlFor="si">Sito web</label><input id="si" value={f.sito_web} onChange={set('sito_web')} /></div>
          <div className="riga-2">
            <div className="campo"><label htmlFor="fb">Facebook</label><input id="fb" value={f.facebook} onChange={set('facebook')} /></div>
            <div className="campo"><label htmlFor="ig">Instagram</label><input id="ig" value={f.instagram} onChange={set('instagram')} /></div>
          </div>
          <label className="spunta"><input type="checkbox" checked={f.principale} onChange={set('principale')} /><span>Sede principale</span></label>
          <label className="spunta"><input type="checkbox" checked={f.visibile} onChange={set('visibile')} /><span>Visibile sul sito</span></label>
          <div className="azioni">
            <button className="btn btn-primario" disabled={invio}>Salva la sede</button>
            <button type="button" className="btn" onClick={() => setApri(null)}>Annulla</button>
          </div>
        </form>
      ) : (
        <button className="btn" onClick={() => { setF(VUOTO); setApri('nuovo'); }}>Aggiungi una sede</button>
      )}

      <div style={{ marginTop: 18 }}>
        {sedi.map((s) => (
          <div key={s.id} className="scheda-corso">
            <span className="banda" style={{ background: s.principale ? 'var(--rosso)' : 'var(--nero)' }} />
            <span className="centro" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {s.logo_url
                ? <img src={s.logo_url} alt="" className="miniatura" />
                : <span className="miniatura segnaposto">{s.nome.slice(0, 2).toUpperCase()}</span>}
              <span style={{ minWidth: 0 }}>
                <span className="titolo" style={{ display: 'block' }}>{s.nome}</span>
                <span className="riga">
                  {[s.via && `${s.via} ${s.civico || ''}`.trim(), s.citta, s.provincia].filter(Boolean).join(', ') || 'indirizzo da completare'}
                </span>
                <span className="riga">{[s.telefono, s.email].filter(Boolean).join(' · ')}</span>
                <button className="link-btn piccolo" style={{ marginTop: 6 }} onClick={() => modifica(s)}>Modifica</button>
              </span>
            </span>
            <span className="destra" style={{ display: 'grid', gap: 4, justifyItems: 'end' }}>
              {s.principale && <span className="tag tag-rosso">principale</span>}
              {!s.visibile && <span className="tag tag-neutro">nascosta</span>}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
