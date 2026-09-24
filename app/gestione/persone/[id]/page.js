import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import { dataBreve, ora, etaAl, euro, STATI_LEAD } from '@/lib/formato';
import Anagrafica from './Anagrafica';
import Iscrizioni from './Iscrizioni';
import Recuperi from './Recuperi';

export const dynamic = 'force-dynamic';

export default async function Persona({ params }) {
  const { id } = await params;
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const p = staff.palestra_id;

  const { data: allievo } = await supabase
    .from('allievi')
    .select('*, account ( id, nome, cognome, email, telefono, codice_fiscale, consenso_marketing )')
    .eq('id', id).maybeSingle();
  if (!allievo) notFound();

  const [{ data: iscrizioni }, { data: crediti }, { data: prove }, { data: certificati }, { data: corsi }, { data: tipi }, { data: orari }, { data: palestra }, { data: storico, count: storicoTotale }] =
    await Promise.all([
      supabase.from('iscrizioni')
        .select('id, palestra_id, data_inizio, data_fine, stato, sconto_cent, corsi ( id, nome ), tipi_abbonamento ( nome, modalita )')
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
      supabase.from('palestre').select('base_url, quota_iscrizione_cent').eq('id', p).maybeSingle(),
      supabase.from('storico_abbonamenti').select('id, abbonamento, dal, al, stato, valore_cent', { count: 'exact' })
        .eq('allievo_id', id).order('dal', { ascending: false }).limit(24),
    ]);

  const linkCertificato = `${palestra?.base_url || ''}/certificato?t=${allievo.token}`;

  return (
    <>
      <Link className="torna" href="/gestione/persone">Tutte le persone</Link>
      <h1 style={{ marginBottom: 4 }}>{allievo.cognome} {allievo.nome}</h1>
      <p className="muto">
        {allievo.data_nascita
          ? <>{etaAl(allievo.data_nascita)} anni · nato il {dataBreve(allievo.data_nascita)} ·{' '}</>
          : <>data di nascita da inserire ·{' '}</>}
        <span className={`tag ${allievo.stato_lead === 'iscritto' ? 'tag-ok' : 'tag-tenue'}`}>{STATI_LEAD[allievo.stato_lead]}</span>
      </p>

      <Anagrafica allievo={allievo} linkCertificato={linkCertificato} />

      <h2 style={{ marginTop: 28 }}>Iscrizioni</h2>
      <Iscrizioni
        allievoId={id} iscrizioni={iscrizioni || []} corsi={corsi || []} tipi={tipi || []} orari={orari || []}
        quotaCent={palestra?.quota_iscrizione_cent || 0}
      />

      <h2 style={{ marginTop: 28 }}>Recuperi</h2>
      <Recuperi allievoId={id} crediti={crediti || []} />

      <h2 style={{ marginTop: 28 }}>Certificati</h2>
      {certificati?.length === 0 ? (
        <div className="vuoto">Nessun certificato caricato. Manda il link qui sopra.</div>
      ) : (
        <ul className="elenco">
          {certificati.map((c) => (
            <li key={c.id} className="persona">
              <span>Caricato il {dataBreve(c.caricato_at)}{c.scadenza && ` · scade il ${dataBreve(c.scadenza)}`}</span>
              <span className={`tag ${c.stato === 'valido' ? 'tag-ok' : c.stato === 'rifiutato' ? 'tag-neutro' : 'tag-attenzione'}`}>
                {c.stato === 'da_verificare' ? 'Da verificare' : c.stato}
              </span>
            </li>
          ))}
        </ul>
      )}

      {storico?.length > 0 && (
        <>
          <h2 style={{ marginTop: 28 }}>Storico abbonamenti</h2>
          <p className="piccolo muto" style={{ marginTop: -4 }}>
            Venduti con APP Palestre{storicoTotale > storico.length ? ` · gli ultimi ${storico.length} di ${storicoTotale}` : ` · ${storico.length}`}
            {' · '}totale {euro(storico.reduce((s, x) => s + (x.valore_cent || 0), 0))}
          </p>
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
        </>
      )}

      <h2 style={{ marginTop: 28 }}>Prove</h2>
      {prove?.length === 0 ? <div className="vuoto">Nessuna prova.</div> : (
        <ul className="elenco">
          {prove.map((pr) => (
            <li key={pr.id} className="persona">
              <span>
                {pr.corsi?.nome}
                <span className="piccolo muto" style={{ display: 'block' }}>
                  {dataBreve(pr.lezioni.inizio)} alle {ora(pr.lezioni.inizio)}
                </span>
              </span>
              <span className="tag tag-neutro">{pr.stato}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
