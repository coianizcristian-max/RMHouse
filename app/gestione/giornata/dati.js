import { staffCorrente } from '@/lib/staff';
import { oggiISO, spostaGiorni } from '@/lib/formato';

// Lezioni e affitti di un giorno, per la vista per sale e per insegnanti
export async function giornata({ giorno, sede }) {
  const { supabase, staff } = await staffCorrente();
  const p = staff.palestra_id;
  const data = /^\d{4}-\d{2}-\d{2}$/.test(giorno || '') ? giorno : oggiISO();

  let q = supabase.from('v_occupazione')
    .select('lezione_id, corso_id, corso_nome, data, inizio, fine, stato, capienza, iscritti, prove, sala_id, sala_nome, sede_id, insegnante_id, insegnante_nome, prenotabile, colore')
    .eq('palestra_id', p).eq('data', data).order('inizio');
  if (sede) q = q.eq('sede_id', sede);

  const [{ data: lezioni }, { data: sale }, { data: sedi }, { data: affitti }] = await Promise.all([
    q,
    supabase.from('sale').select('id, nome, sede_id, capienza').eq('palestra_id', p).order('nome'),
    supabase.from('sedi').select('id, nome, principale').eq('palestra_id', p).eq('visibile', true).order('ordine'),
    supabase.from('prenotazioni_spazi').select('id, titolo, contatto_nome, inizio, fine, sala_id, stato')
      .eq('palestra_id', p).in('stato', ['richiesta', 'opzione', 'confermata'])
      .gte('inizio', `${spostaGiorni(data, -1)}T22:00:00Z`).lt('inizio', `${data}T23:59:59Z`),
  ]);

  const sedeScelta = sede || sedi?.find((s) => s.principale)?.id || '';
  return {
    staff, data, sedeScelta,
    lezioni: lezioni || [], sale: sale || [], sedi: sedi || [],
    affitti: (affitti || []).filter((a) => new Date(a.inizio).toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }) === data),
  };
}
