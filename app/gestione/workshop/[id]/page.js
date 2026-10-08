import { notFound, redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import SchedaWorkshop from './SchedaWorkshop';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Workshop' };

// Scheda di un workshop: iscritti (incassi, presenze, annullamenti), conti e modifica
export default async function PaginaSchedaWorkshop({ params, searchParams }) {
  const { id } = await params;
  const { scheda, momento } = (await searchParams) || {};
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const p = staff.palestra_id;
  const [{ data: w }, { data: momenti }, { data: opzioni }, { data: iscrizioni }, { data: sedi }, { data: sale }, { data: pal }, { data: staffElenco }] = await Promise.all([
    supabase.from('workshop').select('*').eq('id', id).eq('palestra_id', p).maybeSingle(),
    supabase.from('workshop_momenti').select('*, sale ( nome )').eq('workshop_id', id).order('inizio').order('ordine'),
    supabase.from('workshop_opzioni').select('*').eq('workshop_id', id).order('ordine').order('nome'),
    supabase.from('workshop_iscrizioni')
      .select('id, opzione_id, allievo_id, stato, esterno, prezzo_cent, quota_cent, origine, presenze, created_at, annullata_at, note, pagamento_id, '
        + 'pagamenti ( stato, metodo, importo_cent, pagato_at ), allievi ( nome, cognome, data_nascita, certificato_scadenza, account ( email, telefono, nome, cognome ) )')
      .eq('workshop_id', id).order('created_at'),
    supabase.from('sedi').select('id, nome').eq('palestra_id', p).order('ordine'),
    supabase.from('sale').select('id, nome').eq('palestra_id', p).order('ordine', { nullsFirst: false }).order('nome'),
    supabase.from('palestre').select('quota_iscrizione_cent').eq('id', p).maybeSingle(),
    // chi può tenere il workshop tra lo staff (insegnante della scuola: il compenso va nel suo cedolino)
    supabase.from('staff').select('id, nome, cognome, ruolo').eq('palestra_id', p).eq('attivo', true).eq('archiviato', false).order('nome'),
  ]);
  if (!w) notFound();
  // insegnante della scuola: il cedolino del mese in cui il workshop finisce
  const fine = (momenti || []).reduce((m, x) => { const t = x.fine || x.inizio; return !m || t > m ? t : m; }, null);
  let cedolino = null;
  if (w.insegnante_id && fine) {
    const d = new Date(fine);
    const anno = Number(d.toLocaleDateString('it-IT', { year: 'numeric', timeZone: 'Europe/Rome' }));
    const mese = Number(d.toLocaleDateString('it-IT', { month: 'numeric', timeZone: 'Europe/Rome' }));
    ({ data: cedolino } = await supabase.from('compensi').select('id, stato, totale_cent')
      .eq('staff_id', w.insegnante_id).eq('anno', anno).eq('mese', mese).maybeSingle());
  }
  return (
    <SchedaWorkshop palestraId={p} workshop={w} momenti={momenti || []} opzioni={opzioni || []} iscrizioni={iscrizioni || []}
                    sedi={sedi || []} sale={sale || []} quotaCent={pal?.quota_iscrizione_cent || 0} schedaIniziale={['modifica', 'appello', 'prezzi', 'insegnante'].includes(scheda) ? scheda : 'iscritti'} momentoIniziale={momento || null}
                    staffElenco={staffElenco || []} fine={fine} cedolino={cedolino} />
  );
}
