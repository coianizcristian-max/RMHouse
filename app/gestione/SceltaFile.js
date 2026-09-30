'use client';
import { useRef, useState } from 'react';

// Scelta di un file bella da vedere: si tocca o si trascina, niente pulsante di sistema.
// onChange riceve un oggetto come quello di un <input type="file"> ({ target: { files } }).
export default function SceltaFile({ id, accept, multiple = false, disabled = false, onChange, titolo, aiuto }) {
  const input = useRef(null);
  const [sopra, setSopra] = useState(false);
  const [nomi, setNomi] = useState('');

  function passa(files) {
    if (!files?.length) return;
    setNomi(files.length === 1 ? files[0].name : `${files.length} file`);
    onChange?.({ target: { files: Array.from(files), value: '' } });
  }

  return (
    <div className={`zona-foto${sopra ? ' sopra' : ''}`} role="button" tabIndex={0} aria-disabled={disabled}
         onDragOver={(e) => { e.preventDefault(); if (!disabled) setSopra(true); }}
         onDragLeave={() => setSopra(false)}
         onDrop={(e) => { e.preventDefault(); setSopra(false); if (!disabled) passa(e.dataTransfer.files); }}
         onClick={() => !disabled && input.current?.click()}
         onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) input.current?.click(); }}>
      <span className="miniatura segnaposto" aria-hidden="true">{nomi ? '✓' : '⤓'}</span>
      <span className="zona-testo">
        <strong>{nomi || titolo}</strong>
        <span className="piccolo muto">{nomi ? 'Tocca per sceglierne un altro' : aiuto}</span>
      </span>
      <input ref={input} id={id} type="file" accept={accept} multiple={multiple} hidden disabled={disabled}
             onChange={(e) => { passa(e.target.files); e.target.value = ''; }} />
    </div>
  );
}
