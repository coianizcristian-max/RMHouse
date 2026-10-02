import Link from 'next/link';
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
    supabase.from('lezioni').select('insegnante_id, svolta_da, svolta_at, svolta_come').eq('id', id).maybeSingle(),
    supabase.from('staff').select('id, nome, cognome').eq('palestra_id', staff.palestra_id).eq('attivo', true).not('archiviato', 'is', true).order('nome'),
  ]);
  const nomeDi = (sid) => { const s = (insegnanti || []).find((x) => x.id === sid); return s ? `${s.nome} ${s.cognome || ''}`.trim() : ''; };

  // prima chi è in prova (da accogliere), poi gli altri in ordine alfabetico
  const ordine = { prova: 0, recupero: 1, ingresso: 2, iscritto: 3 };
  const elenco = (persone || [])
    .map((p) => ({ ...p, ...(dettagli || []).find((d) => d.allievo_id === p.allievo_id) }))
    .sort((a, b) => ordine[a.tipo] - ordine[b.tipo] || a.cognome.localeCompare(b.cognome, 'it'));

  return (
    <>
      <p><Link prefetch={false} href={`/gestione?data=${lezione.data}`}>‹ Torna alle lezioni</Link></p>
      <h1 style={{ marginBottom: 4 }}>{lezione.corso_nome}</h1>
      <p className="muto" style={{ marginBottom: 18 }}>
        <span style={{ textTransform: 'capitalize' }}>{giornoLungo(lezione.inizio)}</span>, {ora(lezione.inizio)}–{ora(lezione.fine)}
        {lezione.sala_nome && ` · ${lezione.sala_nome}`}{lezione.insegnante_nome && ` · ${lezione.insegnante_nome}`}
      </p>
      {lezione.stato === 'annullata' && <div className="errore">Lezione annullata{lezione.note ? `: ${lezione.note}` : ''}.</div>}
      {lezione.stato !== 'annullata' && (
        <ConfermaLezione lezioneId={lezione.id} gestione={staff.ruolo !== 'insegnante'}
          io={{ id: staff.id }} titolare={lz?.insegnante_id ? { id: lz.insegnante_id, nome: nomeDi(lz.insegnante_id) } : null}
          svolta={lz?.svolta_da ? { id: lz.svolta_da, nome: nomeDi(lz.svolta_da), at: lz.svolta_at, come: lz.svolta_come } : null}
          insegnanti={(insegnanti || []).map((s) => ({ id: s.id, nome: `${s.nome} ${s.cognome || ''}`.trim() }))} />
      )}
      <Appello lezioneId={lezione.id} palestraId={staff.palestra_id} persone={elenco}
               corsoNome={lezione.corso_nome} gestione={staff.ruolo !== 'insegnante'}
               postazioni={postazioni || []} avvisati={avvisati || []} recuperoDaSegreteria={(regole?.recupero_da || 'avviso') !== 'app'} nuove={nuove || []}
               finita={new Date(lezione.fine) < new Date()} />
    </>
  );
}
