import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// Il negozio ora è dentro l'app del cliente: i vecchi link (email, sito) portano lì
export default async function Abbonamento({ searchParams }) {
  const p = await searchParams;
  const q = new URLSearchParams();
  if (p?.corso) q.set('corso', p.corso);
  if (p?.annullato) q.set('annullato', '1');
  redirect(`/area/iscriviti${q.toString() ? `?${q}` : ''}`);
}
