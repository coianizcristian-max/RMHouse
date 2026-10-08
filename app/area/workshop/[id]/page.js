import { redirect } from 'next/navigation';
import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase/server';
import { utenteCorrente } from '@/lib/utente';
import { stripeAttivo } from '@/lib/stripe';
import { satispayAttivo } from '@/lib/satispay';
import IscrizioneArea from './IscrizioneArea';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Workshop · Ritmo Metropolitano' };

export default async function PaginaWorkshopArea({ params, searchParams }) {
  const { id } = await params;
  const q = (await searchParams) || {};
  const user = await utenteCorrente();
  if (!user) redirect(`/area/accedi?da=/area/workshop/${id}`);
  const supabase = await supabaseServer();
  await supabase.rpc('collega_account');
  const { data } = await supabase.rpc('workshop_area');
  const w = (Array.isArray(data) ? data : []).find((x) => x.id === id);
  if (!w) {
    return (
      <>
        <h1>Workshop non trovato</h1>
        <p className="muto">Forse è già passato o non è più in programma.</p>
        <p><Link prefetch={false} href="/area/workshop">Tutti i workshop</Link></p>
      </>
    );
  }
  return (
    <IscrizioneArea w={w} carta={w.online && stripeAttivo()} satispay={w.online && (await satispayAttivo())}
                    pagato={q.pagato === '1'} daSatispay={q.sp === '1'} />
  );
}
