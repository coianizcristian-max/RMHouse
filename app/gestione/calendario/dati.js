import { staffCorrente } from '@/lib/staff';
import { oggiISO, spostaGiorni } from '@/lib/formato';

// Lunedì della settimana che contiene una data
export function lunedi(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  const g = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - g);
  return d.toISOString().slice(0, 10);
}

// Quanti giorni mostra il palinsesto: 1, 3, 5 o 7 (la settimana da lunedì)
export const VISTE_GIORNI = [1, 3, 5, 7];
export const giorniValidi = (v) => (VISTE_GIORNI.includes(Number(v)) ? Number(v) : 7);

// Tutto quello che serve a una settimana di calendario, usato sia dal
// palinsesto sia dall'agenda: così le due pagine restano allineate.
// Con `giorni` 1, 3 o 5 il periodo parte dal giorno scelto (o da oggi) invece che dal lunedì.
export async function settimana({ da, sala, insegnante, mie, sede, corso, giorni = 7 }) {
  const { supabase, staff } = await staffCorrente();
  const n = giorniValidi(giorni);
  const giorno = /^\d{4}-\d{2}-\d{2}$/.test(da || '') ? da : oggiISO();
  const inizio = n === 7 ? lunedi(giorno) : giorno;
  const fine = spostaGiorni(inizio, n - 1);

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
  if (corso) q = q.eq('corso_id', corso);

  const [{ data: tutte }, { data: sale }, { data: insegnanti }, { data: corsi }, { data: note }, { data: sedi }, { data: chiusure }] = await Promise.all([
    q,
    supabase.from('sale').select('id, nome').eq('palestra_id', staff.palestra_id).order('ordine', { nullsFirst: false }).order('nome'),
    supabase.from('staff').select('id, nome, cognome').eq('palestra_id', staff.palestra_id)
      .eq('ruolo', 'insegnante').eq('attivo', true).eq('archiviato', false).order('nome'),
    supabase.from('corsi').select('id, nome, colore, visibilita, attivo').eq('palestra_id', staff.palestra_id).order('nome'),
    supabase.from('note_giorno').select('id, data, testo')
      .eq('palestra_id', staff.palestra_id).gte('data', inizio).lte('data', fine).order('created_at'),
    supabase.from('sedi').select('id, nome').eq('palestra_id', staff.palestra_id).eq('visibile', true).order('ordine'),
    supabase.from('chiusure').select('dal, al, motivo').eq('palestra_id', staff.palestra_id).lte('dal', fine).gte('al', inizio),
  ]);
  // feste e chiusure: le lezioni di quei giorni non si fanno e basta (niente recuperi, scadenze uguali),
  // quindi nel palinsesto non si vedono; al loro posto il giorno dice "Chiuso · motivo"
  const chiuso = (d) => (chiusure || []).find((c) => d >= c.dal && d <= c.al);
  const lezioni = (tutte || []).filter((l) => !(l.stato === 'annullata' && chiuso(l.data)));
  const giorniChiusi = {};
  for (let i = 0; i < n; i++) {
    const d = new Date(inizio + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + i);
    const g = d.toISOString().slice(0, 10); const c = chiuso(g);
    if (c) giorniChiusi[g] = c.motivo || 'Chiusura';
  }

  const idLezioni = (lezioni || []).map((l) => l.lezione_id);
  // chi è prenotato e chi è in coda (lezione piena), lette insieme
  const [{ data: facce }, { data: coda }] = idLezioni.length
    ? await Promise.all([
        supabase.from('v_facce_lezione')
          .select('lezione_id, allievo_id, nome, cognome, foto_url, tipo').in('lezione_id', idLezioni),
        supabase.from('liste_attesa')
          .select('lezione_id, allievo_id, stato, tipo, created_at, allievi ( nome, cognome, foto_url )')
          .in('lezione_id', idLezioni).in('stato', ['in_attesa', 'avvisato']).order('created_at'),
      ])
    : [{ data: [] }, { data: [] }];

  return {
    staff, inizio, fine, giorni: n,
    lezioni: lezioni || [], sale: sale || [], insegnanti: insegnanti || [],
    corsi: corsi || [], note: note || [], facce: facce || [], coda: coda || [], sedi: sedi || [], giorniChiusi,
  };
}
