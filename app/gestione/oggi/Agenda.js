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
  const gestione = staff.ruolo !== 'insegnante';
  const [{ data: lezioni, error }, { data: affitti }, { data: wsGiorno }] = await Promise.all([
    query,
    mie === '1' ? Promise.resolve({ data: [] }) : supabase.from('prenotazioni_spazi')
      .select('id, titolo, contatto_nome, inizio, fine, stato, sale ( nome )').eq('palestra_id', staff.palestra_id)
      .in('stato', ['confermata', 'opzione']).gte('inizio', `${giorno}T00:00:00`).lt('inizio', `${spostaGiorni(giorno, 1)}T00:00:00`)
      .order('inizio'),
    // i momenti dei workshop del giorno (l'appello è nella scheda del workshop)
    mie === '1' || !gestione ? Promise.resolve({ data: [] }) : supabase.rpc('workshop_del_giorno', { p_palestra: staff.palestra_id, p_giorno: giorno }),
  ]);
  // lezioni, affitti e workshop insieme, in ordine di orario (gli orari dei workshop arrivano in UTC: si confrontano come date)
  const quando = (r) => new Date(r.inizio).getTime();
  const righe = [
    ...(lezioni || []).map((l) => ({ ...l, tipo: 'lezione' })),
    ...(affitti || []).map((a) => ({ ...a, tipo: 'affitto' })),
    ...(Array.isArray(wsGiorno) ? wsGiorno : []).map((m) => ({ ...m, id: m.momento_id, tipo: 'workshop' })),
  ].sort((a, b) => quando(a) - quando(b));

  const titolo = new Date(giorno + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  const link = (d, m = mie) => `/gestione/oggi?data=${d}${m === '1' ? '&mie=1' : ''}`;

  return (
    <>
      <div className="giorno-nav">
        <Link prefetch={false} className="btn" href={link(spostaGiorni(giorno, -1))} aria-label="Giorno precedente">‹</Link>
        <h1>{titolo}</h1>
        <Link prefetch={false} className="btn" href={link(spostaGiorni(giorno, 1))} aria-label="Giorno successivo">›</Link>
      </div>
      <div className="filtri">
        <Link prefetch={false} href={link(giorno, '0')} aria-current={mie !== '1' ? 'true' : undefined}>Tutte</Link>
        <Link prefetch={false} href={link(giorno, '1')} aria-current={mie === '1' ? 'true' : undefined}>Solo le mie</Link>
        {giorno !== oggiISO() && <Link prefetch={false} href={link(oggiISO())}>Oggi</Link>}
      </div>

      {error && <div className="errore">Impossibile caricare le lezioni.</div>}
      {righe.length === 0 && (
        <div className="vuoto">
          Nessuna lezione in questo giorno.
          <div className="piccolo" style={{ marginTop: 8 }}>
            <Link prefetch={false} href={link(spostaGiorni(giorno, 1))}>Vai al giorno successivo</Link>
          </div>
        </div>
      )}

      {/* righe compatte: ora, corso, e a fianco quanti sono (grandi), con la barra del riempimento */}
      <ul className="ag-elenco">
        {righe.map((l) => l.tipo === 'workshop' ? (
          <li key={`w${l.id}`}>
            <Link prefetch={false} className="ag-riga" href={`/gestione/workshop/${l.workshop_id}?scheda=appello&momento=${l.momento_id}`}>
              <span className="ag-banda" style={{ background: 'var(--nero)' }} />
              <span className="ag-ora"><strong>{ora(l.inizio)}</strong><span>{ora(l.fine)}</span></span>
              <span className="ag-cosa">
                <strong>{l.titolo}{l.momenti > 1 ? ` · ${l.momento}` : ''}</strong>
                <span>{['Workshop', l.sala, l.insegnante].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="ag-numeri">
                <span className="ag-conto"><strong>{l.iscritti}</strong>{l.posti ? <span>/{l.posti}</span> : null}{l.presenti > 0 && <em>{l.presenti} presenti</em>}</span>
              </span>
            </Link>
          </li>
        ) : l.tipo === 'affitto' ? (
          <li key={`a${l.id}`}>
            <Link prefetch={false} className="ag-riga" href={`/gestione/spazi?giorno=${giorno}`}>
              <span className="ag-banda" style={{ background: 'var(--verde-affitto)' }} />
              <span className="ag-ora"><strong>{ora(l.inizio)}</strong><span>{ora(l.fine)}</span></span>
              <span className="ag-cosa">
                <strong>{l.titolo || 'Affitto sala'}</strong>
                <span>{[l.sale?.nome, l.contatto_nome].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="ag-numeri"><span className="tag tag-affitto">{l.stato === 'opzione' ? 'in opzione' : 'affitto'}</span></span>
            </Link>
          </li>
        ) : (
          <li key={l.id}>
            <Link prefetch={false} className={`ag-riga${l.stato === 'annullata' ? ' annullata' : ''}`} href={`/gestione/appello/${l.id}`}>
              <span className="ag-banda" style={{ background: l.colore || 'var(--rosso)' }} />
              <span className="ag-ora"><strong>{ora(l.inizio)}</strong><span>{ora(l.fine)}</span></span>
              <span className="ag-cosa">
                <strong>{l.corso_nome}</strong>
                <span>{[l.sala_nome, l.insegnante_nome].filter(Boolean).join(' · ') || 'Sala e insegnante da assegnare'}</span>
              </span>
              <span className="ag-numeri">
                {l.stato === 'annullata' ? <span className="tag tag-neutro">Annullata</span> : (
                  <>
                    <span className="ag-conto">
                      <strong>{l.iscritti + (l.prove || 0)}</strong>
                      {l.capienza ? <span>/{l.capienza}</span> : null}
                      {l.prove > 0 && <em>{l.prove} in prova</em>}
                    </span>
                    {l.capienza > 0 && (
                      <span className="ag-barra">
                        <span style={{ width: `${Math.min(100, Math.round(((l.iscritti + (l.prove || 0)) / l.capienza) * 100))}%`,
                                       background: (l.iscritti + (l.prove || 0)) >= l.capienza ? 'var(--rosso)' : (l.colore || 'var(--rosso)') }} />
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
