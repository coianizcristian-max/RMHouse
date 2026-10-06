import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// Il vecchio negozio (prima l'abbonamento, poi il corso) è stato sostituito dall'iscrizione guidata:
// prima il corso, poi gli abbonamenti di quel corso, poi i giorni. Tutti i vecchi link portano lì.
export default async function PaginaAcquista({ searchParams }) {
  const p = (await searchParams) || {};
  const q = new URLSearchParams();
  if (typeof p.corso === 'string') q.set('corso', p.corso);
  if (typeof p.per === 'string') q.set('per', p.per);
  if (p.annullato) q.set('annullato', '1');
  redirect(`/area/iscriviti${q.toString() ? `?${q}` : ''}`);
}
