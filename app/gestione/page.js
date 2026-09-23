import Link from 'next/link';
import { staffCorrente } from '@/lib/staff';
import { ora, oggiISO, dataBreve } from '@/lib/formato';

export const dynamic = 'force-dynamic';

// Home della gestione: com'è messa oggi la scuola e cosa c'è da fare
export default async function Home() {
  const { supabase, staff } = await staffCorrente();
  const p = staff.palestra_id;
  const gestione = staff.ruolo !== 'insegnante';

  let lezioniQ = supabase
    .from('v_occupazione')
    .select('lezione_id, corso_id, corso_nome, inizio, fine, stato, capienza, iscritti, prove, presenti, assenti, insegnante_id')
    .eq('palestra_id', p).eq('data', oggiISO()).order('inizio');
  if (!gestione) lezioniQ = lezioniQ.eq('insegnante_id', staff.id);

  const [{ data: k }, { data: lezioni }, { data: corsi }, { data: avvisi }, { data: eventi }] = await Promise.all([
    supabase.rpc('oggi', { p_palestra: p }),
    lezioniQ,
    supabase.from('corsi').select('id, colore').eq('palestra_id', p),
    supabase.from('bacheca').select('id, titolo, testo, tipo, dal, al')
      .eq('palestra_id', p).neq('visibilita', 'nascosto')
      .or(`al.is.null,al.gte.${new Date().toISOString()}`)
      .order('created_at', { ascending: false }).limit(3),
    supabase.from('eventi').select('id, titolo, inizio, luogo').eq('palestra_id', p)
      .gte('inizio', new Date().toISOString()).order('inizio').limit(3),
  ]);

  const colore = (id) => corsi?.find((c) => c.id === id)?.colore || 'var(--rosso)';
  const adesso = new Date();
  const prossima = lezioni?.find((l) => new Date(l.inizio) > adesso);
  const daFare = [
    ['Presenze da segnare', k?.presenze_da_segnare, '/gestione', 'urgente'],
    ['Certificati da verificare', k?.certificati_da_verificare, '/gestione/certificati', 'urgente'],
    ['Certificati scaduti', k?.certificati_scaduti, '/gestione/certificati', 'attenzione'],
    ['Richieste di affitto sala', k?.spazi_da_rispondere, '/gestione/spazi', 'urgente'],
    ['Lead da richiamare', k?.lead_da_seguire, '/gestione/lead', 'attenzione'],
    ['Abbonamenti in scadenza', k?.abbonamenti_in_scadenza, '/gestione/persone', 'attenzione'],
    ['In lista d\'attesa', k?.attese, '/gestione/attese', ''],
  ].filter(([, n]) => gestione && n > 0);

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">{new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <h1>Ciao {staff.nome}</h1>
        <p>
          {k?.lezioni_oggi > 0
            ? `Oggi ${k.lezioni_oggi} lezioni, ${k.iscritti_oggi} presenze attese${k.prove_oggi > 0 ? ` e ${k.prove_oggi} in prova` : ''}.`
            : 'Oggi non ci sono lezioni in programma.'}
        </p>
      </div>

      <div className="griglia">
        <div className="tessera tessera-rossa">
          <div className="etichetta">Lezioni oggi</div>
          <div className="cifra">{k?.lezioni_oggi ?? 0}</div>
          <div className="sotto">{prossima ? `prossima alle ${ora(prossima.inizio)}` : 'giornata finita'}</div>
        </div>
        <div className="tessera">
          <div className="etichetta">Persone attese</div>
          <div className="cifra">{k?.iscritti_oggi ?? 0}</div>
          <div className="sotto">{k?.prove_oggi ?? 0} in prova</div>
        </div>
        {gestione && (
          <Link className="tessera" href="/gestione/lead">
            <div className="etichetta">Prove in arrivo</div>
            <div className="cifra">{k?.prove_in_arrivo ?? 0}</div>
            <div className="sotto">da accogliere</div>
          </Link>
        )}
        {gestione && (
          <Link className="tessera tessera-nera" href="/gestione/statistiche">
            <div className="etichetta">Lead da seguire</div>
            <div className="cifra">{k?.lead_da_seguire ?? 0}</div>
            <div className="sotto">vedi le statistiche</div>
          </Link>
        )}
      </div>

      <div className="doppia" style={{ marginTop: 4 }}>
        <div>
      <h2 className="sezione">Lezioni di oggi</h2>
      {lezioni?.length === 0 && (
        <div className="vuoto">
          Nessuna lezione oggi.
          <div className="piccolo" style={{ marginTop: 8 }}><Link href="/gestione/calendario">Vai alla settimana</Link></div>
        </div>
      )}
      {lezioni?.map((l) => {
        const segnate = l.presenti + l.assenti > 0;
        const pieno = l.capienza ? Math.min(100, Math.round(((l.iscritti + l.prove) / l.capienza) * 100)) : 0;
        return (
          <Link key={l.lezione_id} className="scheda-corso" href={`/gestione/appello/${l.lezione_id}`}>
            <span className="banda" style={{ background: colore(l.corso_id) }} />
            <span className="centro">
              <span className="ora-grande">{ora(l.inizio)}</span>
              <span className="titolo" style={{ display: 'block' }}>{l.corso_nome}</span>
              <span className="riga">
                {l.iscritti} iscritti{l.capienza ? ` su ${l.capienza}` : ''}
                {l.prove > 0 && ` · ${l.prove} in prova`}
                {segnate && ` · ${l.presenti} presenti`}
              </span>
              {l.capienza > 0 && <span className="riempimento"><span style={{ width: `${pieno}%`, background: colore(l.corso_id) }} /></span>}
            </span>
            <span className="destra">
              {l.stato === 'annullata'
                ? <span className="tag tag-neutro">Annullata</span>
                : segnate
                  ? <span className="tag tag-ok">Fatto</span>
                  : new Date(l.inizio) <= adesso
                    ? <span className="tag tag-rosso">Appello</span>
                    : <span className="tag tag-tenue">tra poco</span>}
            </span>
          </Link>
        );
      })}

        </div>

        <aside>
          {daFare.length > 0 && (
            <>
              <h2 className="sezione" style={{ marginTop: 18 }}>Da fare</h2>
              <div className="da-fare">
                {daFare.map(([testo, n, href, tono]) => (
                  <Link key={testo} href={href} className={tono}>
                    <span>{testo}</span>
                    <span className="conta">{n}</span>
                  </Link>
                ))}
              </div>
            </>
          )}

      {avvisi?.length > 0 && (
        <>
          <h2 className="sezione">In bacheca</h2>
          {avvisi.map((a) => (
            <div key={a.id} className="avviso-card">
              <h3>{a.titolo}</h3>
              <p>{(a.testo || '').slice(0, 180)}{(a.testo || '').length > 180 ? '…' : ''}</p>
            </div>
          ))}
          {gestione && <p className="piccolo"><Link href="/gestione/bacheca">Gestisci la bacheca</Link></p>}
        </>
      )}

      {eventi?.length > 0 && (
        <>
          <h2 className="sezione">Prossimi eventi</h2>
          {eventi.map((e) => (
            <div key={e.id} className="scheda-corso" style={{ gridTemplateColumns: '6px 1fr' }}>
              <span className="banda" style={{ background: 'var(--nero)' }} />
              <span className="centro">
                <span className="titolo">{e.titolo}</span>
                <span className="riga">{dataBreve(e.inizio)} · {ora(e.inizio)}{e.luogo ? ` · ${e.luogo}` : ''}</span>
              </span>
            </div>
          ))}
        </>
      )}
        </aside>
      </div>
    </>
  );
}
