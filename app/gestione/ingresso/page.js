import { staffCorrente } from '@/lib/staff';
import { oggiISO } from '@/lib/formato';
import Ingresso from './Ingresso';

export const dynamic = 'force-dynamic';

// Reception: inquadrato il pass (o cercata la persona) si vede subito se è tutto in regola
export default async function PaginaIngresso({ searchParams }) {
  const { t } = await searchParams;
  const { supabase, staff } = await staffCorrente();
  let esito = null;
  if (t && /^[0-9a-f-]{36}$/i.test(t)) {
    const { data, error } = await supabase.rpc('registra_ingresso', { p_token: t });
    esito = error ? { errore: 'Pass non riconosciuto.' } : data;
  }
  const { data: oggi } = await supabase.from('ingressi')
    .select('id, quando, esito, avvisi, allievi ( id, nome, cognome ), lezioni ( corsi ( nome ) )')
    .eq('palestra_id', staff.palestra_id).gte('quando', `${oggiISO()}T00:00:00`).order('quando', { ascending: false }).limit(100);
  return <Ingresso palestraId={staff.palestra_id} esitoIniziale={esito} oggi={oggi || []} />;
}
