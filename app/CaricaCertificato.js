'use client';
import { useRef, useState } from 'react';

// Caricamento del certificato: si tocca o si trascina il file (niente
// bottone di sistema) e si scrive la data di scadenza, che serve agli avvisi.
export default function CaricaCertificato({ token, nome, onFatto }) {
  const input = useRef(null);
  const [file, setFile] = useState(null);
  const [scadenza, setScadenza] = useState('');
  const [sopra, setSopra] = useState(false);
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState('');
  const oggi = new Date().toISOString().slice(0, 10);

  async function invia(e) {
    e.preventDefault();
    if (!file) { setErrore('Scegli la foto o il PDF del certificato.'); return; }
    if (!scadenza) { setErrore('Scrivi la data di scadenza che trovi sul certificato.'); return; }
    if (scadenza < oggi) { setErrore('Questo certificato è già scaduto: serve quello nuovo.'); return; }
    setInvio(true); setErrore('');
    const form = new FormData();
    form.append('token', token);
    form.append('file', file);
    form.append('scadenza', scadenza);
    const r = await fetch('/api/certificato', { method: 'POST', body: form });
    const d = await r.json().catch(() => ({}));
    setInvio(false);
    if (!r.ok) { setErrore(d.errore || 'Caricamento non riuscito.'); return; }
    onFatto?.();
  }

  return (
    <form onSubmit={invia} className="carica-certificato">
      {errore && <div className="errore" role="alert">{errore}</div>}
      <div className={`zona-foto${sopra ? ' sopra' : ''}`} role="button" tabIndex={0}
           onDragOver={(e) => { e.preventDefault(); setSopra(true); }}
           onDragLeave={() => setSopra(false)}
           onDrop={(e) => { e.preventDefault(); setSopra(false); setFile(e.dataTransfer.files?.[0] || null); setErrore(''); }}
           onClick={() => input.current?.click()}
           onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') input.current?.click(); }}>
        <span className="miniatura segnaposto" aria-hidden="true">{file ? '✓' : '📄'}</span>
        <span className="zona-testo">
          <strong>{file ? file.name : `Certificato di ${nome}`}</strong>
          <span className="piccolo muto">{file ? 'Tocca per cambiarlo' : 'Tocca per fare una foto o scegliere il file · foto o PDF, fino a 8 MB'}</span>
        </span>
        <input ref={input} type="file" accept="image/*,application/pdf" hidden
               onChange={(e) => { setFile(e.target.files?.[0] || null); setErrore(''); }} />
      </div>
      <div className="campo" style={{ marginTop: 10 }}>
        <label htmlFor={`scad-${token}`}>Data di scadenza scritta sul certificato</label>
        <input id={`scad-${token}`} type="date" min={oggi} value={scadenza} onChange={(e) => { setScadenza(e.target.value); setErrore(''); }} />
        <span className="piccolo muto">Ti avvisiamo un mese prima che scada. La segreteria la controlla sul documento.</span>
      </div>
      <button className="btn btn-primario btn-pieno" disabled={invio}>{invio ? 'Invio…' : 'Invia il certificato'}</button>
    </form>
  );
}
