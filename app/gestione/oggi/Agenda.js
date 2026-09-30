import Link from 'next/link';
import { staffCorrente } from '@/lib/staff';
import { ora, oggiISO, spostaGiorni } from '@/lib/formato';

export const dynamic = 'force-dynamic';

// Agenda del giorno: tutte le lezioni con iscritti e prove
export default async function AgendaGiorno({ searchParams }) {
  const { data: q, mie } = await searchParams;
  const giorno = /^\d{4}-\d{2}-\d{2}$/.test(q || '') ? q : oggiISO();
  const { supabase, staff } = await staffCorrente();

  let query = supabase
    .from('v_lezioni')
    .select('id, corso_nome, inizio, fine, sala_nome, insegnante_nome, insegnante_id, stato, iscritti, prove, capienza, colore')
    .eq('palestra_id', staff.palestra_id)
    .eq('data', giorno)
    .order('inizio');
  if (mie === '1') query = query.eq('insegnante_id', staff.id);
  const [{ data: lezioni, error }, { data: affitti }] = await Promise.all([
    query,
    mie === '1' ? Promise.resolve({ data: [] }) : supabase.from('prenotazioni_spazi')
      .select('id, titolo, contatto_nome, inizio, fine, stato, sale ( nome )').eq('palestra_id', staff.palestra_id)
      .in('stato', ['confermata', 'opzione']).gte('inizio', `${giorno}T00:00:00`).lt('inizio', `${spostaGiorni(giorno, 1)}T00:00:00`)
      .order('inizio'),
  ]);
  // lezioni e affitti insieme, in ordine di orario
  const righe = [
    ...(lezioni || []).map((l) => ({ ...l, tipo: 'lezione' })),
    ...(affitti || []).map((a) => ({ ...a, tipo: 'affitto' })),
  ].sort((a, b) => a.inizio.localeCompare(b.inizio));

  const titolo = new Date(giorno + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  const link = (d, m = mie) => `/gestione/oggi?data=${d}${m === '1' ? '&mie=1' : ''}`;

  return (
    <>
      <div className="giorno-nav">
        <Link className="btn" href={link(spostaGiorni(giorno, -1))} aria-label="Giorno precedente">‹</Link>
        <h1>{titolo}</h1>
        <Link className="btn" href={link(spostaGiorni(giorno, 1))} aria-label="Giorno successivo">›</Link>
      </div>
      <div className="filtri">
        <Link href={link(giorno, '0')} aria-current={mie !== '1' ? 'true' : undefined}>Tutte</Link>
        <Link href={link(giorno, '1')} aria-current={mie === '1' ? 'true' : undefined}>Solo le mie</Link>
        {giorno !== oggiISO() && <Link href={link(oggiISO())}>Oggi</Link>}
      </div>

      {error && <div className="errore">Impossibile caricare le lezioni.</div>}
      {righe.length === 0 && (
        <div className="vuoto">
          Nessuna lezione in questo giorno.
          <div className="piccolo" style={{ marginTop: 8 }}>
            <Link href={link(spostaGiorni(giorno, 1))}>Vai al giorno successivo</Link>
          </div>
        </div>
      )}

      <ul className="elenco agenda-giorno">
        {righe.map((l) => l.tipo === 'affitto' ? (
          <li key={`a${l.id}`}>
            <Link className="voce" href={`/gestione/spazi?giorno=${giorno}`} style={{ borderLeft: '5px solid var(--verde-affitto)' }}>
              <span className="slot-ora">{ora(l.inizio)}</span>
              <span>
                <strong style={{ color: 'var(--nero)' }}>{l.titolo || 'Affitto sala'}</strong>
                <span className="piccolo muto" style={{ display: 'block' }}>
                  {[l.sale?.nome, l.contatto_nome, `fino alle ${ora(l.fine)}`].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="tag tag-affitto">{l.stato === 'opzione' ? 'affitto in opzione' : 'affitto'}</span>
            </Link>
          </li>
        ) : (
          <li key={l.id}>
            <Link className="voce" href={`/gestione/appello/${l.id}`} style={{ borderLeft: `5px solid ${l.colore || 'var(--rosso)'}` }}>
              <span className="slot-ora">{ora(l.inizio)}</span>
              <span>
                <strong style={{ color: 'var(--nero)' }}>{l.corso_nome}</strong>
                <span className="piccolo muto" style={{ display: 'block' }}>
                  {[l.sala_nome, l.insegnante_nome].filter(Boolean).join(' · ') || 'Sala e insegnante da assegnare'}
                </span>
              </span>
              <span style={{ display: 'grid', gap: 4, justifyItems: 'end', minWidth: 96 }}>
                {l.stato === 'annullata' ? <span className="tag tag-neutro">Annullata</span> : (
                  <>
                    <span className="tag tag-neutro">{l.iscritti}{l.capienza ? `/${l.capienza}` : ''}</span>
                    {l.prove > 0 && <span className="tag tag-rosso">{l.prove} in prova</span>}
                    {l.capienza > 0 && (
                      <span style={{ display: 'block', width: 76, height: 5, borderRadius: 3, background: 'var(--linea)', overflow: 'hidden' }}>
                        <span style={{ display: 'block', height: '100%',
                                       width: `${Math.min(100, Math.round(((l.iscritti + l.prove) / l.capienza) * 100))}%`,
                                       background: l.colore || 'var(--rosso)' }} />
                      </span>
                    )}
                  </>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
