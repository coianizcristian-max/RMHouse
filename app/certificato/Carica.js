'use client';
import { useState } from 'react';

export default function Carica({ token }) {
  const [file, setFile] = useState(null);
  const [stato, setStato] = useState('');
  const [errore, setErrore] = useState('');

  async function invia(e) {
    e.preventDefault();
    if (!file) { setErrore('Scegli la foto del certificato.'); return; }
    setStato('invio'); setErrore('');
    const form = new FormData();
    form.append('token', token);
    form.append('file', file);
    const r = await fetch('/api/certificato', { method: 'POST', body: form });
    const d = await r.json();
    if (!r.ok) { setErrore(d.errore); setStato(''); return; }
    setStato('fatto');
  }

  if (stato === 'fatto') {
    return (
      <>
        <h1>Certificato ricevuto</h1>
        <p>La segreteria lo controlla e registra la scadenza. Ti avviseremo quando starà per scadere.</p>
      </>
    );
  }

  return (
    <form onSubmit={invia}>
      {errore && <div className="errore" role="alert">{errore}</div>}
      <div className="campo">
        <label htmlFor="file">Foto o PDF del certificato</label>
        <input id="file" type="file" accept="image/*,application/pdf" capture="environment"
               onChange={(e) => { setFile(e.target.files?.[0] || null); setErrore(''); }} />
        <span className="piccolo muto">Controlla che la data di scadenza si legga bene. Massimo 8 MB.</span>
      </div>
      <button className="btn btn-primario btn-pieno" disabled={stato === 'invio'}>
        {stato === 'invio' ? 'Carico…' : 'Invia il certificato'}
      </button>
    </form>
  );
}
