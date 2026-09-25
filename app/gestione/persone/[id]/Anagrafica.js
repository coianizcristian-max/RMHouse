'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { dataBreve } from '@/lib/formato';
import Immagine from '../../Immagine';

export default function Anagrafica({ allievo, linkCertificato }) {
  const router = useRouter();
  const [apri, setApri] = useState(false);
  const [copiato, setCopiato] = useState(false);
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const [f, setF] = useState({
    foto_url: allievo.foto_url || null,
    nome: allievo.nome, cognome: allievo.cognome || '', data_nascita: allievo.data_nascita || '',
    certificato_scadenza: allievo.certificato_scadenza || '', note: allievo.note || '',
    acc_nome: allievo.account.nome, acc_cognome: allievo.account.cognome || '',
    email: allievo.account.email || '', telefono: allievo.account.telefono || '',
    codice_fiscale: allievo.account.codice_fiscale || '',
    cf_allievo: allievo.codice_fiscale || '', tessera: allievo.tessera || '',
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function salva(e) {
    e.preventDefault();
    setInvio(true); setErrore('');
    const db = supabaseBrowser();
    const [a, b] = await Promise.all([
      db.from('allievi').update({
        foto_url: f.foto_url,
        nome: f.nome.trim(), cognome: f.cognome.trim(), data_nascita: f.data_nascita || null,
        certificato_scadenza: f.certificato_scadenza || null, note: f.note || null,
        codice_fiscale: f.cf_allievo.trim().toUpperCase() || null, tessera: f.tessera.trim() || null,
      }).eq('id', allievo.id),
      db.from('account').update({
        nome: f.acc_nome.trim(), cognome: f.acc_cognome.trim(),
        email: f.email.trim().toLowerCase() || null, telefono: f.telefono || null,
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
    const a = allievo.account;
    return (
      <div className="pannello">
        <div className="pannello-testa">
          <h2>Dati</h2>
          <button className="btn btn-piccolo" onClick={() => setApri(true)}>Modifica</button>
        </div>
        {errore && <div className="errore">{errore}</div>}
        <dl className="dati">
          <dt>Chi paga</dt>
          <dd>{allievo.is_titolare ? 'la persona stessa' : `${a.nome} ${a.cognome || ''}`.trim()}</dd>
          <dt>Telefono</dt>
          <dd>{a.telefono ? <a href={`tel:${a.telefono}`}>{a.telefono}</a> : <span className="muto">—</span>}</dd>
          <dt>Email</dt>
          <dd>{a.email ? <a href={`mailto:${a.email}`}>{a.email}</a> : <span style={{ color: 'var(--rosso-scuro)' }}>nessuna: non riceve messaggi</span>}</dd>
          {allievo.codice_fiscale && <><dt>Codice fiscale</dt><dd>{allievo.codice_fiscale}</dd></>}
          {a.codice_fiscale && a.codice_fiscale !== allievo.codice_fiscale && <><dt>CF di chi paga</dt><dd>{a.codice_fiscale}</dd></>}
          {allievo.tessera && <><dt>Tessera</dt><dd>{allievo.tessera}</dd></>}
          {allievo.luogo_nascita && <><dt>Nato a</dt><dd>{allievo.luogo_nascita}</dd></>}
          <dt>Certificato</dt>
          <dd>
            {allievo.certificato_scadenza
              ? <span style={new Date(allievo.certificato_scadenza) < new Date() ? { color: 'var(--rosso-scuro)', fontWeight: 700 } : undefined}>
                  {new Date(allievo.certificato_scadenza) < new Date() ? 'scaduto il ' : 'fino al '}{dataBreve(allievo.certificato_scadenza)}
                </span>
              : <span style={{ color: 'var(--rosso-scuro)', fontWeight: 700 }}>mancante</span>}
            {' · '}<button className="link-btn piccolo" onClick={copia}>{copiato ? 'link copiato' : 'copia link per caricarlo'}</button>
          </dd>
          {allievo.note && <><dt>Note</dt><dd style={{ whiteSpace: 'pre-line' }}>{allievo.note}</dd></>}
        </dl>
      </div>
    );
  }

  return (
    <form onSubmit={salva} className="pannello">
      {errore && <div className="errore" role="alert">{errore}</div>}
      <h3>Chi frequenta</h3>
      <Immagine url={f.foto_url} cartella="allievi" etichetta="Foto" tondo
                onChange={(url) => setF({ ...f, foto_url: url })} />
      <div className="riga-2">
        <div className="campo"><label htmlFor="n">Nome</label><input id="n" value={f.nome} onChange={set('nome')} /></div>
        <div className="campo"><label htmlFor="c">Cognome</label><input id="c" value={f.cognome} onChange={set('cognome')} /></div>
      </div>
      <div className="riga-2">
        <div className="campo"><label htmlFor="dn">Data di nascita</label><input id="dn" type="date" value={f.data_nascita} onChange={set('data_nascita')} /></div>
        <div className="campo"><label htmlFor="cs">Scadenza certificato</label><input id="cs" type="date" value={f.certificato_scadenza} onChange={set('certificato_scadenza')} /></div>
      </div>
      <div className="riga-2">
        <div className="campo"><label htmlFor="cfa">Codice fiscale</label><input id="cfa" value={f.cf_allievo} onChange={set('cf_allievo')} /></div>
        <div className="campo"><label htmlFor="tes">Tessera</label><input id="tes" value={f.tessera} onChange={set('tessera')} /></div>
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
        <span className="piccolo muto">Di chi paga: va sulle ricevute.</span>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-primario" disabled={invio}>{invio ? 'Salvo…' : 'Salva'}</button>
        <button type="button" className="btn" onClick={() => setApri(false)}>Annulla</button>
      </div>
    </form>
  );
}
