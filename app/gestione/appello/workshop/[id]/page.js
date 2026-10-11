import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import AppelloWorkshop from '../../../workshop/[id]/AppelloWorkshop';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Appello del workshop' };

// L'appello di un workshop per chi lo insegna (dal calendario o dal tasto Appello): solo i nomi da segnare presenti,
// senza conti né incassi. La segreteria qui viene mandata alla scheda completa del workshop.
export default async function AppelloWorkshopInsegnante({ params, searchParams }) {
  const { id } = await params;
  const { momento } = (await searchParams) || {};
  const { supabase, staff } = await staffCorrente();
  const gestione = staff.ruolo !== 'insegnante';
  if (gestione) redirect(`/gestione/workshop/${id}?scheda=appello${momento ? `&momento=${momento}` : ''}`);
  const [{ data: w }, { data: momenti }, { data: opzioni }, { data: iscrizioni }] = await Promise.all([
    supabase.from('workshop').select('id, titolo, insegnante_id, stato, certificato_richiesto').eq('id', id).eq('palestra_id', staff.palestra_id).maybeSingle(),
    supabase.from('workshop_momenti').select('id, titolo, inizio, fine, sale ( nome )').eq('workshop_id', id).order('inizio').order('ordine'),
    supabase.from('workshop_opzioni').select('id, nome, momenti').eq('workshop_id', id).order('ordine'),
    supabase.from('workshop_iscrizioni')
      .select('id, opzione_id, stato, esterno, prezzo_cent, quota_cent, presenze, pagamenti ( stato ), allievi ( nome, cognome, certificato_scadenza )')
      .eq('workshop_id', id).eq('stato', 'iscritto'),
  ]);
  if (!w || w.stato === 'bozza') notFound();
  if (w.insegnante_id !== staff.id) redirect('/gestione/appello');
  return (
    <>
      <div className="ap-testa">
        <div>
          <Link prefetch={false} href="/gestione/appello" className="link-btn piccolo">← Appello</Link>
          <h1>{w.titolo}</h1>
          <p>Workshop · tocca il nome di chi c&apos;è.</p>
        </div>
      </div>
      <AppelloWorkshop workshop={w} momenti={momenti || []} opzioni={opzioni || []} iscrizioni={iscrizioni || []} momentoIniziale={momento || null} />
    </>
  );
}
