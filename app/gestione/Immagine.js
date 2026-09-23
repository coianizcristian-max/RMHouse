'use client';
import { useState } from 'react';

// Selettore di immagine con anteprima: carica il file e restituisce l'indirizzo
export default function Immagine({ url, onChange, cartella = 'varie', etichetta = 'Immagine', tondo }) {
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState('');

  async function carica(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setInvio(true); setErrore('');
    const form = new FormData();
    form.append('file', file);
    form.append('cartella', cartella);
    const r = await fetch('/api/media', { method: 'POST', body: form });
    const d = await r.json();
    setInvio(false);
    if (!r.ok) { setErrore(d.errore); return; }
    onChange(d.url);
  }

  return (
    <div className="campo">
      <label>{etichetta}</label>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {url
          ? <img src={url} alt="" className={tondo ? 'miniatura' : 'miniatura-grande'} />
          : <div className={`${tondo ? 'miniatura' : 'miniatura-grande'} segnaposto`}>RM</div>}
        <div style={{ display: 'grid', gap: 6 }}>
          <input type="file" accept="image/*" onChange={carica} disabled={invio} />
          {url && <button type="button" className="link-btn piccolo" onClick={() => onChange(null)}>Togli l'immagine</button>}
        </div>
      </div>
      {invio && <span className="piccolo muto">Carico…</span>}
      {errore && <span className="piccolo" style={{ color: 'var(--rosso-scuro)' }}>{errore}</span>}
    </div>
  );
}
