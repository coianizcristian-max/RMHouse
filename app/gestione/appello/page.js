import Link from 'next/link';
import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import { ora, oggiISO } from '@/lib/formato';

export const dynamic = 'force-dynamic';

// Il tasto "Appello" della barra in basso: porta dritto alla lezione giusta.
// - insegnante: la sua lezione in corso (o la prossima di oggi, o l'ultima appena finita)
// - segreteria: se c'è una sola lezione adesso entra lì, altrimenti sceglie fra quelle di adesso e di dopo
export default async function SceltaAppello() {
  const { supabase, staff } = await staffCorrente();
  const gestione = staff.ruolo !== 'insegnante';
  let q = supabase.from('v_occupazione')
    .select('lezione_id, corso_id, corso_nome, inizio, fine, stato, capienza, iscritti, prove, presenti, assenti, insegnante_id, insegnante_nome, sala_nome')
    .eq('palestra_id', staff.palestra_id).eq('data', oggiISO()).neq('stato', 'annullata').order('inizio');
  if (!gestione) q = q.eq('insegnante_id', staff.id);
  const [{ data: lezioni }, { data: corsi }, { data: wsGiorno }] = await Promise.all([
    q, supabase.from('corsi').select('id, colore').eq('palestra_id', staff.palestra_id),
    // i workshop di oggi (l'appello si fa nella scheda del workshop: per ora la apre solo la segreteria)
    gestione ? supabase.rpc('workshop_del_giorno', { p_palestra: staff.palestra_id }) : Promise.resolve({ data: [] }),
  ]);
  const workshop = Array.isArray(wsGiorno) ? wsGiorno : [];
  const t = Date.now();
  const tutte = lezioni || [];
  // "adesso": da mezz'ora prima dell'inizio a mezz'ora dopo la fine
  const adesso = tutte.filter((l) => new Date(l.inizio).getTime() - 30 * 60000 <= t && new Date(l.fine).getTime() + 30 * 60000 >= t);
  const dopo = tutte.filter((l) => new Date(l.inizio).getTime() - 30 * 60000 > t);
  const prima = tutte.filter((l) => new Date(l.fine).getTime() + 30 * 60000 < t).reverse();

  const wsAdesso = workshop.filter((m) => new Date(m.inizio).getTime() - 30 * 60000 <= t && new Date(m.fine).getTime() + 30 * 60000 >= t);
  if (adesso.length === 1 && !wsAdesso.length) redirect(`/gestione/appello/${adesso[0].lezione_id}`);
  if (!gestione && adesso.length === 0 && dopo.length > 0 && prima.length === 0) redirect(`/gestione/appello/${dopo[0].lezione_id}`);

  const colore = (id) => corsi?.find((c) => c.id === id)?.colore || 'var(--rosso)';
  const riga = (l) => {
    const segnate = l.presenti + l.assenti > 0;
    return (
      <li key={l.lezione_id}>
        <Link prefetch={false} href={`/gestione/appello/${l.lezione_id}`}>
          <span className="pallino-colore" style={{ background: colore(l.corso_id) }} />
          <span className="ml-ora">{ora(l.inizio)}</span>
          <span className="ml-testo">
            <strong>{l.corso_nome}</strong>
            <span className="piccolo muto">
              {l.iscritti}{l.capienza ? `/${l.capienza}` : ''} iscritti{l.prove > 0 ? ` · ${l.prove} in prova` : ''}
              {l.sala_nome ? ` · ${l.sala_nome}` : ''}{gestione && l.insegnante_nome ? ` · ${l.insegnante_nome}` : ''}
            </span>
          </span>
          {segnate ? <span className="tag tag-ok">fatto</span> : new Date(l.inizio).getTime() <= t ? <span className="tag tag-rosso">da fare</span> : null}
        </Link>
      </li>
    );
  };
  const blocco = (titolo, el) => el.length > 0 && (
    <section className="pannello" style={{ marginBottom: 12 }}>
      <h2>{titolo}</h2>
      <ul className="mini-lista">{el.map(riga)}</ul>
    </section>
  );

  return (
    <>
      <div className="ap-testa"><div><h1>Appello</h1><p>{gestione ? 'Le lezioni di oggi: tocca quella in cui entrare.' : 'Le tue lezioni di oggi.'}</p></div></div>
      {workshop.length > 0 && (
        <section className="pannello" style={{ marginBottom: 12 }}>
          <h2>Workshop di oggi</h2>
          <ul className="mini-lista">
            {workshop.map((m) => (
              <li key={m.momento_id}>
                <Link prefetch={false} href={`/gestione/workshop/${m.workshop_id}?scheda=appello&momento=${m.momento_id}`}>
                  <span className="pallino-colore" style={{ background: 'var(--nero)' }} />
                  <span className="ml-ora">{ora(m.inizio)}</span>
                  <span className="ml-testo">
                    <strong>{m.titolo}{m.momenti > 1 ? ` · ${m.momento}` : ''}</strong>
                    <span className="piccolo muto">
                      {m.iscritti}{m.posti ? `/${m.posti}` : ''} iscritti{m.sala ? ` · ${m.sala}` : ''}{m.insegnante ? ` · ${m.insegnante}` : ''}
                    </span>
                  </span>
                  {m.presenti > 0 ? <span className="tag tag-ok">{m.presenti} presenti</span>
                    : new Date(m.inizio).getTime() <= t ? <span className="tag tag-rosso">da fare</span> : <span className="tag tag-neutro">workshop</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {tutte.length === 0 && workshop.length === 0 && <div className="vuoto">{gestione ? 'Nessuna lezione oggi.' : 'Oggi non hai lezioni.'} <Link prefetch={false} href="/gestione/calendario">Apri il palinsesto</Link></div>}
      {blocco('Adesso', adesso)}
      {blocco('Dopo', dopo)}
      {blocco('Già finite', prima)}
    </>
  );
}
