'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Sede, sala e insegnante in tre menù; "Solo le mie" come interruttore; "azzera" se c'è un filtro
export default function Filtri({ base, inizio, sale, insegnanti, sedi, corsi = [], scelti, extra = null }) {
  const router = useRouter();
  const vai = (chiave, valore) => {
    const p = new URLSearchParams({ da: inizio });
    Object.entries({ ...scelti, [chiave]: valore }).forEach(([k, v]) => v && p.set(k, v));
    const url = `${base}?${p.toString()}`;
    router.push(url);
    // rete di sicurezza: se la navigazione "morbida" si perde (capita mentre la pagina si sta ancora aggiornando), si ricarica
    setTimeout(() => { if (window.location.search !== `?${p.toString()}`) window.location.assign(url); }, 1800);
  };
  const attivi = Object.values(scelti).filter(Boolean).length;
  const [aperti, setAperti] = useState(false); // sul telefono i menù stanno dietro il pulsante "Filtri"
  return (
    <div className={aperti ? 'bc-filtri aperti' : 'bc-filtri'}>
      <button type="button" className="btn btn-piccolo bc-apri solo-mobile" aria-expanded={aperti} onClick={() => setAperti(!aperti)}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 5h18l-7 8v6l-4-2v-4z" /></svg>
        Filtri{attivi > 0 ? ` · ${attivi}` : ''}
      </button>
      {sedi.length > 1 && (
        <select value={scelti.sede} onChange={(e) => vai('sede', e.target.value)} aria-label="Sede" className={scelti.sede ? 'scelto' : ''}>
          <option value="">Tutte le sedi</option>
          {sedi.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
        </select>
      )}
      <select value={scelti.sala} onChange={(e) => vai('sala', e.target.value)} aria-label="Sala" className={scelti.sala ? 'scelto' : ''}>
        <option value="">Tutte le sale</option>
        {sale.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
      </select>
      <select value={scelti.insegnante} onChange={(e) => vai('insegnante', e.target.value)} aria-label="Insegnante" className={scelti.insegnante ? 'scelto' : ''}>
        <option value="">Tutti gli insegnanti</option>
        {insegnanti.map((i) => <option key={i.id} value={i.id}>{i.nome}{i.cognome ? ` ${i.cognome}` : ''}</option>)}
      </select>
      {corsi.length > 0 && (
        <select value={scelti.corso || ''} onChange={(e) => vai('corso', e.target.value)} aria-label="Corso" className={scelti.corso ? 'scelto' : ''}>
          <option value="">Tutti i corsi</option>
          {corsi.filter((c) => c.attivo !== false || c.id === scelti.corso).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      )}
      <button type="button" className={`stato-pillola${scelti.mie ? '' : ''}`} aria-current={scelti.mie ? 'true' : undefined}
              onClick={() => vai('mie', scelti.mie ? '' : '1')}>Solo le mie</button>
      {attivi > 0 && (
        <button type="button" className="link-btn piccolo" onClick={() => router.push(`${base}?da=${inizio}`)}>azzera i filtri</button>
      )}
      {extra}
    </div>
  );
}
