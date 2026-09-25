import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import Rate from './Rate';
import { stripeAttivo } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

export default async function PaginaRate({ searchParams }) {
  const { vista = 'da_pagare' } = await searchParams;
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const p = staff.palestra_id;

  let q = supabase.from('v_rate').select('*').eq('palestra_id', p);
  if (vista === 'scadute') q = q.eq('scaduta', true);
  else if (vista === 'pagate') q = q.eq('stato', 'pagata');
  else if (vista !== 'tutte') q = q.eq('stato', 'da_pagare');
  const [{ data: rate }, { data: tutte }] = await Promise.all([
    q.order('scadenza', { ascending: vista !== 'pagate' }).limit(500),
    supabase.from('v_rate').select('stato, scaduta, importo_cent').eq('palestra_id', p).neq('stato', 'annullata').limit(5000),
  ]);

  const somma = (f) => (tutte || []).filter(f).reduce((s, r) => s + r.importo_cent, 0);
  const conti = {
    da_pagare: (tutte || []).filter((r) => r.stato === 'da_pagare').length,
    scadute: (tutte || []).filter((r) => r.scaduta).length,
    valore_da_pagare: somma((r) => r.stato === 'da_pagare'),
    valore_scadute: somma((r) => r.scaduta),
  };
  return <Rate palestraId={p} rate={rate || []} vista={vista} conti={conti} online={stripeAttivo()} />;
}
