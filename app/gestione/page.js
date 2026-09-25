import Link from 'next/link';
import { staffCorrente } from '@/lib/staff';
import { ora, oggiISO, euro, dataBreve } from '@/lib/formato';
import { STATI_CLIENTE, TIPI_SCADENZA } from '@/lib/stati';

export const dynamic = 'force-dynamic';

const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

// Variazione rispetto a un confronto: ▲ 12% / ▼ 5%
function Delta({ adesso, prima, suffisso = '' }) {
  if (!prima) return null;
  const d = Math.round(((adesso - prima) / prima) * 100);
  if (!Number.isFinite(d) || d === 0) return <span className="delta">stabile{suffisso}</span>;
  return <span className={`delta ${d > 0 ? 'su' : 'giu'}`}>{d > 0 ? '▲' : '▼'} {Math.abs(d)}%{suffisso}</span>;
}

// Andamento degli iscritti: barre, l'ultima evidenziata
function Andamento({ punti }) {
  if (!punti?.length) return null;
  const max = Math.max(...punti.map((p) => p.attivi), 1);
  return (
    <div className="andamento" role="img"
         aria-label={`Iscritti negli ultimi 12 mesi: da ${punti[0].attivi} a ${punti[punti.length - 1].attivi}`}>
      {punti.map((p, i) => (
        <div key={p.mese} className={i === punti.length - 1 ? 'a-barra a-ultima' : 'a-barra'}>
          <span className="a-valore">{p.attivi}</span>
          <span className="a-colonna" style={{ height: `${Math.max(4, Math.round((p.attivi / max) * 100))}%` }} />
          <span className="a-mese">{MESI[Number(p.mese.slice(5)) - 1]}</span>
        </div>
      ))}
    </div>
  );
}

// Pagina iniziale: numeri, problemi da sistemare, oggi e scadenze, tutto in una schermata
export default async function Home() {
  const { supabase, staff } = await staffCorrente();
  const p = staff.palestra_id;
  const gestione = staff.ruolo !== 'insegnante';

  let lezioniQ = supabase
    .from('v_occupazione')
    .select('lezione_id, corso_id, corso_nome, inizio, fine, stato, capienza, iscritti, prove, presenti, assenti, insegnante_id, insegnante_nome, sala_nome')
    .eq('palestra_id', p).eq('data', oggiISO()).order('inizio');
  if (!gestione) lezioniQ = lezioniQ.eq('insegnante_id', staff.id);

  const [{ data: k }, { data: lezioni }, { data: corsi }, { data: scadenze }, { count: rateScadute }] = await Promise.all([
    gestione ? supabase.rpc('cruscotto', { p_palestra: p }) : Promise.resolve({ data: null }),
    lezioniQ,
    supabase.from('corsi').select('id, colore').eq('palestra_id', p),
    gestione
      ? supabase.from('v_scadenze').select('tipo, allievo_id, nome, cognome, data, giorni, dettaglio, importo_cent')
          .eq('palestra_id', p).eq('gestito', false).in('tipo', ['abbonamento', 'ingressi', 'rata'])
          .gte('giorni', -3).lte('giorni', 7).order('data').limit(9)
      : Promise.resolve({ data: [] }),
    gestione
      ? supabase.from('v_rate').select('id', { count: 'exact', head: true }).eq('palestra_id', p).eq('scaduta', true)
      : Promise.resolve({ count: 0 }),
  ]);

  const colore = (id) => corsi?.find((c) => c.id === id)?.colore || 'var(--rosso)';
  const adesso = new Date();
  const prossima = lezioni?.find((l) => new Date(l.inizio) > adesso);
  const oraRoma = Number(adesso.toLocaleString('it-IT', { hour: 'numeric', hour12: false, timeZone: 'Europe/Rome' }));
  const saluto = oraRoma < 13 ? 'Buongiorno' : oraRoma < 18 ? 'Buon pomeriggio' : 'Buonasera';

  const problemi = k ? [
    ['Certificati scaduti o mancanti', k.certificati_scaduti, '/gestione/scadenze?tipo=certificato', 'urgente'],
    ['Presenze da segnare', k.presenze_da_segnare, '/gestione/oggi', 'urgente'],
    ['Non hanno rinnovato', k.no_rinnovo, '/gestione/persone?stato=no_rinnovo', 'urgente'],
    ['Certificati da verificare', k.certificati_da_verificare, '/gestione/certificati', 'urgente'],
    ['Richieste di affitto sala', k.spazi_da_rispondere, '/gestione/spazi', 'urgente'],
    ['Rate scadute', rateScadute, '/gestione/rate?vista=scadute', 'urgente'],
    ['Abbonamenti in scadenza entro 7 giorni', k.in_scadenza_7, '/gestione/scadenze?tipo=abbonamento', 'attenzione'],
    ['Ingressi quasi finiti', k.in_esaurimento, '/gestione/scadenze?tipo=ingressi', 'attenzione'],
    ['Iscritti senza giorni assegnati', k.senza_orari, '/gestione/persone?campanello=senza_orari', 'attenzione'],
    ['Quota annuale da pagare', k.quota_mancante, '/gestione/scadenze?tipo=quota', 'attenzione'],
    ['Lead da richiamare', k.lead_da_seguire, '/gestione/lead', 'attenzione'],
    ['Email non partite', k.messaggi_errore, '/gestione/messaggi', 'attenzione'],
    ['Iscritti che non vengono da un po\'', k.inattivi, '/gestione/persone?stato=inattivo', ''],
    ['In lista d\'attesa', k.attese, '/gestione/attese', ''],
  ].filter(([, n]) => n > 0) : [];

  const stati = k?.stati || {};
  const statiOrdinati = Object.entries(STATI_CLIENTE)
    .filter(([s]) => stati[s] > 0 && s !== 'perso' && s !== 'lead')
    .sort((a, b) => a[1].ordine - b[1].ordine);

  return (
    <>
      <div className="cruscotto-testa">
        <div>
          <div className="occhiello">
            {adesso.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Rome' })}
          </div>
          <h1>{saluto} {staff.nome}</h1>
        </div>
        {gestione && (
          <div className="azioni">
            <Link className="btn btn-primario" href="/gestione/persone/nuova">Registra una persona</Link>
            <Link className="btn" href="/gestione/incassi">Incassa</Link>
            <Link className="btn" href="/gestione/scadenze">Scadenze</Link>
          </div>
        )}
      </div>

      {gestione && k && (
        <div className="kpi">
          <Link className="tessera tessera-rossa" href="/gestione/persone?stato=attivi">
            <div className="etichetta">Iscritti attivi</div>
            <div className="cifra">{k.attivi}</div>
            <div className="sotto"><Delta adesso={k.attivi} prima={k.attivi_mese_scorso} suffisso=" su un mese fa" /></div>
          </Link>
          <Link className="tessera" href="/gestione/statistiche">
            <div className="etichetta">Venduto nel mese</div>
            <div className="cifra">{euro(k.venduto_mese)}</div>
            <div className="sotto"><Delta adesso={k.venduto_mese} prima={k.venduto_mese_scorso} suffisso=" sul mese scorso" /></div>
          </Link>
          <Link className="tessera" href="/gestione/scadenze?tipo=abbonamento">
            <div className="etichetta">Da rinnovare in 14 giorni</div>
            <div className="cifra">{k.da_rinnovare_14?.quanti ?? 0}</div>
            <div className="sotto">valgono {euro(k.da_rinnovare_14?.valore || 0)}</div>
          </Link>
          <Link className="tessera" href="/gestione/persone?stato=nuovi">
            <div className="etichetta">Nuovi nel mese</div>
            <div className="cifra">{k.nuovi_mese}</div>
            <div className="sotto">{k.prove_settimana} prove questa settimana</div>
          </Link>
          <Link className="tessera" href="/gestione/calendario">
            <div className="etichetta">Posti occupati, settimana</div>
            <div className="cifra">{k.occupazione_settimana != null ? `${k.occupazione_settimana}%` : '—'}</div>
            <div className="sotto">sui posti disponibili nelle sale</div>
          </Link>
          <Link className="tessera tessera-nera" href="/gestione/oggi">
            <div className="etichetta">Oggi</div>
            <div className="cifra">{k.lezioni_oggi}<small> lezioni</small></div>
            <div className="sotto">{k.attesi_oggi} persone attese{prossima ? ` · prossima alle ${ora(prossima.inizio)}` : ''}</div>
          </Link>
        </div>
      )}

      <div className={gestione ? 'cruscotto-3' : ''}>
        {gestione && (
          <section className="pannello">
            <h2>Da sistemare</h2>
            {problemi.length === 0
              ? <div className="vuoto">Tutto in ordine.</div>
              : (
                <div className="da-fare compatta">
                  {problemi.map(([testo, n, href, tono]) => (
                    <Link key={testo} href={href} className={tono}>
                      <span>{testo}</span>
                      <span className="conta">{n}</span>
                    </Link>
                  ))}
                </div>
              )}
          </section>
        )}

        <section className="pannello">
          <h2>{gestione ? 'Lezioni di oggi' : 'Le tue lezioni di oggi'}</h2>
          {lezioni?.length === 0 && <div className="vuoto">Nessuna lezione oggi.</div>}
          <ul className="mini-lista">
            {lezioni?.map((l) => {
              const segnate = l.presenti + l.assenti > 0;
              const passata = new Date(l.inizio) <= adesso;
              return (
                <li key={l.lezione_id}>
                  <Link href={`/gestione/appello/${l.lezione_id}`}>
                    <span className="pallino-colore" style={{ background: colore(l.corso_id) }} />
                    <span className="ml-ora">{ora(l.inizio)}</span>
                    <span className="ml-testo">
                      <strong>{l.corso_nome}</strong>
                      <span className="piccolo muto">
                        {l.iscritti}{l.capienza ? `/${l.capienza}` : ''} iscritti{l.prove > 0 ? ` · ${l.prove} in prova` : ''}
                        {l.sala_nome ? ` · ${l.sala_nome}` : ''}{gestione && l.insegnante_nome ? ` · ${l.insegnante_nome}` : ''}
                      </span>
                    </span>
                    {l.stato === 'annullata' ? <span className="tag tag-neutro">annullata</span>
                      : segnate ? <span className="tag tag-ok">fatto</span>
                      : passata ? <span className="tag tag-rosso">appello</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {gestione && (
          <section className="pannello">
            <h2>Scadenze dei prossimi giorni</h2>
            {scadenze?.length === 0 && <div className="vuoto">Nessun abbonamento in scadenza questa settimana.</div>}
            <ul className="mini-lista">
              {scadenze?.map((s) => (
                <li key={`${s.tipo}-${s.allievo_id}-${s.data}`}>
                  <Link href={`/gestione/persone/${s.allievo_id}`}>
                    <span className={`ml-giorni ${s.giorni < 0 ? 'passato' : s.giorni <= 2 ? 'vicino' : ''}`}>
                      {s.giorni < 0 ? `${-s.giorni}g fa` : s.giorni === 0 ? 'oggi' : `tra ${s.giorni}g`}
                    </span>
                    <span className="ml-testo">
                      <strong>{s.cognome} {s.nome}</strong>
                      <span className="piccolo muto">{TIPI_SCADENZA[s.tipo]} · {s.dettaglio}</span>
                    </span>
                    {s.importo_cent != null && <span className="piccolo">{euro(s.importo_cent)}</span>}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="piccolo" style={{ marginTop: 10 }}><Link href="/gestione/scadenze">Tutte le scadenze</Link></p>
          </section>
        )}
      </div>

      {gestione && k && (
        <div className="cruscotto-2">
          <section className="pannello">
            <h2>Iscritti negli ultimi 12 mesi</h2>
            <Andamento punti={k.andamento} />
          </section>
          <section className="pannello">
            <h2>Com'è messa la clientela</h2>
            <div className="pastiglie">
              {statiOrdinati.map(([s, v]) => (
                <Link key={s} className={`stato-pillola ${v.tono}`} href={`/gestione/persone?stato=${s}`}>
                  {v.testo} <strong>{stati[s]}</strong>
                </Link>
              ))}
            </div>
            {k.compleanni?.length > 0 && (
              <>
                <h3 style={{ marginTop: 14 }}>Compleanni della settimana</h3>
                <p className="piccolo">
                  {k.compleanni.map((c, i) => (
                    <span key={c.id}>
                      {i > 0 && ' · '}
                      <Link href={`/gestione/persone/${c.id}`}>{c.nome} {c.cognome}</Link>
                      {' '}<span className="muto">{c.giorni === 0 ? 'oggi' : c.giorni === 1 ? 'domani' : `tra ${c.giorni} giorni`}</span>
                    </span>
                  ))}
                </p>
              </>
            )}
            <p className="piccolo muto" style={{ marginTop: 10 }}>
              Aggiornato alle {ora(adesso)} del {dataBreve(adesso)}.
            </p>
          </section>
        </div>
      )}
    </>
  );
}
