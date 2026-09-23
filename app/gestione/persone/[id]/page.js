import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import { dataBreve, ora, etaAl, STATI_LEAD } from '@/lib/formato';
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

  const [{ data: iscrizioni }, { data: crediti }, { data: prove }, { data: certificati }, { data: corsi }, { data: tipi }, { data: orari }, { data: palestra }] =
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
      supabase.from('tipi_abbonamento').select('id, nome, modalita, durata_mesi, prezzo_cent').eq('palestra_id', p).eq('attivo', true).order('nome'),
      supabase.from('orari').select('id, corso_id, giorno_settimana, ora_inizio').eq('palestra_id', p).eq('attivo', true)
        .order('giorno_settimana').order('ora_inizio'),
      supabase.from('palestre').select('base_url, quota_iscrizione_cent').eq('id', p).maybeSingle(),
    ]);

  const linkCertificato = `${palestra?.base_url || ''}/certificato?t=${allievo.token}`;

  return (
    <>
      <Link className="torna" href="/gestione/persone">Tutte le persone</Link>
      <h1 style={{ marginBottom: 4 }}>{allievo.cognome} {allievo.nome}</h1>
      <p className="muto">
        {etaAl(allievo.data_nascita)} anni · nato il {dataBreve(allievo.data_nascita)} ·{' '}
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
