'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { dataBreve } from '@/lib/formato';

export default function Anagrafica({ allievo, linkCertificato }) {
  const router = useRouter();
  const [apri, setApri] = useState(false);
  const [copiato, setCopiato] = useState(false);
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const [f, setF] = useState({
    nome: allievo.nome, cognome: allievo.cognome, data_nascita: allievo.data_nascita,
    certificato_scadenza: allievo.certificato_scadenza || '', note: allievo.note || '',
    acc_nome: allievo.account.nome, acc_cognome: allievo.account.cognome,
    email: allievo.account.email, telefono: allievo.account.telefono || '',
    codice_fiscale: allievo.account.codice_fiscale || '',
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function salva(e) {
    e.preventDefault();
    setInvio(true); setErrore('');
    const db = supabaseBrowser();
    const [a, b] = await Promise.all([
      db.from('allievi').update({
        nome: f.nome.trim(), cognome: f.cognome.trim(), data_nascita: f.data_nascita,
        certificato_scadenza: f.certificato_scadenza || null, note: f.note || null,
      }).eq('id', allievo.id),
      db.from('account').update({
        nome: f.acc_nome.trim(), cognome: f.acc_cognome.trim(),
        email: f.email.trim().toLowerCase(), telefono: f.telefono || null,
        codice_fiscale: f.codice_fiscale || null,
      }).eq('id', allievo.account.id),
    ]);
    setInvio(false);
    if (a.error || b.error) { setErrore('Salvataggio non riuscito. Controlla i dati e riprova.'); return; }
    setApri(false); router.refresh();
  }

  async function copia() {
    try {
      await navigator.clipboard.writeText(linkCertificato);
      setCopiato(true); setTimeout(() => setCopiato(false), 2500);
    } catch { setErrore('Copia non riuscita: seleziona il link a mano.'); }
  }

  if (!apri) {
    return (
      <div style={{ background: 'var(--carta)', borderRadius: 12, padding: 16, marginTop: 16 }}>
        {errore && <div className="errore">{errore}</div>}
        <div className="piccolo">
          <strong>Chi paga:</strong> {allievo.account.nome} {allievo.account.cognome}<br />
          <a href={`tel:${allievo.account.telefono}`}>{allievo.account.telefono}</a> ·{' '}
          <a href={`mailto:${allievo.account.email}`}>{allievo.account.email}</a><br />
          <strong>Certificato:</strong>{' '}
          {allievo.certificato_scadenza
            ? <>scade il {dataBreve(allievo.certificato_scadenza)}</>
            : <span style={{ color: 'var(--rosso-scuro)' }}>mancante</span>}
          {allievo.note && <><br /><strong>Note:</strong> {allievo.note}</>}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => setApri(true)}>Modifica dati</button>
          <button className="btn" onClick={copia}>{copiato ? 'Link copiato' : 'Copia link certificato'}</button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={salva} style={{ marginTop: 16 }}>
      {errore && <div className="errore" role="alert">{errore}</div>}
      <h3>Chi frequenta</h3>
      <div className="riga-2">
        <div className="campo"><label htmlFor="n">Nome</label><input id="n" value={f.nome} onChange={set('nome')} /></div>
        <div className="campo"><label htmlFor="c">Cognome</label><input id="c" value={f.cognome} onChange={set('cognome')} /></div>
      </div>
      <div className="riga-2">
        <div className="campo"><label htmlFor="dn">Data di nascita</label><input id="dn" type="date" value={f.data_nascita} onChange={set('data_nascita')} /></div>
        <div className="campo"><label htmlFor="cs">Scadenza certificato</label><input id="cs" type="date" value={f.certificato_scadenza} onChange={set('certificato_scadenza')} /></div>
      </div>
      <div className="campo"><label htmlFor="note">Note</label><textarea id="note" value={f.note} onChange={set('note')} /></div>

      <h3>Chi paga</h3>
      <div className="riga-2">
        <div className="campo"><label htmlFor="an">Nome</label><input id="an" value={f.acc_nome} onChange={set('acc_nome')} /></div>
        <div className="campo"><label htmlFor="ac">Cognome</label><input id="ac" value={f.acc_cognome} onChange={set('acc_cognome')} /></div>
      </div>
      <div className="riga-2">
        <div className="campo"><label htmlFor="em">Email</label><input id="em" type="email" value={f.email} onChange={set('email')} /></div>
        <div className="campo"><label htmlFor="tel">Telefono</label><input id="tel" type="tel" value={f.telefono} onChange={set('telefono')} /></div>
      </div>
      <div className="campo">
        <label htmlFor="cf">Codice fiscale</label>
        <input id="cf" value={f.codice_fiscale} onChange={set('codice_fiscale')} />
        <span className="piccolo muto">Servirà per le fatture.</span>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-primario" disabled={invio}>{invio ? 'Salvo…' : 'Salva'}</button>
        <button type="button" className="btn" onClick={() => setApri(false)}>Annulla</button>
      </div>
    </form>
  );
}
