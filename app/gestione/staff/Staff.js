'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import Immagine from '../Immagine';

const COLORI = ['#f40000', '#000000', '#b3001b', '#8a0303', '#d64545', '#5c5c5c', '#2b2b2b', '#7a7a7a'];
const RUOLI = { insegnante: 'Insegnante', segreteria: 'Segreteria', admin: 'Amministratore' };
const VUOTO = {
  nome: '', cognome: '', specialita: '', ruolo: 'insegnante', email: '', telefono: '',
  bio: '', foto_url: null, colore: '#f40000', visibilita: 'pubblico',
  compenso_ora_cent: '', collaboratore: false, attivo: true,
};

export default function Staff({ palestraId, persone, orari, archiviati }) {
  const router = useRouter();
  const [apri, setApri] = useState(null);
  const [f, setF] = useState(VUOTO);
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const [copiato, setCopiato] = useState(null);

  // Indirizzo personale da abbonare su Google Calendar o iPhone
  async function copiaCalendario(p) {
    const url = `${window.location.origin}/api/calendario/${p.token}`;
    try { await navigator.clipboard.writeText(url); } catch { prompt('Copia questo indirizzo:', url); }
    setCopiato(p.id);
    setTimeout(() => setCopiato(null), 2500);
  }

  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const corsiDi = (id) => [...new Set(orari.filter((o) => o.insegnante_id === id).map((o) => o.corsi?.nome).filter(Boolean))];

  function modifica(p) {
    setF({
      nome: p.nome, cognome: p.cognome || '', specialita: p.specialita || '', ruolo: p.ruolo,
      email: p.email || '', telefono: p.telefono || '', bio: p.bio || '',
      foto_url: p.foto_url, colore: p.colore || '#f40000', visibilita: p.visibilita || 'pubblico',
      compenso_ora_cent: p.compenso_ora_cent ? (p.compenso_ora_cent / 100).toString() : '',
      collaboratore: p.collaboratore, attivo: p.attivo,
    });
    setApri(p.id); setErrore('');
  }

  async function salva(e) {
    e.preventDefault();
    if (!f.nome.trim()) { setErrore('Serve almeno il nome.'); return; }
    setInvio(true); setErrore('');
    const dati = {
      nome: f.nome.trim(), cognome: f.cognome || null, specialita: f.specialita || null, ruolo: f.ruolo,
      email: f.email || null, telefono: f.telefono || null, bio: f.bio || null,
      foto_url: f.foto_url, colore: f.colore, visibilita: f.visibilita,
      compenso_ora_cent: f.compenso_ora_cent ? Math.round(parseFloat(f.compenso_ora_cent.replace(',', '.')) * 100) : null,
      collaboratore: f.collaboratore, attivo: f.attivo,
    };
    const db = supabaseBrowser();
    const { error } = apri === 'nuovo'
      ? await db.from('staff').insert({ ...dati, palestra_id: palestraId })
      : await db.from('staff').update(dati).eq('id', apri);
    setInvio(false);
    if (error) { setErrore('Salvataggio non riuscito.'); return; }
    setApri(null); router.refresh();
  }

  async function archivia(p, valore) {
    await supabaseBrowser().from('staff').update({ archiviato: valore }).eq('id', p.id);
    router.refresh();
  }

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Struttura</div>
        <h1>Staff</h1>
        <p>Insegnanti e segreteria: foto, specialità e colore con cui appaiono in calendario.</p>
      </div>

      {errore && <div className="errore" role="alert">{errore}</div>}

      <div className="filtri">
        <Link href="/gestione/staff" aria-current={!archiviati ? 'true' : undefined}>In forza</Link>
        <Link href="/gestione/staff?archiviati=1" aria-current={archiviati ? 'true' : undefined}>Archiviati</Link>
      </div>

      {apri ? (
        <form onSubmit={salva} className="compare">
          <h2>{apri === 'nuovo' ? 'Nuova persona' : 'Modifica scheda'}</h2>
          <Immagine url={f.foto_url} cartella="staff" etichetta="Foto" tondo
                    onChange={(url) => setF({ ...f, foto_url: url })} />
          <div className="riga-2">
            <div className="campo"><label htmlFor="n">Nome</label><input id="n" value={f.nome} onChange={set('nome')} /></div>
            <div className="campo"><label htmlFor="c">Cognome</label><input id="c" value={f.cognome} onChange={set('cognome')} /></div>
          </div>
          <div className="campo">
            <label htmlFor="sp">Specialità</label>
            <input id="sp" value={f.specialita} onChange={set('specialita')} placeholder="Es. Aerea e acrobatica, Segreteria" />
          </div>
          <div className="riga-2">
            <div className="campo">
              <label htmlFor="r">Ruolo</label>
              <select id="r" value={f.ruolo} onChange={set('ruolo')}>
                {Object.entries(RUOLI).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="campo">
              <label htmlFor="co">Compenso orario (€)</label>
              <input id="co" inputMode="decimal" value={f.compenso_ora_cent} onChange={set('compenso_ora_cent')} />
            </div>
          </div>
          <div className="campo">
            <label>Colore in calendario</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {COLORI.map((c) => (
                <button type="button" key={c} onClick={() => setF({ ...f, colore: c })} aria-label={`Colore ${c}`}
                        style={{ width: 34, height: 34, borderRadius: 8, background: c, cursor: 'pointer',
                                 border: f.colore === c ? '3px solid var(--nero)' : '1px solid var(--linea)' }} />
              ))}
            </div>
          </div>
          <div className="riga-2">
            <div className="campo"><label htmlFor="e">Email</label><input id="e" type="email" value={f.email} onChange={set('email')} /></div>
            <div className="campo"><label htmlFor="t">Telefono</label><input id="t" type="tel" value={f.telefono} onChange={set('telefono')} /></div>
          </div>
          <div className="campo">
            <label htmlFor="b">Presentazione</label>
            <textarea id="b" value={f.bio} onChange={set('bio')} placeholder="Due righe per il sito e per i clienti" />
          </div>
          <div className="campo">
            <label htmlFor="v">Visibilità sul sito</label>
            <select id="v" value={f.visibilita} onChange={set('visibilita')}>
              <option value="pubblico">Pubblico</option>
              <option value="privato">Solo per gli iscritti</option>
              <option value="nascosto">Nascosto</option>
            </select>
          </div>
          <label className="spunta"><input type="checkbox" checked={f.collaboratore} onChange={set('collaboratore')} /><span>Collaboratore esterno</span></label>
          <label className="spunta"><input type="checkbox" checked={f.attivo} onChange={set('attivo')} /><span>Attivo</span></label>
          <div className="azioni">
            <button className="btn btn-primario" disabled={invio}>Salva</button>
            <button type="button" className="btn" onClick={() => setApri(null)}>Annulla</button>
          </div>
        </form>
      ) : (
        <button className="btn btn-primario" onClick={() => { setF(VUOTO); setApri('nuovo'); }}>Aggiungi persona</button>
      )}

      {persone.length === 0 && !apri && (
        <div className="vuoto" style={{ marginTop: 16 }}>{archiviati ? 'Nessuno in archivio.' : 'Ancora nessuno.'}</div>
      )}

      <div style={{ marginTop: 20 }}>
        {persone.map((p) => (
          <div key={p.id} className="scheda-corso">
            <span className="banda" style={{ background: p.colore || 'var(--rosso)' }} />
            <span className="centro" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {p.foto_url
                ? <img src={p.foto_url} alt="" className="miniatura" />
                : <span className="miniatura segnaposto">{(p.nome[0] || '') + (p.cognome?.[0] || '')}</span>}
              <span style={{ minWidth: 0 }}>
                <span className="titolo" style={{ display: 'block' }}>{p.nome} {p.cognome}</span>
                <span className="riga" style={{ display: 'block' }}>
                  {[RUOLI[p.ruolo], p.specialita, p.collaboratore && 'collaboratore'].filter(Boolean).join(' · ')}
                </span>
                {corsiDi(p.id).length > 0 && (
                  <span className="riga" style={{ display: 'block' }}>{corsiDi(p.id).slice(0, 3).join(', ')}{corsiDi(p.id).length > 3 ? '…' : ''}</span>
                )}
                {(!p.attivo || p.visibilita !== 'pubblico' || !p.user_id) && (
                  <span className="segni-staff">
                    {!p.attivo && <span className="tag tag-neutro">non attivo</span>}
                    {p.visibilita !== 'pubblico' && <span className="tag tag-neutro">{p.visibilita}</span>}
                    {!p.user_id && <span className="tag tag-attenzione">senza accesso</span>}
                  </span>
                )}
                <span className="azioni-riga">
                  <button className="link-btn piccolo" onClick={() => modifica(p)}>Modifica</button>
                  <button className="link-btn piccolo" onClick={() => copiaCalendario(p)}>
                    {copiato === p.id ? 'Link copiato' : 'Calendario'}
                  </button>
                  <button className="link-btn piccolo" onClick={() => archivia(p, !archiviati)}>
                    {archiviati ? 'Riporta in forza' : 'Archivia'}
                  </button>
                </span>
              </span>
            </span>
          </div>
        ))}
      </div>

      <div className="scheda" style={{ marginTop: 22 }}>
        <strong style={{ color: 'var(--nero)' }}>Calendario sul telefono</strong>
        <p className="piccolo muto" style={{ marginTop: 4, marginBottom: 0 }}>
          Il pulsante "Calendario" copia l'indirizzo personale dell'insegnante. Lui lo incolla una volta sola in
          Google Calendar (Altri calendari → Da URL) oppure su iPhone (Impostazioni → Calendario → Account →
          Aggiungi account → Altro → Aggiungi calendario con abbonamento): da quel momento le sue lezioni
          compaiono e si aggiornano da sole, anche quando sposti un orario.
        </p>
      </div>

      <p className="piccolo muto" style={{ marginTop: 18 }}>
        Per far accedere una persona all'app serve anche creare il suo utente in Supabase
        (Authentication → Users) e collegarlo a questa scheda.
      </p>
    </>
  );
}
