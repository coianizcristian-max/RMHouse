import { redirect } from 'next/navigation';
import Testata from '../Testata';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pass · Ritmo Metropolitano', robots: { index: false } };

// Il QR del pass porta qui: se chi lo inquadra è dello staff registra l'ingresso,
// altrimenti ricorda di mostrarlo alla reception
export default async function Ingresso({ searchParams }) {
  const { t } = await searchParams;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (user && t) {
    const { data: staff } = await supabase.from('staff').select('id').eq('user_id', user.id).eq('attivo', true).maybeSingle();
    if (staff) redirect(`/gestione/ingresso?t=${encodeURIComponent(t)}`);
  }
  return (
    <>
      <Testata />
      <main className="pagina" style={{ maxWidth: 520 }}>
        <h1>Questo è un pass d'ingresso</h1>
        <p>Mostralo alla reception quando entri: lo inquadrano con il telefono e la tua presenza si segna da sola.</p>
        <p className="piccolo muto">Se sei della reception, accedi prima al gestionale da questo telefono.</p>
      </main>
    </>
  );
}
