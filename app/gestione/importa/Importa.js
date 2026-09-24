'use client';
import { useState } from 'react';
import { leggiCsv, leggiData, indovina } from '@/lib/csv';
import AppPalestre from './AppPalestre';

const CAMPI = [
  { k: 'nome', etichetta: 'Nome di chi frequenta', parole: ['nome', 'allievo'], obbligatorio: true },
  { k: 'cognome', etichetta: 'Cognome', parole: ['cognome'], obbligatorio: true },
  { k: 'data_nascita', etichetta: 'Data di nascita', parole: ['nascita', 'datadinascita'], obbligatorio: true },
  { k: 'email', etichetta: 'Email (di chi paga)', parole: ['email', 'mail'], obbligatorio: true },
  { k: 'telefono', etichetta: 'Telefono', parole: ['telefono', 'cellulare', 'tel'] },
  { k: 'genitore_nome', etichetta: 'Nome del genitore', parole: ['genitorenome', 'tutore', 'referente'] },
  { k: 'genitore_cognome', etichetta: 'Cognome del genitore', parole: ['genitorecognome'] },
  { k: 'codice_fiscale', etichetta: 'Codice fiscale', parole: ['codicefiscale', 'cf'] },
  { k: 'certificato_scadenza', etichetta: 'Scadenza certificato', parole: ['certificato', 'scadenzacertificato'] },
  { k: 'corso', etichetta: 'Corso', parole: ['corso', 'disciplina'] },
  { k: 'abbonamento', etichetta: 'Abbonamento', parole: ['abbonamento', 'pacchetto'] },
  { k: 'data_inizio', etichetta: 'Inizio abbonamento', parole: ['inizio', 'datainizio'] },
];

export default function Importa({ corsi, tipi, palestraId }) {
  const [fonte, setFonte] = useState('app');
  const [dati, setDati] = useState(null);      // { intestazioni, righe }
  const [mappa, setMappa] = useState({});
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const [esito, setEsito] = useState(null);

  function carica(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrore(''); setEsito(null);
    const lettore = new FileReader();
    lettore.onload = () => {
      try {
        const letto = leggiCsv(String(lettore.result));
        if (!letto.righe.length) { setErrore('Il file sembra vuoto.'); return; }
        if (letto.righe.length > 500) { setErrore('Troppe righe: dividi il file in blocchi da 500.'); return; }
        setDati(letto);
        setMappa(Object.fromEntries(CAMPI.map((c) => [c.k, indovina(letto.intestazioni, c.parole)])));
      } catch {
        setErrore('Non riesco a leggere il file: salvalo come CSV e riprova.');
      }
    };
    lettore.readAsText(file, 'utf-8');
  }

  const valore = (riga, k) => (mappa[k] ? riga[mappa[k]] || '' : '');
  const mancanti = CAMPI.filter((c) => c.obbligatorio && !mappa[c.k]).map((c) => c.etichetta);

  const anteprima = (dati?.righe || []).slice(0, 5).map((r) => ({
    nome: valore(r, 'nome'), cognome: valore(r, 'cognome'),
    nascita: leggiData(valore(r, 'data_nascita')), email: valore(r, 'email'),
    corso: valore(r, 'corso'),
  }));
  const dateStorte = (dati?.righe || []).filter((r) => valore(r, 'data_nascita') && !leggiData(valore(r, 'data_nascita'))).length;

  async function importa() {
    setInvio(true); setErrore(''); setEsito(null);
    const righe = dati.righe.map((r) => Object.fromEntries(CAMPI.map((c) => [c.k, valore(r, c.k)])));
    const risposta = await fetch('/api/importa', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ righe }),
    });
    const d = await risposta.json();
    setInvio(false);
    if (!risposta.ok) { setErrore(d.errore); return; }
    setEsito(d);
  }

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Persone</div>
        <h1>Importa da CSV</h1>
        <p>Porta dentro l'elenco che hai oggi, da APP Palestre o da qualunque altro file.</p>
      </div>

      <div className="filtri">
        {[['app', 'Da APP Palestre'], ['altro', 'Da un altro file']].map(([k, l]) => (
          <a key={k} href="#" onClick={(e) => { e.preventDefault(); setFonte(k); }}
             aria-current={fonte === k ? 'true' : undefined}>{l}</a>
        ))}
      </div>

      {fonte === 'app' ? <AppPalestre palestraId={palestraId} /> : (
      <>

      {errore && <div className="errore" role="alert">{errore}</div>}

      <div className="campo">
        <label htmlFor="file">File CSV</label>
        <input id="file" type="file" accept=".csv,text/csv" onChange={carica} />
      </div>

      {dati && !esito && (
        <>
          <h2>Abbina le colonne</h2>
          <p className="piccolo muto">Ho provato a indovinare: controlla e correggi dove serve.</p>
          {CAMPI.map((c) => (
            <div className="campo" key={c.k}>
              <label htmlFor={`m-${c.k}`}>{c.etichetta}{c.obbligatorio && ' *'}</label>
              <select id={`m-${c.k}`} value={mappa[c.k] || ''} onChange={(e) => setMappa({ ...mappa, [c.k]: e.target.value })}>
                <option value="">— non presente —</option>
                {dati.intestazioni.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          ))}

          <h2>Anteprima</h2>
          <p className="piccolo muto">{dati.righe.length} righe nel file. Prime cinque:</p>
          <div className="tabella-scorre">
            <table>
              <thead><tr><th>Nome</th><th>Nascita</th><th>Email</th><th>Corso</th></tr></thead>
              <tbody>
                {anteprima.map((r, i) => (
                  <tr key={i}>
                    <td>{r.cognome} {r.nome}</td>
                    <td style={r.nascita ? undefined : { color: 'var(--rosso-scuro)' }}>{r.nascita || 'data illeggibile'}</td>
                    <td>{r.email}</td>
                    <td>{r.corso || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {dateStorte > 0 && (
            <p className="piccolo" style={{ color: 'var(--rosso-scuro)' }}>
              {dateStorte} righe hanno una data di nascita che non riesco a leggere: verranno saltate.
            </p>
          )}
          {mancanti.length > 0 && (
            <p className="piccolo" style={{ color: 'var(--rosso-scuro)' }}>Mancano: {mancanti.join(', ')}.</p>
          )}

          <div className="azioni" style={{ marginTop: 16 }}>
            <button className="btn btn-primario" disabled={invio || mancanti.length > 0} onClick={importa}>
              {invio ? 'Importo…' : `Importa ${dati.righe.length} righe`}
            </button>
            <button className="btn" onClick={() => setDati(null)}>Annulla</button>
          </div>
        </>
      )}

      {esito && (
        <>
          <h2>Fatto</h2>
          <ul className="elenco">
            <li className="persona"><span>Persone create</span><strong>{esito.creati}</strong></li>
            <li className="persona"><span>Già presenti, aggiornate</span><strong>{esito.aggiornati}</strong></li>
            <li className="persona"><span>Iscrizioni create</span><strong>{esito.iscrizioni}</strong></li>
            <li className="persona"><span>Righe saltate</span><strong>{esito.errori.length}</strong></li>
          </ul>
          {esito.errori.length > 0 && (
            <>
              <h3>Righe saltate</h3>
              <ul className="elenco">
                {esito.errori.slice(0, 40).map((e, i) => (
                  <li key={i} className="persona">
                    <span className="piccolo">Riga {e.riga}: {e.nome}</span>
                    <span className="piccolo muto">{e.motivo}</span>
                  </li>
                ))}
              </ul>
              <p className="piccolo muto">Correggi queste righe nel file e importa solo quelle.</p>
            </>
          )}
          <button className="btn" style={{ marginTop: 16 }} onClick={() => { setDati(null); setEsito(null); }}>
            Importa un altro file
          </button>
        </>
      )}
      </>
      )}
    </>
  );
}
