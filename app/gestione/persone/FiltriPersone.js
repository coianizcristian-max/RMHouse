'use client';
import { useRouter } from 'next/navigation';
import { useRef } from 'react';

// Ricerca e filtri su una riga: tre menù a tendina con i numeri, invece di venti pulsanti
export default function FiltriPersone({ valori, stati, campanelli, etichette, consensi = [] }) {
  const router = useRouter();
  const form = useRef(null);
  const vai = (cambi) => {
    const dati = new FormData(form.current);
    const u = new URLSearchParams();
    for (const [k, v] of dati.entries()) if (v) u.set(k, v);
    Object.entries(cambi || {}).forEach(([k, v]) => (v ? u.set(k, v) : u.delete(k)));
    router.push(`/gestione/persone${u.toString() ? `?${u}` : ''}`);
  };
  const attivi = ['stato', 'campanello', 'etichetta', 'consenso', 'q'].filter((k) => valori[k]).length;
  // si cerca mentre si scrive (dopo una breve pausa): niente bisogno di premere Cerca
  const timer = useRef(null);
  const scrive = () => { clearTimeout(timer.current); timer.current = setTimeout(() => vai({ pagina: '' }), 350); };
  return (
    <form ref={form} className="filtri-persone" onSubmit={(e) => { e.preventDefault(); vai(); }}>
      <input type="search" name="q" defaultValue={valori.q} onChange={scrive} placeholder="Cerca: nome, cognome o solo le iniziali (es. mr), email, telefono" aria-label="Cerca" />
      <select name="stato" defaultValue={valori.stato} onChange={() => vai()} aria-label="Stato" className={valori.stato ? 'scelto' : ''}>
        {stati.map(([k, testo, n]) => <option key={k} value={k}>{testo}{n != null ? ` (${n})` : ''}</option>)}
      </select>
      <select name="campanello" defaultValue={valori.campanello} onChange={() => vai()} aria-label="Da sistemare" className={valori.campanello ? 'scelto' : ''}>
        <option value="">Da sistemare: tutti</option>
        {campanelli.map(([k, testo, n]) => <option key={k} value={k}>{testo} ({n})</option>)}
      </select>
      {etichette.length > 0 && (
        <select name="etichetta" defaultValue={valori.etichetta} onChange={() => vai()} aria-label="Etichetta" className={valori.etichetta ? 'scelto' : ''}>
          <option value="">Etichetta: tutte</option>
          {etichette.map(([k, testo, n]) => <option key={k} value={k}># {testo} ({n})</option>)}
        </select>
      )}
      <select name="consenso" defaultValue={valori.consenso || ''} onChange={() => vai()} aria-label="Consensi" className={valori.consenso ? 'scelto' : ''}>
        <option value="">Consensi: tutti</option>
        {consensi.map(([k, testo]) => <option key={k} value={k}>{testo}</option>)}
      </select>
      <button className="btn btn-primario">Cerca</button>
      {attivi > 0 && <button type="button" className="link-btn piccolo" onClick={() => router.push('/gestione/persone')}>azzera</button>}
    </form>
  );
}
