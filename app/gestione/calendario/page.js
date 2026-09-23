import Link from 'next/link';
import { staffCorrente } from '@/lib/staff';
import { oggiISO, spostaGiorni } from '@/lib/formato';
import Settimana from './Settimana';

export const dynamic = 'force-dynamic';

// Lunedì della settimana che contiene una data
function lunedi(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  const g = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - g);
  return d.toISOString().slice(0, 10);
}

export default async function Calendario({ searchParams }) {
  const { da, sala, insegnante, mie } = await searchParams;
  const { supabase, staff } = await staffCorrente();
  const inizio = lunedi(/^\d{4}-\d{2}-\d{2}$/.test(da || '') ? da : oggiISO());
  const fine = spostaGiorni(inizio, 6);

  let q = supabase
    .from('v_occupazione')
    .select('lezione_id, corso_id, corso_nome, data, inizio, fine, stato, capienza, iscritti, prove, presenti, sala_id, insegnante_id')
    .eq('palestra_id', staff.palestra_id)
    .gte('data', inizio).lte('data', fine)
    .order('inizio');
  if (sala) q = q.eq('sala_id', sala);
  if (insegnante) q = q.eq('insegnante_id', insegnante);
  if (mie === '1') q = q.eq('insegnante_id', staff.id);

  const [{ data: lezioni }, { data: sale }, { data: insegnanti }, { data: corsi }] = await Promise.all([
    q,
    supabase.from('sale').select('id, nome').eq('palestra_id', staff.palestra_id).order('nome'),
    supabase.from('staff').select('id, nome, cognome').eq('palestra_id', staff.palestra_id)
      .eq('ruolo', 'insegnante').eq('attivo', true).order('nome'),
    supabase.from('corsi').select('id, colore').eq('palestra_id', staff.palestra_id),
  ]);

  const filtro = (chiave, valore) => {
    const p = new URLSearchParams();
    p.set('da', inizio);
    const attuali = { sala, insegnante, mie };
    attuali[chiave] = valore;
    Object.entries(attuali).forEach(([k, v]) => v && k !== 'da' && p.set(k, v));
    if (!valore) p.delete(chiave);
    return `/gestione/calendario?${p.toString()}`;
  };

  return (
    <>
      <div className="giorno-nav">
        <Link className="btn" href={`/gestione/calendario?da=${spostaGiorni(inizio, -7)}`} aria-label="Settimana precedente">‹</Link>
        <h1 style={{ fontSize: 20 }}>
          {new Date(inizio + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} –{' '}
          {new Date(fine + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
        </h1>
        <Link className="btn" href={`/gestione/calendario?da=${spostaGiorni(inizio, 7)}`} aria-label="Settimana successiva">›</Link>
      </div>

      <div className="filtri">
        <Link href={`/gestione/calendario?da=${oggiISO()}`}>Questa settimana</Link>
        <Link href={filtro('mie', mie === '1' ? '' : '1')} aria-current={mie === '1' ? 'true' : undefined}>Solo le mie</Link>
        {sale?.map((s) => (
          <Link key={s.id} href={filtro('sala', sala === s.id ? '' : s.id)} aria-current={sala === s.id ? 'true' : undefined}>{s.nome}</Link>
        ))}
        {insegnanti?.map((i) => (
          <Link key={i.id} href={filtro('insegnante', insegnante === i.id ? '' : i.id)}
                aria-current={insegnante === i.id ? 'true' : undefined}>{i.nome}</Link>
        ))}
      </div>

      <Settimana inizio={inizio} lezioni={lezioni || []} corsi={corsi || []} />
    </>
  );
}
