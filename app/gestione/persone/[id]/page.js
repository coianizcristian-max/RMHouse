import Link from 'next/link';
import { gruppoDiOrari } from '@/lib/gruppi';
import { stripeAttivo } from '@/lib/stripe';
import { notFound, redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import { dataBreve, ora, etaAl, euro } from '@/lib/formato';
import { STATI_CLIENTE, statoTesto } from '@/lib/stati';
import { genere } from '@/lib/genere';
import Anagrafica from './Anagrafica';
import Iscrizioni from './Iscrizioni';
import RinnoviAutomatici from './RinnoviAutomatici';
import Recuperi from './Recuperi';
import ProssimeLezioni from './ProssimeLezioni';
import EtichettePersona from './EtichettePersona';
import Privacy from './Privacy';
import ModuliPersona from './ModuliPersona';
import Pagamenti from './Pagamenti';
import UnisciPersona from './UnisciPersona';

export const dynamic = 'force-dynamic';

const whatsapp = (tel) => {
  const n = String(tel || '').replace(/[^\d+]/g, '').replace(/^\+/, '');
  return n ? `https://wa.me/${n.length <= 10 ? '39' + n : n}` : null;
};

// Scheda della persona: in alto chi è e com'è messa, sotto a sinistra
// quello che si fa (iscrizioni, giorni, recuperi), a destra i dati
export default async function Persona({ params, searchParams }) {
  const { id } = await params;
  const { iscrivi, incassa } = await searchParams;
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const p = staff.palestra_id;

  const { data: allievo } = await supabase
    .from('allievi')
    .select('*, account ( id, nome, cognome, email, telefono, codice_fiscale, consenso_marketing, consenso_privacy_at )')
    .eq('id', id).maybeSingle();
  if (!allievo) notFound();

  const [{ data: stato }, { data: iscrizioni }, { data: crediti }, { data: prove }, { data: certificati },
         { data: corsi }, { data: tipi }, { data: orari }, { data: palestra }, { data: storico, count: storicoTotale },
         { data: etichette }, { data: famiglia }, { data: famigliaIscritta }, { data: moduli }, { data: firme },
         { data: pagamenti }, { data: rinnovi }] = await Promise.all([
    supabase.from('v_stato_clienti').select('stato, attivo, fine_prossima, prima_data, ultima_fine, certificato_scaduto, quota_mancante, quota_valida_fino, senza_orari, etichette_id, giorni_al_compleanno, ultima_presenza')
      .eq('id', id).maybeSingle(),
    supabase.from('iscrizioni')
      .select('id, palestra_id, tipo_abbonamento_id, data_inizio, data_fine, stato, sconto_cent, note, ingressi_residui, corsi ( id, nome ), tipi_abbonamento ( nome, modalita, lezioni_settimanali, prezzo_cent ), iscrizioni_orari ( orario_id )')
      .eq('allievo_id', id).order('data_inizio', { ascending: false }),
    supabase.from('v_crediti').select('*').eq('allievo_id', id).order('scadenza', { ascending: false }),
    supabase.from('prove')
      .select('id, stato, prezzo_cent, corsi ( nome ), lezioni ( inizio )')
      .eq('allievo_id', id).order('created_at', { ascending: false }).limit(10),
    supabase.from('certificati').select('id, scadenza, stato, caricato_at').eq('allievo_id', id)
      .order('caricato_at', { ascending: false }).limit(5),
    supabase.from('corsi').select('id, nome').eq('palestra_id', p).eq('attivo', true).order('nome'),
    supabase.from('tipi_abbonamento')
      .select('id, nome, codice, famiglia, gruppo_id, modalita, durata_mesi, durata_giorni, scadenza_fine_mese, prezzo_cent, tipi_abbonamento_corsi ( corso_id )')
      .eq('palestra_id', p).eq('attivo', true).eq('archiviato', false).order('famiglia').order('nome'),
    supabase.from('orari').select('id, corso_id, giorno_settimana, ora_inizio, gruppo').eq('palestra_id', p).eq('attivo', true)
      .order('giorno_settimana').order('ora_inizio'),
    supabase.from('palestre').select('base_url, quota_iscrizione_cent, sconti, ente, mese_fine_stagione, mese_inizio_annuale').eq('id', p).maybeSingle(),
    supabase.from('storico_abbonamenti').select('id, abbonamento, dal, al, stato, valore_cent', { count: 'exact' })
      .eq('allievo_id', id).order('dal', { ascending: false }).limit(60),
    supabase.from('etichette').select('id, nome').eq('palestra_id', p).order('nome'),
    supabase.from('allievi').select('id, nome, cognome').eq('account_id', allievo.account_id).neq('id', id),
    supabase.from('iscrizioni').select('allievo_id, allievi!inner ( account_id )').eq('allievi.account_id', allievo.account_id)
      .eq('stato', 'attiva').neq('allievo_id', id),
    supabase.rpc('moduli_da_firmare', { p_allievo: id }),
    supabase.from('firme').select('id, modulo_id, versione, titolo, firmato_at').eq('allievo_id', id).order('firmato_at', { ascending: false }),
    // i suoi pagamenti, più quelli della famiglia che non dicono per chi sono
    supabase.from('pagamenti').select('*')
      .eq('palestra_id', p).or(`allievo_id.eq.${id},and(account_id.eq.${allievo.account_id},allievo_id.is.null)`)
      .order('created_at', { ascending: false }).limit(100),
    supabase.from('abbonamenti_ricorrenti').select('id, stato, importo_cent, tipi_abbonamento ( nome ), corsi ( nome )')
      .eq('allievo_id', id).neq('stato', 'annullato'),
  ]);
  const { data: ricevute } = (pagamenti || []).length
    ? await supabase.from('ricevute').select('id, pagamento_id, numero, anno, tipo_documento, annullata').in('pagamento_id', pagamenti.map((x) => x.id))
    : { data: [] };
  // le sue prossime lezioni (fisse, prenotate, recuperi, prove) nei prossimi 30 giorni, e le disdette già fatte
  const fra30 = new Date(Date.now() + 30 * 86400000).toLocaleDateString('sv-SE');
  const { data: partecipa } = await supabase.from('v_partecipanti_lezione').select('lezione_id, tipo, riferimento_id').eq('allievo_id', id);
  const idLez = (partecipa || []).map((x) => x.lezione_id);
  const [{ data: lezProssime }, { data: disdette }] = idLez.length
    ? await Promise.all([
        supabase.from('v_lezioni').select('id, corso_nome, inizio, sala_nome, insegnante_nome').in('id', idLez).eq('stato', 'programmata')
          .gt('inizio', new Date().toISOString()).lte('data', fra30).order('inizio').limit(40),
        supabase.from('assenze_avvisate').select('lezione_id').eq('allievo_id', id).in('lezione_id', idLez),
      ])
    : [{ data: [] }, { data: [] }];
  const partDi = Object.fromEntries((partecipa || []).map((x) => [x.lezione_id, x]));
  const prossime = (lezProssime || []).map((l) => ({ ...l, tipo: partDi[l.id]?.tipo, riferimento_id: partDi[l.id]?.riferimento_id }));

  const linkCertificato = `${palestra?.base_url || ''}/certificato?t=${allievo.token}`;
  // aveva solo abbonamenti annullati: non è un "lead" né "mai iscritto", ha lasciato
  const ritirato = !stato?.attivo && !stato?.ultima_fine && (iscrizioni || []).some((i) => i.stato === 'annullata');
  const st = ritirato ? { testo: 'Ritirato/a', m: 'Ritirato', f: 'Ritirata', tono: 'neutro' } : STATI_CLIENTE[stato?.stato];
  const attive = (iscrizioni || []).filter((i) => i.stato === 'attiva' || i.stato === 'sospesa');
  const spesoStorico = (storico || []).reduce((s, x) => s + (x.valore_cent || 0), 0);
  const speso = spesoStorico + (pagamenti || []).filter((x) => x.stato === 'pagato').reduce((s, x) => s + x.importo_cent, 0);
  const tel = allievo.account?.telefono;
  const wa = whatsapp(tel);
  const g = genere(allievo);
  const nato = g === 'F' ? 'nata' : g === 'M' ? 'nato' : 'nato/a';

  const quotaValida = !!stato?.quota_valida_fino && stato.quota_valida_fino > new Date().toISOString().slice(0, 10);

  return (
    <div className="scheda-persona">
      <Link prefetch={false} className="torna" href="/gestione/persone">Tutte le persone</Link>

      {/* la testa della scheda: chi è e cosa fa, poi le azioni; sotto, i corsi e la famiglia in righe ordinate */}
      <header className="sp-testa">
        <div className="sp-chi">
          {allievo.foto_url
            ? <img src={allievo.foto_url} alt="" className="sp-foto" />
            : <span className="sp-foto sp-iniziali">{(allievo.nome?.[0] || '') + (allievo.cognome?.[0] || '')}</span>}
          <div className="sp-nome">
            <h1>{allievo.cognome} {allievo.nome}</h1>
            <div className="sp-sotto">
              {allievo.data_nascita
                ? <span>{etaAl(allievo.data_nascita)} anni · {nato} il {dataBreve(allievo.data_nascita)}</span>
                : <span className="muto">data di nascita da inserire</span>}
              {st && <span className={`tag tag-${st.tono}`}>{ritirato ? (g === 'F' ? st.f : g === 'M' ? st.m : st.testo) : statoTesto(stato.stato, g)}</span>}
              {stato?.certificato_scaduto && <span className="tag tag-rosso">certificato</span>}
              {stato?.quota_mancante && <span className="tag tag-attenzione">quota da pagare</span>}
              {stato?.senza_orari && <span className="tag tag-attenzione">giorni da assegnare</span>}
              {stato?.giorni_al_compleanno != null && stato.giorni_al_compleanno <= 6 && (
                <span className="tag tag-tenue">compleanno {stato.giorni_al_compleanno === 0 ? 'oggi' : `tra ${stato.giorni_al_compleanno}g`}</span>
              )}
            </div>
          </div>
        </div>
        <div className="sp-azioni">
          <a className="btn btn-primario" href="#nuova-iscrizione">Nuova iscrizione</a>
          <Link prefetch={false} className="btn" href={`/gestione/sportello?persona=${id}`}>Allo sportello</Link>
          <Link prefetch={false} className="btn" href={`/gestione/persone/${id}?incassa=1#pagamenti`}>Incassa</Link>
          {wa && <a className="btn" href={wa} target="_blank" rel="noreferrer">WhatsApp</a>}
          {allievo.account?.email && <a className="btn" href={`mailto:${allievo.account.email}`}>Email</a>}
        </div>
        {(() => {
          // i corsi a colpo d'occhio: quelli in corso con i giorni, oppure l'ultimo abbonamento
          const GG = ['', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
          const oggiS = new Date().toISOString().slice(0, 10);
          const correnti = attive.filter((i) => !i.data_fine || i.data_fine >= oggiS);
          const ultima = (iscrizioni || [])[0];
          const ultimo = correnti.length ? null : ultima ? { nome: `${ultima.corsi?.nome || ''} (${ultima.tipi_abbonamento?.nome || ''})`, al: ultima.data_fine }
            : storico?.[0] ? { nome: storico[0].abbonamento, al: storico[0].al } : null;
          if (!correnti.length && !ultimo && !famiglia?.length) return null;
          return (
            <dl className="sp-righe">
              {correnti.length > 0 && <>
                <dt>{correnti.length === 1 ? 'Corso' : 'Corsi'}</dt>
                <dd>
                  {correnti.map((i) => {
                    const suoi = (i.iscrizioni_orari || []).map((x) => (orari || []).find((o) => o.id === x.orario_id)).filter(Boolean)
                      .sort((a, b) => a.giorno_settimana - b.giorno_settimana);
                    const giorni = suoi.map((o) => `${GG[o.giorno_settimana]} ${String(o.ora_inizio).slice(0, 5)}`);
                    const gruppo = gruppoDiOrari(suoi.filter((o) => o.corso_id === i.corsi?.id));
                    return (
                      <span key={i.id} className="sp-corso">
                        <strong>{i.corsi?.nome}{gruppo ? <span className="tag tag-neutro" style={{ marginLeft: 6 }}>{gruppo}</span> : null}</strong>
                        {giorni.length > 0 && <span>{giorni.join(' · ')}</span>}
                        <span className="muto">fino al {dataBreve(i.data_fine)}</span>
                      </span>
                    );
                  })}
                </dd>
              </>}
              {ultimo && <>
                <dt>Ultimo</dt>
                <dd><span className="sp-corso"><strong>{ultimo.nome}</strong>{ultimo.al && <span className="muto">fino al {dataBreve(ultimo.al)}</span>}</span></dd>
              </>}
              {famiglia?.length > 0 && <>
                <dt>Famiglia</dt>
                <dd>{famiglia.map((f, i) => (
                  <span key={f.id}>{i > 0 && ' · '}<Link prefetch={false} href={`/gestione/persone/${f.id}`}>{f.nome} {f.cognome}</Link></span>
                ))}</dd>
              </>}
            </dl>
          );
        })()}
      </header>

      <div className="riquadri">
        <div className={`riquadro${stato?.attivo ? '' : ' spento'}`}>
          <span className="etichetta">Abbonamento</span>
          <strong>{stato?.fine_prossima ? `fino al ${dataBreve(stato.fine_prossima)}` : stato?.ultima_fine ? `finito il ${dataBreve(stato.ultima_fine)}` : ritirato ? 'annullato' : 'mai iscritto'}</strong>
        </div>
        <div className={`riquadro${stato?.certificato_scaduto ? ' allarme' : ''}`}>
          <span className="etichetta">Certificato</span>
          <strong>{allievo.certificato_scadenza ? `${stato?.certificato_scaduto ? 'scaduto il' : 'fino al'} ${dataBreve(allievo.certificato_scadenza)}` : 'mancante'}</strong>
        </div>
        <div className={`riquadro${stato?.quota_mancante ? ' attenzione' : ''}`}>
          <span className="etichetta">Quota annuale</span>
          <strong>{stato?.quota_mancante ? 'da pagare' : quotaValida ? 'in regola' : stato?.attivo ? 'in regola' : '—'}</strong>
          {stato?.quota_valida_fino && (
            <span className="piccolo muto">{quotaValida ? 'vale fino al' : 'scaduta il'} {dataBreve(stato.quota_valida_fino)}</span>
          )}
        </div>
        <div className="riquadro">
          <span className="etichetta">Cliente dal</span>
          <strong>{stato?.prima_data ? dataBreve(stato.prima_data) : '—'}</strong>
        </div>
        <div className="riquadro">
          <span className="etichetta">Speso in tutto</span>
          <strong><a href="#pagamenti" style={{ color: 'inherit', textDecoration: 'none' }}>{euro(speso)}</a></strong>
        </div>
        <div className="riquadro">
          <span className="etichetta">Ultima presenza</span>
          <strong>{stato?.ultima_presenza ? dataBreve(stato.ultima_presenza) : '—'}</strong>
        </div>
      </div>

      <div className="scheda-due">
        <div>
          <section className="pannello" id="nuova-iscrizione">
            <h2>Iscrizioni {attive.length > 0 && <span className="piccolo muto">· {attive.length} in corso</span>}</h2>
            <Iscrizioni
              allievoId={id} iscrizioni={iscrizioni || []} corsi={corsi || []} tipi={tipi || []} orari={orari || []}
              quotaCent={palestra?.quota_iscrizione_cent || 0}
              sconti={palestra?.sconti || {}}
              meseFineStagione={palestra?.mese_fine_stagione || 7}
              meseInizioAnnuale={palestra?.mese_inizio_annuale || 10}
              famigliaIscritta={new Set((famigliaIscritta || []).map((x) => x.allievo_id)).size}
              apriSubito={iscrivi === '1'}
            />
            <RinnoviAutomatici rinnovi={rinnovi || []} />
          </section>

          <section className="pannello" id="prossime" style={{ scrollMarginTop: 80 }}>
            <h2>Prossime lezioni <span className="piccolo muto">· 30 giorni</span></h2>
            <ProssimeLezioni allievoId={id} palestraId={p} lezioni={prossime} disdette={disdette || []} />
          </section>

          {crediti?.length > 0 && (
            <section className="pannello">
              <h2>Recuperi</h2>
              <Recuperi allievoId={id} crediti={crediti} />
            </section>
          )}

          <Pagamenti pagamenti={pagamenti || []} ricevute={ricevute || []} totaleStorico={spesoStorico} online={stripeAttivo()}
                     key={incassa === '1' ? 'incassa' : 'normale'} apriIncassa={incassa === '1'}
                     incassa={{ palestraId: p, allievoId: id, accountId: allievo.account_id, nome: allievo.nome,
                                quotaCent: palestra?.quota_iscrizione_cent || 0, quotaMancante: !quotaValida }} />

          {storico?.length > 0 && (
            <section className="pannello">
              <h2>Storico abbonamenti <span className="piccolo muto">· {storicoTotale} da APP Palestre · {euro(spesoStorico)}</span></h2>
              <div className="tabella-scorre">
                <table>
                  <thead><tr><th>Abbonamento</th><th>Dal</th><th>Al</th><th>Valore</th></tr></thead>
                  <tbody>
                    {storico.map((x) => (
                      <tr key={x.id}>
                        <td>{x.abbonamento}{x.stato === 'attivo' && <> <span className="tag tag-ok">in corso</span></>}</td>
                        <td>{dataBreve(x.dal)}</td>
                        <td>{dataBreve(x.al)}</td>
                        <td>{x.valore_cent != null ? euro(x.valore_cent) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        <aside>
          <Anagrafica allievo={allievo} linkCertificato={linkCertificato} ente={palestra?.ente?.nome} />

          <section className="pannello">
            <h2>Etichette</h2>
            <EtichettePersona palestraId={p} allievoId={id} tutte={etichette || []} sue={stato?.etichette_id || []} />
          </section>

          {certificati?.length > 0 && (
            <section className="pannello">
              <h2>Certificati caricati</h2>
              <ul className="mini-lista">
                {certificati.map((c) => (
                  <li key={c.id}>
                    <Link prefetch={false} href="/gestione/certificati">
                      <span className="ml-testo">
                        <strong>Caricato il {dataBreve(c.caricato_at)}</strong>
                        <span className="piccolo muto">{c.scadenza ? `scade il ${dataBreve(c.scadenza)}` : 'scadenza da leggere'}</span>
                      </span>
                      <span className={`tag ${c.stato === 'valido' ? 'tag-ok' : c.stato === 'rifiutato' ? 'tag-neutro' : 'tag-attenzione'}`}>
                        {c.stato === 'da_verificare' ? 'da verificare' : c.stato}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <ModuliPersona allievoId={id} moduli={moduli || []} firme={firme || []} />

          <Privacy allievoId={id} nome={`${allievo.nome} ${allievo.cognome}`} account={allievo.account} admin={staff.ruolo === 'admin'} />

          {prove?.length > 0 && (
            <section className="pannello">
              <h2>Prove</h2>
              <ul className="mini-lista">
                {prove.map((pr) => (
                  <li key={pr.id}>
                    <span className="ml-riga">
                      <span className="ml-testo">
                        <strong>{pr.corsi?.nome}</strong>
                        <span className="piccolo muto">{dataBreve(pr.lezioni.inizio)} alle {ora(pr.lezioni.inizio)}</span>
                      </span>
                      <span className="tag tag-neutro">{pr.stato}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="sp-fondo"><UnisciPersona palestraId={p} allievo={allievo} /></div>
        </aside>
      </div>
    </div>
  );
}
