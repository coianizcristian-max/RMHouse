'use client';
import { useRef, useState } from 'react';

// Selettore di immagine con anteprima: niente bottone di sistema,
// si trascina o si tocca l'area e parte il caricamento.
export default function Immagine({ url, onChange, cartella = 'varie', etichetta = 'Immagine', tondo }) {
  const input = useRef(null);
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState('');
  const [sopra, setSopra] = useState(false);

  async function carica(file) {
    if (!file) return;
    setInvio(true); setErrore('');
    const form = new FormData();
    form.append('file', file);
    form.append('cartella', cartella);
    const r = await fetch('/api/media', { method: 'POST', body: form });
    const d = await r.json().catch(() => ({}));
    setInvio(false);
    if (!r.ok) { setErrore(d.errore || 'Caricamento non riuscito.'); return; }
    onChange(d.url);
  }

  return (
    <div className="campo">
      <label>{etichetta}</label>

      <div className={`zona-foto${sopra ? ' sopra' : ''}`}
           onDragOver={(e) => { e.preventDefault(); setSopra(true); }}
           onDragLeave={() => setSopra(false)}
           onDrop={(e) => { e.preventDefault(); setSopra(false); carica(e.dataTransfer.files?.[0]); }}
           onClick={() => input.current?.click()}
           role="button" tabIndex={0}
           onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') input.current?.click(); }}>
        {url
          ? <img src={url} alt="" className={tondo ? 'miniatura' : 'miniatura-grande'} />
          : <span className={`${tondo ? 'miniatura' : 'miniatura-grande'} segnaposto`}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8"
                   strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <circle cx="9" cy="10" r="1.6" />
                <path d="m4 17 5-4 4 3 3-2 4 3" />
              </svg>
            </span>}

        <span className="zona-testo">
          <strong>{invio ? 'Carico…' : url ? 'Cambia immagine' : 'Aggiungi un\'immagine'}</strong>
          <span className="piccolo muto">Tocca oppure trascina qui il file · JPG, PNG o PDF, fino a 6 MB</span>
        </span>

        {url && (
          <button type="button" className="link-btn piccolo pericolo"
                  onClick={(e) => { e.stopPropagation(); onChange(null); }}>Togli</button>
        )}
      </div>

      <input ref={input} type="file" accept="image/*" hidden disabled={invio}
             onChange={(e) => carica(e.target.files?.[0])} />

      {errore && <span className="piccolo" style={{ color: 'var(--rosso-scuro)' }}>{errore}</span>}
    </div>
  );
}
