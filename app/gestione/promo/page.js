import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import Promo from './Promo';

export const dynamic = 'force-dynamic';

export default async function PaginaPromo() {
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');

  const [{ data: corsi }, { data: inviate }] = await Promise.all([
    supabase.from('corsi').select('id, nome, colore').eq('palestra_id', staff.palestra_id)
      .eq('attivo', true).order('nome'),
    supabase.from('messaggi_coda').select('oggetto, created_at, stato')
      .eq('palestra_id', staff.palestra_id).eq('evento', 'promo')
      .order('created_at', { ascending: false }).limit(60),
  ]);

  // le email di una stessa promozione hanno lo stesso oggetto e lo stesso momento
  const storico = [];
  for (const m of inviate || []) {
    const chiave = `${m.oggetto}|${m.created_at.slice(0, 16)}`;
    const trovato = storico.find((s) => s.chiave === chiave);
    if (trovato) { trovato.quanti += 1; if (m.stato === 'inviato') trovato.inviati += 1; }
    else storico.push({ chiave, oggetto: m.oggetto, quando: m.created_at, quanti: 1, inviati: m.stato === 'inviato' ? 1 : 0 });
  }

  return <Promo palestraId={staff.palestra_id} corsi={corsi || []} storico={storico.slice(0, 10)} />;
}
