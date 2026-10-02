import { notFound } from 'next/navigation';
import Link from 'next/link';
import { staffCorrente } from '@/lib/staff';
import Stampa from '../../../ricevute/[id]/Stampa';
import FoglioFirma from '../../../firme/FoglioFirma';

export const dynamic = 'force-dynamic';

// Tutti i moduli firmati di una persona (l'ultima firma di ogni modulo), uno per pagina:
// è il "modulo d'iscrizione" completo da stampare o salvare in PDF
export default async function ModuliFirmati({ params }) {
  const { id } = await params;
  const { supabase, staff } = await staffCorrente();
  const [{ data: firme }, { data: pal }, { data: moduli }, { data: a }] = await Promise.all([
    supabase.from('firme').select('*, allievi ( nome, cognome, data_nascita, codice_fiscale )').eq('allievo_id', id).order('firmato_at', { ascending: false }),
    supabase.from('palestre').select('nome, dati_fiscali, indirizzo').eq('id', staff.palestra_id).maybeSingle(),
    supabase.from('moduli').select('id, scelte, ordine, attivo').eq('palestra_id', staff.palestra_id),
    supabase.from('allievi').select('nome, cognome').eq('id', id).maybeSingle(),
  ]);
  if (!a) notFound();
  const mod = Object.fromEntries((moduli || []).map((m) => [m.id, m]));
  // l'ultima firma di ogni modulo ancora in uso, nell'ordine dei moduli
  const ultime = [];
  for (const f of firme || []) if (mod[f.modulo_id]?.attivo && !ultime.some((x) => x.modulo_id === f.modulo_id)) ultime.push(f);
  ultime.sort((x, y) => (mod[x.modulo_id]?.ordine ?? 99) - (mod[y.modulo_id]?.ordine ?? 99));
  return (
    <>
      <div className="foglio senza-stampa" style={{ paddingBottom: 0 }}>
        <Stampa />
        <p className="piccolo muto" style={{ margin: 0 }}>
          Moduli firmati da <Link prefetch={false} href={`/gestione/persone/${id}`}>{a.nome} {a.cognome}</Link>: {ultime.length}.
          {' '}Ogni modulo esce su un foglio a sé.
        </p>
      </div>
      {ultime.length === 0
        ? <div className="foglio"><div className="vuoto">Nessun modulo firmato.</div></div>
        : ultime.map((f) => <FoglioFirma key={f.id} f={f} pal={pal} scelte={mod[f.modulo_id]?.scelte} />)}
    </>
  );
}
