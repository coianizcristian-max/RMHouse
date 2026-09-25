import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import { dataBreve, ora, etaAl, euro } from '@/lib/formato';
import { STATI_CLIENTE } from '@/lib/stati';
import Anagrafica from './Anagrafica';
import Iscrizioni from './Iscrizioni';
import Recuperi from './Recuperi';
import EtichettePersona from './EtichettePersona';
import Privacy from './Privacy';
import ModuliPersona from './ModuliPersona';

export const dynamic = 'force-dynamic';

const whatsapp = (tel) => {
  const n = String(tel || '').replace(/[^\d+]/g, '').replace(/^\+/, '');
  return n ? `https://wa.me/${n.length <= 10 ? '39' + n : n}` : null;
};

// Scheda della persona: in alto chi è e com'è messa, sotto a sinistra
// quello che si fa (iscrizioni, giorni, recuperi), a destra i dati
export default async function Persona({ params }) {
  const { id } = await params;
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
         { data: etichette }, { data: famiglia }, { data: famigliaIscritta }, { data: moduli }, { data: firme }] = await Promise.all([
    supabase.from('v_stato_clienti').select('stato, attivo, fine_prossima, prima_data, ultima_fine, certificato_scaduto, quota_mancante, senza_orari, etichette_id, giorni_al_compleanno, ultima_presenza')
      .eq('id', id).maybeSingle(),
    supabase.from('iscrizioni')
      .select('id, palestra_id, data_inizio, data_fine, stato, sconto_cent, ingressi_residui, corsi ( id, nome ), tipi_abbonamento ( nome, modalita, lezioni_settimanali ), iscrizioni_orari ( orario_id )')
      .eq('allievo_id', id).order('data_inizio', { ascending: false }),
    supabase.from('v_crediti').select('*').eq('allievo_id', id).order('scadenza', { ascending: false }),
    supabase.from('prove')
      .select('id, stato, prezzo_cent, corsi ( nome ), lezioni ( inizio )')
      .eq('allievo_id', id).order('created_at', { ascending: false }).limit(10),
    supabase.from('certificati').select('id, scadenza, stato, caricato_at').eq('allievo_id', id)
      .order('caricato_at', { ascending: false }).limit(5),
    supabase.from('corsi').select('id, nome').eq('palestra_id', p).eq('attivo', true).order('nome'),
    supabase.from('tipi_abbonamento')
      .select('id, nome, codice, famiglia, modalita, durata_mesi, durata_giorni, prezzo_cent, tipi_abbonamento_corsi ( corso_id )')
      .eq('palestra_id', p).eq('attivo', true).eq('archiviato', false).order('famiglia').order('nome'),
    supabase.from('orari').select('id, corso_id, giorno_settimana, ora_inizio').eq('palestra_id', p).eq('attivo', true)
      .order('giorno_settimana').order('ora_inizio'),
    supabase.from('palestre').select('base_url, quota_iscrizione_cent, sconti').eq('id', p).maybeSingle(),
    supabase.from('storico_abbonamenti').select('id, abbonamento, dal, al, stato, valore_cent', { count: 'exact' })
      .eq('allievo_id', id).order('dal', { ascending: false }).limit(60),
    supabase.from('etichette').select('id, nome').eq('palestra_id', p).order('nome'),
    supabase.from('allievi').select('id, nome, cognome').eq('account_id', allievo.account_id).neq('id', id),
    supabase.from('iscrizioni').select('allievo_id, allievi!inner ( account_id )').eq('allievi.account_id', allievo.account_id)
      .eq('stato', 'attiva').neq('allievo_id', id),
    supabase.rpc('moduli_da_firmare', { p_allievo: id }),
    supabase.from('firme').select('id, modulo_id, versione').eq('allievo_id', id),
  ]);

  const linkCertificato = `${palestra?.base_url || ''}/certificato?t=${allievo.token}`;
  const st = STATI_CLIENTE[stato?.stato];
  const attive = (iscrizioni || []).filter((i) => i.stato === 'attiva' || i.stato === 'sospesa');
  const speso = (storico || []).reduce((s, x) => s + (x.valore_cent || 0), 0);
  const tel = allievo.account?.telefono;
  const wa = whatsapp(tel);
  const nato = allievo.sesso === 'F' ? 'nata' : 'nato';

  return (
    <>
      <Link className="torna" href="/gestione/persone">Tutte le persone</Link>

      <div className="scheda-testa">
        {allievo.foto_url
          ? <img src={allievo.foto_url} alt="" className="miniatura-grande" />
          : <span className="miniatura-grande segnaposto">{(allievo.nome?.[0] || '') + (allievo.cognome?.[0] || '')}</span>}
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1>{allievo.cognome} {allievo.nome}</h1>
          <div className="scheda-sotto">
            {allievo.data_nascita
              ? <span>{etaAl(allievo.data_nascita)} anni · {nato} il {dataBreve(allievo.data_nascita)}</span>
              : <span className="muto">data di nascita da inserire</span>}
            {st && <span className={`tag tag-${st.tono}`}>{st.testo}</span>}
            {stato?.certificato_scaduto && <span className="tag tag-rosso">certificato</span>}
            {stato?.quota_mancante && <span className="tag tag-attenzione">quota da pagare</span>}
            {stato?.senza_orari && <span className="tag tag-attenzione">giorni da assegnare</span>}
            {stato?.giorni_al_compleanno != null && stato.giorni_al_compleanno <= 6 && (
              <span className="tag tag-tenue">compleanno {stato.giorni_al_compleanno === 0 ? 'oggi' : `tra ${stato.giorni_al_compleanno}g`}</span>
            )}
          </div>
          {famiglia?.length > 0 && (
            <div className="piccolo muto" style={{ marginTop: 4 }}>
              In famiglia anche: {famiglia.map((f, i) => (
                <span key={f.id}>{i > 0 && ', '}<Link href={`/gestione/persone/${f.id}`}>{f.nome} {f.cognome}</Link></span>
              ))}
            </div>
          )}
        </div>
        <div className="azioni scheda-azioni">
          <a className="btn btn-piccolo btn-primario" href="#nuova-iscrizione">Nuova iscrizione</a>
          <Link className="btn btn-piccolo" href="/gestione/incassi">Incassa</Link>
          {wa && <a className="btn btn-piccolo" href={wa} target="_blank" rel="noreferrer">WhatsApp</a>}
          {allievo.account?.email && <a className="btn btn-piccolo" href={`mailto:${allievo.account.email}`}>Email</a>}
        </div>
      </div>

      <div className="riquadri">
        <div className={`riquadro${stato?.attivo ? '' : ' spento'}`}>
          <span className="etichetta">Abbonamento</span>
          <strong>{stato?.fine_prossima ? `fino al ${dataBreve(stato.fine_prossima)}` : stato?.ultima_fine ? `finito il ${dataBreve(stato.ultima_fine)}` : 'mai iscritto'}</strong>
        </div>
        <div className={`riquadro${stato?.certificato_scaduto ? ' allarme' : ''}`}>
          <span className="etichetta">Certificato</span>
          <strong>{allievo.certificato_scadenza ? `${stato?.certificato_scaduto ? 'scaduto il' : 'fino al'} ${dataBreve(allievo.certificato_scadenza)}` : 'mancante'}</strong>
        </div>
        <div className={`riquadro${stato?.quota_mancante ? ' attenzione' : ''}`}>
          <span className="etichetta">Quota annuale</span>
          <strong>{stato?.quota_mancante ? 'da pagare' : stato?.attivo ? 'in regola' : '—'}</strong>
        </div>
        <div className="riquadro">
          <span className="etichetta">Cliente dal</span>
          <strong>{stato?.prima_data ? dataBreve(stato.prima_data) : '—'}</strong>
        </div>
        <div className="riquadro">
          <span className="etichetta">Speso in tutto</span>
          <strong>{euro(speso)}</strong>
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
              famigliaIscritta={new Set((famigliaIscritta || []).map((x) => x.allievo_id)).size}
            />
          </section>

          {crediti?.length > 0 && (
            <section className="pannello">
              <h2>Recuperi</h2>
              <Recuperi allievoId={id} crediti={crediti} />
            </section>
          )}

          {storico?.length > 0 && (
            <section className="pannello">
              <h2>Storico abbonamenti <span className="piccolo muto">· {storicoTotale} da APP Palestre · {euro(speso)}</span></h2>
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
          <Anagrafica allievo={allievo} linkCertificato={linkCertificato} />

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
                    <Link href="/gestione/certificati">
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
        </aside>
      </div>
    </>
  );
}
