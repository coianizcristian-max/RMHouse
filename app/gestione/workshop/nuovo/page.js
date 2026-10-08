import Link from 'next/link';
import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import WorkshopForm from '../WorkshopForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Nuovo workshop' };

export default async function NuovoWorkshop() {
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const p = staff.palestra_id;
  const [{ data: sedi }, { data: sale }, { data: pal }] = await Promise.all([
    supabase.from('sedi').select('id, nome').eq('palestra_id', p).order('ordine'),
    supabase.from('sale').select('id, nome').eq('palestra_id', p).order('ordine', { nullsFirst: false }).order('nome'),
    supabase.from('palestre').select('quota_iscrizione_cent').eq('id', p).maybeSingle(),
  ]);
  return (
    <>
      <Link prefetch={false} className="torna" href="/gestione/workshop">Tutti i workshop</Link>
      <div className="intestazione">
        <div className="occhiello">Workshop</div>
        <h1>Nuovo workshop</h1>
        <p>Dati, locandina, date, prezzi. Finché resta in bozza lo vede solo lo staff.</p>
      </div>
      <WorkshopForm palestraId={p} sedi={sedi || []} sale={sale || []} quotaCent={pal?.quota_iscrizione_cent || 0} />
    </>
  );
}
