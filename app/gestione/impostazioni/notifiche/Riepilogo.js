'use client';
import { useState } from 'react';
import { useSalva, BottoneSalva } from '../Salva';

// Il riepilogo del lunedì: attivo o no, e a chi arriva
export default function Riepilogo({ palestra }) {
  const { salva, stato } = useSalva(palestra.id);
  const r = palestra.riepilogo || {};
  const [attivo, setAttivo] = useState(!!r.attivo);
  const [dest, setDest] = useState((r.destinatari || []).join(', '));

  function invia(e) {
    e.preventDefault();
    const destinatari = dest.split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter((x) => x.includes('@'));
    salva({ riepilogo: { ...r, attivo, destinatari } });
  }

  return (
    <form className="pannello" onSubmit={invia}>
      <h2>Riepilogo del lunedì</h2>
      <p className="piccolo muto" style={{ marginTop: -4 }}>
        Ogni lunedì mattina un'email con iscritti, incassi della settimana, lezioni poco piene, rinnovi in arrivo,
        chi non ha rinnovato, certificati, giorni da assegnare e quote.
      </p>
      <label className="interruttore">
        <span className="int-testo"><strong>Manda il riepilogo</strong></span>
        <input type="checkbox" role="switch" checked={attivo} onChange={(e) => setAttivo(e.target.checked)} />
      </label>
      <div className="campo" style={{ marginTop: 10 }}>
        <label htmlFor="dest">A chi</label>
        <input id="dest" value={dest} onChange={(e) => setDest(e.target.value)} placeholder="erika@…, segreteria@…" />
        <span className="piccolo muto">Più indirizzi separati da virgola.</span>
      </div>
      <BottoneSalva stato={stato} />
    </form>
  );
}
