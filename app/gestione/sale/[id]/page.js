import { notFound, redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import SchedaSala from '../SchedaSala';

export const dynamic = 'force-dynamic';

// /gestione/sale/nuova oppure /gestione/sale/<id>
export default async function PaginaSala({ params }) {
  const { id } = await params;
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const { data: sedi } = await supabase.from('sedi').select('id, nome').eq('palestra_id', staff.palestra_id).order('ordine');
  if (id === 'nuova') return <SchedaSala palestraId={staff.palestra_id} sedi={sedi || []} />;

  const [{ data: sala }, { data: orari }, { count: posti }, { data: persone }] = await Promise.all([
    supabase.from('sale').select('*').eq('id', id).eq('palestra_id', staff.palestra_id).maybeSingle(),
    supabase.from('orari').select('id, giorno_settimana, ora_inizio, durata_min, insegnante_id, corsi ( id, nome, colore )')
      .eq('sala_id', id).eq('attivo', true).order('giorno_settimana').order('ora_inizio'),
    supabase.from('postazioni').select('id', { count: 'exact', head: true }).eq('sala_id', id).eq('attiva', true),
    supabase.from('staff').select('id, nome, cognome').eq('palestra_id', staff.palestra_id),
  ]);
  const nomi = Object.fromEntries((persone || []).map((x) => [x.id, [x.nome, x.cognome].filter(Boolean).join(' ')]));
  const usi = (orari || []).map((o) => ({ ...o, insegnante: nomi[o.insegnante_id] || null }));
  if (!sala) notFound();
  return <SchedaSala palestraId={staff.palestra_id} sala={sala} sedi={sedi || []} orari={usi} posti={posti || 0} />;
}
