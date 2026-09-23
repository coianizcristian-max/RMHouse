import { staffCorrente } from '@/lib/staff';
import { oggiISO, spostaGiorni } from '@/lib/formato';

// Lunedì della settimana che contiene una data
export function lunedi(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  const g = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - g);
  return d.toISOString().slice(0, 10);
}

// Tutto quello che serve a una settimana di calendario, usato sia dal
// palinsesto sia dall'agenda: così le due pagine restano allineate.
export async function settimana({ da, sala, insegnante, mie, sede }) {
  const { supabase, staff } = await staffCorrente();
  const inizio = lunedi(/^\d{4}-\d{2}-\d{2}$/.test(da || '') ? da : oggiISO());
  const fine = spostaGiorni(inizio, 6);

  let q = supabase
    .from('v_occupazione')
    .select('lezione_id, corso_id, corso_nome, data, inizio, fine, stato, capienza, iscritti, prove, presenti, sala_id, sala_nome, sede_id, sede_nome, insegnante_id, insegnante_nome, insegnante_foto, prenotabile, colore, note')
    .eq('palestra_id', staff.palestra_id)
    .gte('data', inizio).lte('data', fine)
    .order('inizio');
  if (sala) q = q.eq('sala_id', sala);
  if (insegnante) q = q.eq('insegnante_id', insegnante);
  if (mie === '1') q = q.eq('insegnante_id', staff.id);
  if (sede) q = q.eq('sede_id', sede);

  const [{ data: lezioni }, { data: sale }, { data: insegnanti }, { data: corsi }, { data: note }] = await Promise.all([
    q,
    supabase.from('sale').select('id, nome').eq('palestra_id', staff.palestra_id).order('nome'),
    supabase.from('staff').select('id, nome, cognome').eq('palestra_id', staff.palestra_id)
      .eq('ruolo', 'insegnante').eq('attivo', true).eq('archiviato', false).order('nome'),
    supabase.from('corsi').select('id, colore').eq('palestra_id', staff.palestra_id),
    supabase.from('note_giorno').select('id, data, testo')
      .eq('palestra_id', staff.palestra_id).gte('data', inizio).lte('data', fine).order('created_at'),
  ]);

  const { data: sedi } = await supabase.from('sedi').select('id, nome')
    .eq('palestra_id', staff.palestra_id).eq('visibile', true).order('ordine');

  const idLezioni = (lezioni || []).map((l) => l.lezione_id);
  const { data: facce } = idLezioni.length
    ? await supabase.from('v_facce_lezione')
        .select('lezione_id, allievo_id, nome, cognome, foto_url, tipo').in('lezione_id', idLezioni)
    : { data: [] };

  return {
    staff, inizio, fine,
    lezioni: lezioni || [], sale: sale || [], insegnanti: insegnanti || [],
    corsi: corsi || [], note: note || [], facce: facce || [], sedi: sedi || [],
  };
}
