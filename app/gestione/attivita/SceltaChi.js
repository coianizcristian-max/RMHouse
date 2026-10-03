'use client';
import { useRouter } from 'next/navigation';

// Scelta della persona: cambia pagina appena si sceglie
export default function SceltaChi({ persone, chi, qs }) {
  const router = useRouter();
  return (
    <select value={chi || ''} aria-label="Persona dello staff"
            onChange={(e) => router.push(`/gestione/attivita?${qs}${e.target.value ? `&chi=${e.target.value}` : ''}`)}>
      <option value="">Tutto lo staff</option>
      {persone.map((p) => <option key={p.staff_id} value={p.staff_id}>{p.nome}{p.totale ? ` (${p.totale})` : ''}</option>)}
    </select>
  );
}
