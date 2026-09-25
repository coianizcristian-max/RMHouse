'use client';
import { useState } from 'react';
import { FUNZIONI } from '@/lib/menu';
import { useSalva } from '../Salva';

export default function Funzioni({ palestra }) {
  const { salva, stato } = useSalva(palestra.id);
  const [f, setF] = useState(palestra.funzioni || {});

  async function cambia(k) {
    const nuovo = { ...f, [k]: f[k] === false };
    setF(nuovo);
    await salva({ funzioni: nuovo });
  }

  return (
    <div className="interruttori">
      {FUNZIONI.map(([k, nome, descr]) => (
        <label key={k} className="interruttore">
          <span className="int-testo"><strong>{nome}</strong><span className="piccolo muto">{descr}</span></span>
          <input type="checkbox" role="switch" checked={f[k] !== false} onChange={() => cambia(k)} />
        </label>
      ))}
      {stato === 'fatto' && <p className="piccolo" style={{ color: 'var(--ok)' }}>Salvato: il menù si aggiorna subito.</p>}
      {stato === 'errore' && <p className="piccolo" style={{ color: 'var(--rosso-scuro)' }}>Salvataggio non riuscito.</p>}
    </div>
  );
}
