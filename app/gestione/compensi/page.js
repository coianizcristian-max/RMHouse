import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import Compensi from './Compensi';

export const dynamic = 'force-dynamic';

export default async function PaginaCompensi({ searchParams }) {
  const { anno, mese } = await searchParams;
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');

  const oggi = new Date();
  const a = parseInt(anno, 10) || oggi.getFullYear();
  const m = parseInt(mese, 10) || oggi.getMonth() + 1;

  const { data: righe } = await supabase
    .from('compensi')
    .select('*, staff ( nome, cognome, foto_url, colore, specialita )')
    .eq('palestra_id', staff.palestra_id).eq('anno', a).eq('mese', m)
    .order('totale_cent', { ascending: false });

  const dal = `${a}-${String(m).padStart(2, '0')}-01`;
  const al = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
  const [{ data: pal }, { count: senzaInsegnante }, { data: lezMese }] = await Promise.all([
    supabase.from('palestre').select('compensi').eq('id', staff.palestra_id).maybeSingle(),
    supabase.from('lezioni').select('id', { count: 'exact', head: true }).eq('palestra_id', staff.palestra_id)
      .gte('data', dal).lte('data', al).neq('stato', 'annullata').lte('fine', new Date().toISOString())
      .is('insegnante_id', null).is('svolta_da', null),
    // le ore del mese: in calendario (previste) e svolte (confermate con l'appello)
    supabase.from('lezioni').select('inizio, fine, svolta_da, insegnante_id').eq('palestra_id', staff.palestra_id)
      .gte('data', dal).lte('data', al).neq('stato', 'annullata').limit(5000),
  ]);
  const adesso = Date.now();
  const ore = (l) => (new Date(l.fine) - new Date(l.inizio)) / 3600000;
  const tutte = lezMese || [];
  const svolte = tutte.filter((l) => l.svolta_da);
  const daConfermare = tutte.filter((l) => !l.svolta_da && new Date(l.fine).getTime() < adesso);
  const ore_mese = {
    calendario: tutte.reduce((s, l) => s + ore(l), 0), lezioni: tutte.length,
    svolte: svolte.reduce((s, l) => s + ore(l), 0), lezioniSvolte: svolte.length,
    daConfermare: daConfermare.length,
  };
  return <Compensi palestraId={staff.palestra_id} righe={righe || []} anno={a} mese={m}
                   soloConfermate={pal?.compensi?.solo_confermate !== false} senzaInsegnante={senzaInsegnante || 0} ore={ore_mese} admin={staff.ruolo === 'admin'} />;
}
