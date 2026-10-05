import { staffCorrente } from '@/lib/staff';
import { oggiISO, spostaGiorni } from '@/lib/formato';
import Prenotazioni from './Prenotazioni';

export const dynamic = 'force-dynamic';

// Tutte le prenotazioni in arrivo (ingressi, recuperi e prove) fatte dai clienti dall'app o dalla segreteria,
// in un posto solo: per vedere se ce ne sono e, se serve, disdirle o spostarle.
export default async function PaginaPrenotazioni({ searchParams }) {
  const { giorni, tipo, origine, q } = await searchParams;
  const { supabase, staff } = await staffCorrente();
  const p = staff.palestra_id;
  const g = ['1', '7', '30', '90'].includes(giorni) ? Number(giorni) : 7;
  const da = oggiISO(); const a = spostaGiorni(da, g - 1);

  const [{ data: pren }, { data: prove }] = await Promise.all([
    supabase.from('prenotazioni')
      .select('id, tipo, origine, created_at, note, lezione_id, allievo_id, allievi ( nome, cognome, account ( telefono ) ), lezioni!inner ( id, data, inizio, fine, stato, corso_id, corsi ( nome, colore ), sale ( nome ), insegnante:staff!lezioni_insegnante_id_fkey ( nome ) )')
      .eq('palestra_id', p).eq('stato', 'confermata')
      .gte('lezioni.data', da).lte('lezioni.data', a).neq('lezioni.stato', 'annullata')
      .order('created_at', { ascending: false }).limit(1000),
    supabase.from('prove')
      .select('id, origine, created_at, lezione_id, allievo_id, stato, allievi ( nome, cognome, account ( telefono ) ), lezioni!inner ( id, data, inizio, fine, stato, corso_id, corsi ( nome, colore ), sale ( nome ), insegnante:staff!lezioni_insegnante_id_fkey ( nome ) )')
      .eq('palestra_id', p).eq('stato', 'confermata')
      .gte('lezioni.data', da).lte('lezioni.data', a).neq('lezioni.stato', 'annullata')
      .order('created_at', { ascending: false }).limit(1000),
  ]);

  const righe = [
    ...(pren || []).map((x) => ({ ...x, genere: x.tipo })),
    ...(prove || []).map((x) => ({ ...x, genere: 'prova' })),
  ].sort((x, y) => (x.lezioni.inizio < y.lezioni.inizio ? -1 : 1));

  return <Prenotazioni righe={righe} giorni={g} tipo={tipo || ''} origine={origine || ''} q={q || ''} gestione={staff.ruolo !== 'insegnante'} />;
}
