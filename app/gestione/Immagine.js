'use client';
import { useRef, useState } from 'react';
import { comprimiImmagine } from '@/lib/comprimiImmagine';

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
    // foto tonde (persone, staff) più piccole; locandine e foto di sale/corsi più grandi
    const leggero = await comprimiImmagine(file, { lato: tondo ? 800 : 1600 });
    const form = new FormData();
    form.append('file', leggero);
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

      {/* Con la foto caricata: la foto grande (tonda per le persone, intera per locandine, corsi e sale),
          sotto "Cambia" e "Togli". Senza foto: l'area dove toccare o trascinare. */}
      <div className={`zona-foto${sopra ? ' sopra' : ''}${url ? ' con-foto' : ''}${tondo ? ' tonda' : ''}`}
           onDragOver={(e) => { e.preventDefault(); setSopra(true); }}
           onDragLeave={() => setSopra(false)}
           onDrop={(e) => { e.preventDefault(); setSopra(false); carica(e.dataTransfer.files?.[0]); }}
           onClick={() => input.current?.click()}
           role="button" tabIndex={0} aria-label={url ? `${etichetta}: cambia immagine` : `${etichetta}: aggiungi un'immagine`}
           onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') input.current?.click(); }}>
        {url ? (
          <>
            <img src={url} alt="" className={tondo ? 'foto-grande tonda' : 'foto-grande'} />
            <span className="zona-azioni">
              <span className="link-btn piccolo">{invio ? 'Carico…' : 'Cambia immagine'}</span>
              <button type="button" className="link-btn piccolo pericolo"
                      onClick={(e) => { e.stopPropagation(); onChange(null); }}>Togli</button>
            </span>
          </>
        ) : (
          <>
            <span className={`${tondo ? 'miniatura' : 'miniatura-grande'} segnaposto`}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8"
                   strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <circle cx="9" cy="10" r="1.6" />
                <path d="m4 17 5-4 4 3 3-2 4 3" />
              </svg>
            </span>
            <span className="zona-testo">
              <strong>{invio ? 'Carico…' : 'Aggiungi un\'immagine'}</strong>
              <span className="piccolo muto">Tocca oppure trascina qui la foto · si rimpicciolisce da sola</span>
            </span>
          </>
        )}
      </div>

      <input ref={input} type="file" accept="image/*" hidden disabled={invio}
             onChange={(e) => carica(e.target.files?.[0])} />

      {errore && <span className="piccolo" style={{ color: 'var(--rosso-scuro)' }}>{errore}</span>}
    </div>
  );
}
