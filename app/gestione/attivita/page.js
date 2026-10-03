import Link from 'next/link';
import { staffCorrente } from '@/lib/staff';
import { leggiPeriodo, qsPeriodo } from '@/lib/periodo';
import { euro } from '@/lib/formato';
import { Numero, Barre } from '@/lib/grafici';
import SceltaPeriodo from '../SceltaPeriodo';
import SceltaChi from './SceltaChi';

export const dynamic = 'force-dynamic';

// Le voci, divise per area. tono "male": da tenere d'occhio
const AREE = [
  ['anagrafiche', 'Anagrafiche', [
    ['anag_nuove', 'Persone nuove inserite'], ['chi_paga_nuovi', 'Nuovi "chi paga"'], ['anag_modifiche', 'Anagrafiche modificate'],
    ['anag_cancellate', 'Anagrafiche eliminate', 'male'], ['certificati', 'Certificati caricati o aggiornati'],
    ['certificati_verificati', 'Certificati verificati'], ['firme', 'Moduli fatti firmare in reception'],
  ]],
  ['iscrizioni', 'Iscrizioni e rinnovi', [
    ['iscr_nuove', 'Prime iscrizioni'], ['rinnovi', 'Rinnovi'], ['iscr_modifiche', 'Iscrizioni modificate'],
    ['iscr_cancellate', 'Iscrizioni eliminate', 'male'], ['sospensioni', 'Sospensioni'], ['quote', 'Quote annuali'],
  ]],
  ['incassi', 'Incassi e documenti', [
    ['incassi', 'Incassi registrati'], ['ricevute', 'Ricevute e fatture emesse'], ['note_credito', 'Note di credito', 'male'],
    ['incassi_modifiche', 'Incassi modificati'], ['incassi_cancellati', 'Incassi eliminati', 'male'], ['rate', 'Rate gestite'],
  ]],
  ['lezioni', 'Lezioni e appelli', [
    ['appelli', 'Appelli fatti'], ['lezioni_tenute', 'Lezioni tenute (confermate)'], ['presenze', 'Presenze segnate'],
    ['senza_appello', 'Sue lezioni finite senza appello', 'male'], ['disdette', '"Ha avvisato" segnati'],
    ['recuperi', 'Recuperi dati'], ['prenotazioni', 'Prenotazioni e recuperi inseriti'], ['lezioni_modifiche', 'Lezioni spostate o modificate'],
  ]],
  ['reception', 'Reception e contatti', [
    ['ingressi', 'Ingressi registrati'], ['contatti', 'Contatti con lead e clienti'], ['richieste', "Richieste dall'app gestite"], ['campagne', 'Campagne inviate'],
  ]],
  ['configurazione', 'Configurazione', [['configurazione', 'Corsi, orari, abbonamenti e impostazioni']]],
];
const ETICHETTA = Object.fromEntries(AREE.flatMap(([, , v]) => v.map(([k, t]) => [k, t])));
const RUOLI = { admin: 'Amministratore', segreteria: 'Segreteria', insegnante: 'Insegnante' };
const quando = (t) => (t ? new Date(t).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }) : '—');

export default async function Attivita({ searchParams }) {
  const sp = await searchParams;
  const per = leggiPeriodo(sp, 'mese');
  const qs = qsPeriodo(per);
  const { supabase, staff } = await staffCorrente();
  const p = staff.palestra_id;
  const { data: puo } = await supabase.rpc('puo_vedere_attivita', { p_palestra: p });
  if (puo !== true) {
    return (<><h1>Pagina riservata</h1><p className="muto">L'attività dello staff la vede solo chi è abilitato.</p></>);
  }
  const chi = /^[0-9a-f-]{36}$/.test(sp.chi || '') ? sp.chi : null;
  const voce = typeof sp.voce === 'string' && /^[a-z_:]{3,40}$/.test(sp.voce) ? sp.voce : null;

  const [{ data: riepilogo }, scheda, dettaglio] = await Promise.all([
    supabase.rpc('attivita_staff_riepilogo', { p_palestra: p, p_dal: per.dal, p_al: per.al }),
    chi ? supabase.rpc('attivita_staff', { p_palestra: p, p_staff: chi, p_dal: per.dal, p_al: per.al }) : Promise.resolve({ data: null }),
    chi && voce ? supabase.rpc('attivita_dettaglio', { p_palestra: p, p_staff: chi, p_voce: voce, p_dal: per.dal, p_al: per.al }) : Promise.resolve({ data: null }),
  ]);
  const persone = riepilogo || [];
  const io = chi ? persone.find((x) => x.staff_id === chi) : null;
  const v = scheda.data?.voci || {};
  const n = (k) => Number(v[k]?.n || 0);
  const link = (extra) => `/gestione/attivita?${qs}${chi ? `&chi=${chi}` : ''}${extra}`;
  const tot = persone.reduce((a, r) => ({ az: a.az + Number(r.totale), inc: a.inc + Number(r.incassato_cent), sa: a.sa + Number(r.senza_appello), ca: a.ca + Number(r.cancellazioni), att: a.att + (Number(r.totale) > 0 ? 1 : 0) }), { az: 0, inc: 0, sa: 0, ca: 0, att: 0 });

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Riservato</div>
        <h1>Attività dello staff</h1>
        <p>Cosa ha fatto ogni persona dello staff nell'app: tocca un numero per vedere il dettaglio.</p>
      </div>
      <div className="at-chi">
        <SceltaChi persone={persone} chi={chi} qs={qs} />
        {io && <span className="piccolo muto">{RUOLI[io.ruolo] || io.ruolo} · {io.accesso ? `ultimo accesso ${quando(io.ultimo_accesso)}` : 'non entra nell\'app'}</span>}
      </div>
      <SceltaPeriodo base="/gestione/attivita" per={per} altri={{ chi }} />

      {!chi && (
        <>
          <div className="st-numeri">
            <Numero titolo="Azioni nel periodo" valore={tot.az} nota={`${tot.att} persone attive`} />
            <Numero titolo="Incassi registrati" valore={euro(tot.inc)} />
            <Numero titolo="Lezioni senza appello" valore={tot.sa} tono={tot.sa ? 'male' : 'ok'} nota="finite, con persone, senza presenze" />
            <Numero titolo="Eliminazioni" valore={tot.ca} tono={tot.ca ? 'male' : null} nota="anagrafiche, iscrizioni, incassi" />
          </div>
          <section className="scheda st-blocco">
            <div className="tabella-scorre">
              <table className="at-tabella">
                <thead><tr><th>Persona</th><th>Ultimo accesso</th><th className="num">Giorni attivi</th><th className="num">Azioni</th>
                  <th className="num">Anagrafiche</th><th className="num">Iscrizioni</th><th className="num">Incassi</th><th className="num">Lezioni</th>
                  <th className="num">Reception</th><th className="num">Config.</th><th className="num">Senza appello</th><th className="num">Eliminazioni</th></tr></thead>
                <tbody>
                  {persone.filter((r) => Number(r.totale) > 0 || Number(r.senza_appello) > 0).map((r) => {
                    const a = (area, val) => (Number(val) ? <Link prefetch={false} href={`/gestione/attivita?${qs}&chi=${r.staff_id}&voce=area:${area}#dettaglio`}>{val}</Link> : <span className="muto">0</span>);
                    return (
                      <tr key={r.staff_id}>
                        <td><Link prefetch={false} href={`/gestione/attivita?${qs}&chi=${r.staff_id}`}><strong>{r.nome}</strong></Link> <span className="piccolo muto">{RUOLI[r.ruolo] || r.ruolo}</span></td>
                        <td className="piccolo">{r.accesso ? quando(r.ultimo_accesso) : <span className="muto">senza accesso</span>}</td>
                        <td className="num">{r.giorni_attivi}</td>
                        <td className="num"><strong>{r.totale}</strong></td>
                        <td className="num">{a('anagrafiche', r.anagrafiche)}</td>
                        <td className="num">{a('iscrizioni', r.iscrizioni)}</td>
                        <td className="num">{a('incassi', r.incassi)}{Number(r.incassato_cent) > 0 && <span className="piccolo muto"> · {euro(r.incassato_cent)}</span>}</td>
                        <td className="num">{a('lezioni', r.lezioni)}</td>
                        <td className="num">{a('reception', r.reception)}</td>
                        <td className="num">{a('configurazione', r.configurazione)}</td>
                        <td className="num">{Number(r.senza_appello) ? <Link prefetch={false} href={`/gestione/attivita?${qs}&chi=${r.staff_id}&voce=senza_appello#dettaglio`} style={{ color: 'var(--rosso-scuro)', fontWeight: 700 }}>{r.senza_appello}</Link> : <span className="muto">0</span>}</td>
                        <td className="num">{Number(r.cancellazioni) ? <strong style={{ color: 'var(--rosso-scuro)' }}>{r.cancellazioni}</strong> : <span className="muto">0</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {persone.some((r) => !(Number(r.totale) > 0 || Number(r.senza_appello) > 0)) && (
              <p className="at-ferme">
                <strong>Nessuna attività nel periodo:</strong>{' '}
                {persone.filter((r) => !(Number(r.totale) > 0 || Number(r.senza_appello) > 0)).map((r, i) => (
                  <span key={r.staff_id}>{i > 0 && ', '}<Link prefetch={false} href={`/gestione/attivita?${qs}&chi=${r.staff_id}`}>{r.nome}</Link>{!r.accesso && ' (senza accesso)'}</span>
                ))}
              </p>
            )}
          </section>
          <p className="st-nota">Le azioni sono quelle registrate dall'app con l'utente di ciascuno: chi non ha un accesso compare solo per appelli e lezioni tenute.</p>
        </>
      )}

      {chi && io && (
        <>
          <div className="st-numeri">
            <Numero titolo="Azioni nel periodo" valore={io.totale} />
            <Numero titolo="Giorni in cui ha lavorato nell'app" valore={io.giorni_attivi} />
            <Numero titolo="Ultima azione" valore={io.ultima_azione ? quando(io.ultima_azione).slice(0, 8) : '—'} nota={io.ultima_azione ? `alle ${quando(io.ultima_azione).slice(10)}` : null} />
            <Numero titolo="Incassato" valore={euro(io.incassato_cent)} nota={`${n('incassi')} incassi`} />
          </div>
          <div className="at-aree">
            {AREE.map(([k, titolo, voci]) => {
              const somma = voci.filter(([x]) => x !== 'senza_appello').reduce((s, [x]) => s + n(x), 0);
              return (
                <section key={k} className="scheda at-area">
                  <h3>{titolo} {somma > 0 && <Link prefetch={false} href={link(`&voce=area:${k}#dettaglio`)}>{somma} · tutto →</Link>}</h3>
                  <ul className="at-voci">
                    {voci.map(([x, t, tono]) => (
                      <li key={x} className={`${n(x) ? '' : 'zero'} ${tono === 'male' && n(x) ? 'male' : ''}`}>
                        {n(x) ? (
                          <Link prefetch={false} href={link(`&voce=${x}#dettaglio`)} aria-current={voce === x ? 'true' : undefined}>
                            <span>{t}</span><strong>{n(x)}{x === 'incassi' && v.incassi?.euro ? ` · ${euro(v.incassi.euro)}` : ''}</strong>
                          </Link>
                        ) : <span><span>{t}</span><strong>0</strong></span>}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>

          {(scheda.data?.giorni || []).length > 0 && (
            <div className="st-griglia">
              <section className="scheda st-blocco">
                <div className="st-titolo"><strong>Giorno per giorno</strong><span>azioni</span></div>
                <Barre dati={(scheda.data.giorni || []).slice(-31).map((g) => ({ etichetta: g.giorno.slice(8, 10), valore: g.n }))} />
              </section>
              <section className="scheda st-blocco">
                <div className="st-titolo"><strong>A che ora lavora</strong><span>azioni per ora del giorno</span></div>
                <Barre dati={Array.from({ length: 17 }, (_, i) => i + 7).map((h) => ({ etichetta: `${h}`, valore: (scheda.data.ore || []).find((o) => o.ora === h)?.n || 0 }))} colore="#111" />
              </section>
            </div>
          )}

          {voce && (
            <section id="dettaglio" className="scheda st-blocco" style={{ marginTop: 4 }}>
              <div className="st-titolo">
                <strong>{voce.startsWith('area:') ? AREE.find(([k]) => k === voce.slice(5))?.[1] : ETICHETTA[voce]} · {io.nome}</strong>
                <Link prefetch={false} href={link('')}>chiudi</Link>
              </div>
              {(dettaglio.data || []).length === 0 ? <p className="piccolo muto">Niente nel periodo.</p> : (
                <ul className="at-voci at-dettaglio">
                  {(dettaglio.data || []).map((r, i) => (
                    <li key={i}>
                      <span className="quando">{quando(r.quando)}</span>
                      <span>{r.descrizione}{r.importo_cent ? ` · ${euro(r.importo_cent)}` : ''}</span>
                      <span>
                        {r.persona_id && <Link prefetch={false} href={`/gestione/persone/${r.persona_id}`} className="piccolo">{r.persona || 'scheda'}</Link>}
                        {!r.persona_id && r.lezione_id && <Link prefetch={false} href={`/gestione/appello/${r.lezione_id}`} className="piccolo">lezione</Link>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {(dettaglio.data || []).length === 500 && <p className="st-nota">Mostrate le ultime 500: restringi il periodo per vedere le altre.</p>}
            </section>
          )}
        </>
      )}
    </>
  );
}
