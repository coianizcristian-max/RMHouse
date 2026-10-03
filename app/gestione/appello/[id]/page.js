import Link from 'next/link';
import Sostituzione from '../../Sostituzione';
import { notFound } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import { ora, giornoLungo } from '@/lib/formato';
import Appello from './Appello';
import ConfermaLezione from './ConfermaLezione';

export const dynamic = 'force-dynamic';

export default async function PaginaAppello({ params }) {
  const { id } = await params;
  const { supabase, staff } = await staffCorrente();

  const [{ data: lezione }, { data: persone }, { data: dettagli }, { data: avvisati }, { data: nuove }, { data: regole }] = await Promise.all([
    supabase.from('v_lezioni').select('*').eq('id', id).maybeSingle(),
    supabase.from('v_appello')
      .select('allievo_id, tipo, nome, cognome, data_nascita, certificato_scadenza, bloccato, certificato_in_scadenza, quota_mancante, presente')
      .eq('lezione_id', id),
    supabase.from('v_prenotati').select('allievo_id, origine, telefono, email, prenotato_il').eq('lezione_id', id),
    // chi ha avvisato che non viene: non è più in appello, ma si vede sotto
    supabase.from('assenze_avvisate').select('allievo_id, da, created_at, credito_id, allievi ( nome, cognome )')
      .eq('lezione_id', id).order('created_at'),
    // persone nuove segnalate in questa lezione, da registrare in segreteria
    supabase.from('promemoria').select('id, testo, fatto').eq('lezione_id', id).order('created_at'),
    supabase.from('palestre').select('recupero_da').eq('id', staff.palestra_id).maybeSingle(),
  ]);

  const { data: postazioni } = await supabase.rpc('postazioni_lezione', { p_lezione: id });
  if (!lezione) notFound();
  // chi ha tenuto la lezione (conferma per i compensi) e chi la poteva tenere
  const [{ data: lz }, { data: insegnanti }] = await Promise.all([
    supabase.from('lezioni').select('insegnante_id, svolta_da, svolta_at, svolta_come, appello_da, appello_at, appello_mod_da, appello_mod_at').eq('id', id).maybeSingle(),
    supabase.from('staff').select('id, nome, cognome').eq('palestra_id', staff.palestra_id).eq('attivo', true).not('archiviato', 'is', true).order('nome'),
  ]);
  const nomeDi = (sid) => { const s = (insegnanti || []).find((x) => x.id === sid); return s ? `${s.nome} ${s.cognome || ''}`.trim() : ''; };
  const gestione = staff.ruolo !== 'insegnante';
  const mia = gestione || lz?.insegnante_id === staff.id || lz?.svolta_da === staff.id;

  const testa = (
    <div className="ap-testa">
      <Link prefetch={false} href={`/gestione?data=${lezione.data}`} className="ap-indietro" aria-label="Torna alle lezioni">‹</Link>
      <div>
        <h1>{lezione.corso_nome}</h1>
        <p>
          <span style={{ textTransform: 'capitalize' }}>{giornoLungo(lezione.inizio)}</span> · {ora(lezione.inizio)}–{ora(lezione.fine)}
          {lezione.sala_nome && ` · ${lezione.sala_nome}`}{lezione.insegnante_nome && ` · ${lezione.insegnante_nome}`}
        </p>
      </div>
    </div>
  );

  // l'insegnante entra solo nelle sue lezioni; in quella di un'altra può dire che la sta sostituendo
  if (!mia) {
    const presto = new Date(lezione.inizio).getTime() - Date.now() > 30 * 60 * 1000;
    return (
      <>
        {testa}
        {lezione.stato === 'annullata' ? <div className="errore">Lezione annullata.</div>
          : presto || new Date(lezione.fine) < new Date(Date.now() - 12 * 3600 * 1000) ? (
            <div className="vuoto">Questa lezione è di {nomeDi(lz?.insegnante_id) || 'un\'altra insegnante'}: l&apos;appello lo fa chi la tiene.
              {presto && ' Se la sostituisci, da mezz\'ora prima dell\'inizio qui potrai confermarlo.'}</div>
          ) : (
            <ConfermaLezione lezioneId={lezione.id} gestione={false} io={{ id: staff.id }}
              titolare={lz?.insegnante_id ? { id: lz.insegnante_id, nome: nomeDi(lz.insegnante_id) } : null} svolta={null} insegnanti={[]} />
          )}
      </>
    );
  }

  // prima chi è in prova (da accogliere), poi gli altri in ordine alfabetico
  const ordine = { prova: 0, recupero: 1, ingresso: 2, iscritto: 3 };
  const elenco = (persone || [])
    .map((p) => ({ ...p, ...(dettagli || []).find((d) => d.allievo_id === p.allievo_id) }))
    .sort((a, b) => ordine[a.tipo] - ordine[b.tipo] || a.cognome.localeCompare(b.cognome, 'it'));

  return (
    <>
      {testa}
      <Sostituzione lezioneId={lezione.id} gestione={gestione} />
      {lezione.stato === 'annullata' && <div className="errore">Lezione annullata{lezione.note ? `: ${lezione.note}` : ''}.</div>}
      {lezione.stato !== 'annullata' && (
        <ConfermaLezione lezioneId={lezione.id} gestione={gestione}
          io={{ id: staff.id }} titolare={lz?.insegnante_id ? { id: lz.insegnante_id, nome: nomeDi(lz.insegnante_id) } : null}
          svolta={lz?.svolta_da ? { id: lz.svolta_da, nome: nomeDi(lz.svolta_da), at: lz.svolta_at, come: lz.svolta_come } : null}
          insegnanti={(insegnanti || []).map((s) => ({ id: s.id, nome: `${s.nome} ${s.cognome || ''}`.trim() }))} />
      )}
      <Appello lezioneId={lezione.id} palestraId={staff.palestra_id} persone={elenco}
               corsoNome={lezione.corso_nome} gestione={gestione} annullata={lezione.stato === 'annullata'}
               registro={lz ? { da: nomeDi(lz.appello_da), at: lz.appello_at, modDa: nomeDi(lz.appello_mod_da), modAt: lz.appello_mod_at } : null}
               postazioni={postazioni || []} avvisati={avvisati || []} recuperoDaSegreteria={(regole?.recupero_da || 'avviso') !== 'app'} nuove={nuove || []}
               finita={new Date(lezione.fine) < new Date()} />
    </>
  );
}
