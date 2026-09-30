'use client';
import { useRouter } from 'next/navigation';

// Sede, sala e insegnante in tre menù; "Solo le mie" come interruttore; "azzera" se c'è un filtro
export default function Filtri({ base, inizio, sale, insegnanti, sedi, scelti }) {
  const router = useRouter();
  const vai = (chiave, valore) => {
    const p = new URLSearchParams({ da: inizio });
    Object.entries({ ...scelti, [chiave]: valore }).forEach(([k, v]) => v && p.set(k, v));
    router.push(`${base}?${p.toString()}`);
  };
  const attivi = Object.values(scelti).filter(Boolean).length;
  return (
    <div className="bc-filtri">
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
      <button type="button" className={`stato-pillola${scelti.mie ? '' : ''}`} aria-current={scelti.mie ? 'true' : undefined}
              onClick={() => vai('mie', scelti.mie ? '' : '1')}>Solo le mie</button>
      {attivi > 0 && (
        <button type="button" className="link-btn piccolo" onClick={() => router.push(`${base}?da=${inizio}`)}>azzera i filtri</button>
      )}
    </div>
  );
}
