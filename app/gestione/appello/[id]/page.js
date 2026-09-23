import Link from 'next/link';
import { notFound } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import { ora, giornoLungo } from '@/lib/formato';
import Appello from './Appello';

export const dynamic = 'force-dynamic';

export default async function PaginaAppello({ params }) {
  const { id } = await params;
  const { supabase, staff } = await staffCorrente();

  const [{ data: lezione }, { data: persone }] = await Promise.all([
    supabase.from('v_lezioni').select('*').eq('id', id).maybeSingle(),
    supabase.from('v_appello')
      .select('allievo_id, tipo, nome, cognome, data_nascita, certificato_scadenza, bloccato, certificato_in_scadenza, quota_mancante, presente')
      .eq('lezione_id', id),
  ]);
  if (!lezione) notFound();

  // prima chi è in prova (da accogliere), poi gli altri in ordine alfabetico
  const ordine = { prova: 0, recupero: 1, ingresso: 2, iscritto: 3 };
  const elenco = (persone || []).sort((a, b) =>
    ordine[a.tipo] - ordine[b.tipo] || a.cognome.localeCompare(b.cognome, 'it'));

  return (
    <>
      <p><Link href={`/gestione?data=${lezione.data}`}>‹ Torna alle lezioni</Link></p>
      <h1 style={{ marginBottom: 4 }}>{lezione.corso_nome}</h1>
      <p className="muto" style={{ marginBottom: 18 }}>
        <span style={{ textTransform: 'capitalize' }}>{giornoLungo(lezione.inizio)}</span>, {ora(lezione.inizio)}–{ora(lezione.fine)}
        {lezione.sala_nome && ` · ${lezione.sala_nome}`}{lezione.insegnante_nome && ` · ${lezione.insegnante_nome}`}
      </p>
      {lezione.stato === 'annullata' && <div className="errore">Lezione annullata{lezione.note ? `: ${lezione.note}` : ''}.</div>}
      <Appello lezioneId={lezione.id} palestraId={staff.palestra_id} persone={elenco} />
    </>
  );
}
