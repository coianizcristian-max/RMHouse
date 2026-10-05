import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase/admin';
import FoglioRicevuta from '@/app/gestione/ricevute/FoglioRicevuta';
import StampaSemplice from './StampaSemplice';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ricevuta', robots: { index: false, follow: false } };

// La ricevuta aperta dal cliente con il link ricevuto su WhatsApp o per email: solo chi ha il link la vede.
export default async function RicevutaPubblica({ params }) {
  const { token } = await params;
  if (!/^[0-9a-f]{32,64}$/.test(token || '')) notFound();
  const { data: r } = await supabaseAdmin().rpc('ricevuta_pubblica', { p_token: token });
  if (!r) notFound();
  return (
    <div className="foglio">
      <StampaSemplice />
      <FoglioRicevuta r={r} pal={r.palestra} logo={r.palestra?.logo_url || '/logo.png'} />
    </div>
  );
}
