import Link from 'next/link';
import LinkVeloce from './LinkVeloce';
import CercaVeloce from './CercaVeloce';
import Promemoria from './Promemoria';
import PannelloNotizie from './PannelloNotizie';
import { staffCorrente } from '@/lib/staff';
import { periodoPredefinito } from '@/lib/stagione';
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

const MESI_LUNGHI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

// Euro senza centesimi: nelle tessere del Riepilogo conta il numero intero (e così ci sta)
const euroTondo = (cent) => euro(Math.round((Number(cent) || 0) / 100) * 100);

// Pagina iniziale: numeri, problemi da sistemare, oggi e scadenze, tutto in una schermata
export default async function Home({ searchParams }) {
  const { scegli } = (await searchParams) || {};
  const { supabase, staff } = await staffCorrente();
  const p = staff.palestra_id;
  const gestione = staff.ruolo !== 'insegnante';

  // tutto il Riepilogo con una chiamata sola (query 144); se la funzione manca, le letture una per una
  const [{ data: insieme, error: erroreInsieme }, periodo] = await Promise.all([
    supabase.rpc('home_dati', { p_palestra: p }),
    gestione ? periodoPredefinito() : Promise.resolve('stagione'),
  ]);
  const d = !erroreInsieme && insieme ? {
    k: insieme.k, lezioni: insieme.lezioni, corsi: insieme.corsi, scadenze: insieme.scadenze, rateScadute: insieme.rate_scadute,
    richieste: insieme.richieste, promemoria: insieme.promemoria, staffRighe: insieme.staff, sostituzioni: insieme.sostituzioni,
    prossime: insieme.prossime, daSistemare: insieme.da_sistemare, daVerificare: insieme.da_verificare, fatturato: insieme.fatturato,
  } : await caricaSeparato(supabase, staff, p, gestione);
  const { k, lezioni, corsi, scadenze, rateScadute, richieste, promemoria, staffRighe, sostituzioni, prossime, daSistemare, daVerificare, fatturato } = d;

  const colore = (id) => corsi?.find((c) => c.id === id)?.colore || 'var(--rosso)';
  const elencoStaff = (staffRighe || []).map((s) => ({ id: s.id, nome: `${s.nome} ${s.cognome || ''}`.trim() }));
  const nomeStaff = (id) => elencoStaff.find((s) => s.id === id)?.nome || 'nessuno';
  const adesso = new Date();
  const prossima = lezioni?.find((l) => new Date(l.inizio) > adesso);
  const oraRoma = Number(adesso.toLocaleString('it-IT', { hour: 'numeric', hour12: false, timeZone: 'Europe/Rome' }));
  const saluto = oraRoma < 13 ? 'Buongiorno' : oraRoma < 18 ? 'Buon pomeriggio' : 'Buonasera';

  const problemi = k ? [
    ['Richieste dall\'app da confermare', richieste, '/gestione/richieste', 'urgente'],
    ['Certificati scaduti o mancanti', k.certificati_scaduti, '/gestione/scadenze?tipo=certificato', 'urgente'],
    ['Presenze da segnare', k.presenze_da_segnare, '/gestione/oggi', 'urgente'],
    ['Non hanno rinnovato', k.no_rinnovo, '/gestione/persone?stato=no_rinnovo', 'urgente'],
    ['Certificati da verificare', k.certificati_da_verificare, '/gestione/certificati', 'urgente'],
    ['Richieste di affitto sala', k.spazi_da_rispondere, '/gestione/spazi', 'urgente'],
    ['Rate scadute', rateScadute, '/gestione/rate?vista=scadute', 'urgente'],
    ['Da sistemare dopo l\'import', daSistemare, '/gestione/da-sistemare', 'urgente'],
    ['Da verificare dopo l\'import', daVerificare, '/gestione/da-sistemare', 'attenzione'],
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
    <div className={gestione ? 'home-con-notizie' : undefined}>
    <div className="home-principale">
      <div className="cruscotto-testa">
        <div>
          <div className="occhiello">
            {adesso.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Rome' })}
          </div>
          <h1>{saluto} {staff.nome}</h1>
        </div>
        {gestione && (
          <div className="azioni">
            <LinkVeloce className="btn btn-primario btn-sportello" href="/gestione/sportello">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /><path d="M18.5 7v6M15.5 10h6" /></svg>
              Sportello
            </LinkVeloce>
            <LinkVeloce className="btn" href="/gestione/persone/nuova">Nuovo cliente</LinkVeloce>
            <LinkVeloce className="btn" href="/gestione?scegli=incassa">Incassa</LinkVeloce>
            <LinkVeloce className="btn" href="/gestione/scadenze">Scadenze</LinkVeloce>
            <LinkVeloce className="btn" href="/gestione/prenotazioni">Prenotazioni</LinkVeloce>
          </div>
        )}
      </div>

      {gestione && <CercaVeloce palestraId={p} key={scegli || 'cerca'} modoIniziale={scegli === 'incassa' ? 'incassa' : 'scheda'} />}

      {/* i numeri del giorno in una riga sola e bassa: sotto, subito, le cose da fare */}
      {gestione && k && (() => {
        const inizioF = fatturato ? new Date(`${fatturato.inizio_stagione}T12:00:00Z`) : null;
        const annoF = inizioF?.getUTCFullYear();
        const meseOra = MESI_LUNGHI[Number(adesso.toLocaleDateString('it-IT', { month: 'numeric', timeZone: 'Europe/Rome' })) - 1];
        const fat = !fatturato ? null : periodo === 'anno'
          ? { chiave: 'anno', titolo: `Fatturato ${adesso.toLocaleDateString('it-IT', { year: 'numeric', timeZone: 'Europe/Rome' })}`,
              valore: fatturato.anno, prima: fatturato.anno_prima, da: 'dal 1° gennaio' }
          : { chiave: 'stagione', titolo: `Fatturato ${annoF}/${String(annoF + 1).slice(2)}`,
              valore: fatturato.stagione, prima: fatturato.stagione_prima, da: `dal 1° ${MESI_LUNGHI[inizioF.getUTCMonth()]}` };
        return (
          <div className="kpi-home">
            <LinkVeloce className="tessera tessera-rossa" href="/gestione/persone?stato=attivi">
              <div className="etichetta">Iscritti attivi</div>
              <div className="cifra">{k.attivi}</div>
              <div className="sotto"><Delta adesso={k.attivi} prima={k.attivi_mese_scorso} suffisso=" su un mese fa" /></div>
            </LinkVeloce>
            {fat && (
              <LinkVeloce className="tessera" href={`/gestione/statistiche/economia?p=${fat.chiave}`}
                          title={`Incassi registrati ${fat.da} (il periodo si sceglie in Impostazioni → Regole). ${meseOra}: ${euro(fatturato.mese)}`}>
                <div className="etichetta">{fat.titolo}</div>
                <div className="cifra">{euroTondo(fat.valore)}</div>
                <div className="sotto">{meseOra} {euroTondo(fatturato.mese)}{fat.prima > 0 && <> · <Delta adesso={fat.valore} prima={fat.prima} /></>}</div>
              </LinkVeloce>
            )}
            <LinkVeloce className="tessera" href="/gestione/statistiche">
              <div className="etichetta">Venduto nel mese</div>
              <div className="cifra">{euroTondo(k.venduto_mese)}</div>
              <div className="sotto"><Delta adesso={k.venduto_mese} prima={k.venduto_mese_scorso} suffisso=" sul mese scorso" /></div>
            </LinkVeloce>
            <LinkVeloce className="tessera" href="/gestione/scadenze?tipo=abbonamento">
              <div className="etichetta">Da rinnovare (14 gg)</div>
              <div className="cifra">{k.da_rinnovare_14?.quanti ?? 0}</div>
              <div className="sotto">valgono {euroTondo(k.da_rinnovare_14?.valore || 0)}</div>
            </LinkVeloce>
            <LinkVeloce className="tessera" href="/gestione/persone?stato=nuovi">
              <div className="etichetta">Nuovi nel mese</div>
              <div className="cifra">{k.nuovi_mese}</div>
              <div className="sotto">{k.prove_settimana} {k.prove_settimana === 1 ? 'prova' : 'prove'} in settimana</div>
            </LinkVeloce>
            <LinkVeloce className="tessera" href="/gestione/calendario" title="Posti occupati questa settimana, sui posti disponibili nelle sale">
              <div className="etichetta">Posti occupati</div>
              <div className="cifra">{k.occupazione_settimana != null ? `${k.occupazione_settimana}%` : '—'}</div>
              <div className="sotto">questa settimana</div>
            </LinkVeloce>
            <LinkVeloce className="tessera tessera-nera" href="/gestione/oggi">
              <div className="etichetta">Oggi</div>
              <div className="cifra">{k.lezioni_oggi}<small> lezioni</small></div>
              <div className="sotto">{k.attesi_oggi} attese{prossima ? ` · prossima ${ora(prossima.inizio)}` : ''}</div>
            </LinkVeloce>
          </div>
        );
      })()}

      {/* segreteria: tutta la lista (con per chi è); gli altri: solo le cose assegnate a loro */}
      <Promemoria palestraId={p} voci={promemoria || []} oggi={oggiISO()} gestione={gestione} staff={elencoStaff || []} />

      {gestione && sostituzioni?.length > 0 && (
        <section className="pannello sostituzioni">
          <h2>Sostituzioni dei prossimi giorni <span className="conta-rossa">{sostituzioni.length}</span></h2>
          <ul className="mini-lista">
            {sostituzioni.map((s) => (
              <li key={s.id}>
                <Link prefetch={false} href={`/gestione/appello/${s.id}`}>
                  <span className="ml-ora">{new Date(s.inizio).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', timeZone: 'Europe/Rome' })} {ora(s.inizio)}</span>
                  <span className="ml-testo">
                    <strong>{s.corsi?.nome}</strong>
                    <span className="piccolo muto"><b>{nomeStaff(s.insegnante_id)}</b> al posto di {nomeStaff(s.insegnante_titolare)}{s.sostituzione_da ? ` · cambio di ${nomeStaff(s.sostituzione_da)}` : ''}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
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
                    <Link prefetch={false} key={testo} href={href} className={tono}>
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
                    {l.stato === 'annullata' ? <span className="tag tag-neutro">annullata</span>
                      : segnate ? <span className="tag tag-ok">fatto</span>
                      : passata ? <span className="tag tag-rosso">appello</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {!gestione && prossime?.length > 0 && (
          <section className="pannello">
            <h2>Le prossime</h2>
            <ul className="mini-lista">
              {prossime.map((l) => (
                <li key={l.lezione_id}>
                  <Link prefetch={false} href={`/gestione/appello/${l.lezione_id}`}>
                    <span className="pallino-colore" style={{ background: colore(l.corso_id) }} />
                    <span className="ml-ora">{new Date(l.inizio).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', timeZone: 'Europe/Rome' })}</span>
                    <span className="ml-testo">
                      <strong>{l.corso_nome}</strong>
                      <span className="piccolo muto">{ora(l.inizio)} · {l.iscritti}{l.capienza ? `/${l.capienza}` : ''} iscritti{l.sala_nome ? ` · ${l.sala_nome}` : ''}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {gestione && (
          <section className="pannello">
            <h2>Scadenze dei prossimi giorni</h2>
            {scadenze?.length === 0 && <div className="vuoto">Nessun abbonamento in scadenza questa settimana.</div>}
            <ul className="mini-lista">
              {scadenze?.map((s) => (
                <li key={`${s.tipo}-${s.allievo_id}-${s.data}`}>
                  <Link prefetch={false} href={`/gestione/persone/${s.allievo_id}`}>
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
            <p className="piccolo" style={{ marginTop: 10 }}><Link prefetch={false} href="/gestione/scadenze">Tutte le scadenze</Link></p>
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
                <Link prefetch={false} key={s} className={`stato-pillola ${v.tono}`} href={`/gestione/persone?stato=${s}`}>
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
                      <Link prefetch={false} href={`/gestione/persone/${c.id}`}>{c.nome} {c.cognome}</Link>
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
    </div>
    {/* schermi larghi: a destra le notizie (prenotazioni, disdette, prove, certificati da verificare, richieste, notifiche) */}
    {gestione && <PannelloNotizie palestraId={p} />}
    </div>
  );
}

// Riserva: le stesse letture una per una (se la funzione home_dati della query 144 non c'è ancora)
async function caricaSeparato(supabase, staff, p, gestione) {
  let lezioniQ = supabase
    .from('v_occupazione')
    .select('lezione_id, corso_id, corso_nome, inizio, fine, stato, capienza, iscritti, prove, presenti, assenti, insegnante_id, insegnante_nome, sala_nome')
    .eq('palestra_id', p).eq('data', oggiISO()).order('inizio');
  if (!gestione) lezioniQ = lezioniQ.eq('insegnante_id', staff.id);

  const fra14 = new Date(Date.now() + 14 * 86400000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
  const [{ data: k }, { data: lezioni }, { data: corsi }, { data: scadenze }, { count: rateScadute }, { count: richieste }, { data: promemoria },
         { data: staffRighe }, { data: sostituzioni }, { data: prossime }, { count: daSistemare }, { count: daVerificare }] = await Promise.all([
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
    // richieste fatte dai clienti dall'app (abbonamenti con bonifico, lezioni private)
    supabase.from('richieste_cliente').select('id', { count: 'exact', head: true }).eq('palestra_id', p).eq('stato', 'da_confermare'),
    // promemoria di oggi, quelli rimasti indietro non fatti, e quelli fatti oggi (per chi è collegato)
    supabase.rpc('promemoria_miei', { p_palestra: p }),
    // a chi si può assegnare una cosa da fare
    gestione ? supabase.from('staff').select('id, nome, cognome')
      .eq('palestra_id', p).eq('attivo', true).not('archiviato', 'is', true).order('nome') : Promise.resolve({ data: [] }),
    // sostituzioni dei prossimi 14 giorni (lezioni passate a un'altra insegnante)
    gestione ? supabase.from('lezioni')
      .select('id, data, inizio, insegnante_id, insegnante_titolare, sostituzione_da, corsi ( nome )')
      .eq('palestra_id', p).not('insegnante_titolare', 'is', null).neq('stato', 'annullata')
      .gte('data', oggiISO()).lte('data', fra14).order('inizio').limit(30) : Promise.resolve({ data: [] }),
    // per l'insegnante: le sue prossime lezioni dei giorni seguenti
    gestione ? Promise.resolve({ data: null }) : supabase.from('v_occupazione')
      .select('lezione_id, corso_id, corso_nome, inizio, capienza, iscritti, sala_nome')
      .eq('palestra_id', p).eq('insegnante_id', staff.id).gt('data', oggiISO()).neq('stato', 'annullata')
      .order('inizio').limit(6),
    // quello che non torna dopo l'import da APP Palestre
    gestione ? supabase.from('anomalie_import').select('id', { count: 'exact', head: true })
      .eq('palestra_id', p).eq('risolta', false).eq('gravita', 'da_sistemare') : Promise.resolve({ count: 0 }),
    gestione ? supabase.from('anomalie_import').select('id', { count: 'exact', head: true })
      .eq('palestra_id', p).eq('risolta', false).eq('gravita', 'da_verificare') : Promise.resolve({ count: 0 }),
  ]);

  return { k, lezioni, corsi, scadenze, rateScadute, richieste, promemoria, staffRighe, sostituzioni, prossime, daSistemare, daVerificare };
}
