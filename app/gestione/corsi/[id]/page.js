import Link from 'next/link';
import Materiali from '../Materiali';
import { notFound, redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import { dataBreve, etaAl } from '@/lib/formato';
import Orari from './Orari';

export const dynamic = 'force-dynamic';

// Scheda del corso: orari settimanali ed elenco degli iscritti
export default async function Corso({ params, searchParams }) {
  const { id } = await params;
  const { tutti } = await searchParams;
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const p = staff.palestra_id;

  const [{ data: corso }, { data: iscritti }, { data: orari }, { data: sale }, { data: insegnanti }, { data: attese }, { data: base }] =
    await Promise.all([
      supabase.from('v_riepilogo_corsi').select('*').eq('corso_id', id).maybeSingle(),
      supabase.from('v_iscritti_corso').select('*').eq('corso_id', id)
        .in('stato', tutti === '1' ? ['attiva', 'sospesa', 'scaduta', 'annullata'] : ['attiva'])
        .order('cognome'),
      supabase.from('orari').select('*').eq('corso_id', id).order('giorno_settimana').order('ora_inizio'),
      supabase.from('sale').select('id, nome').eq('palestra_id', p).order('nome'),
      supabase.from('staff').select('id, nome, cognome').eq('palestra_id', p).eq('attivo', true).order('nome'),
      supabase.from('liste_attesa').select('id, allievi ( nome, cognome )').eq('corso_id', id).eq('stato', 'in_attesa'),
      supabase.from('corsi').select('slug').eq('id', id).maybeSingle(),
    ]);

  const { data: materiali } = await supabase.from('materiali')
    .select('id, titolo, tipo, url, minuti_prima').eq('corso_id', id).eq('attivo', true).order('created_at');
  const slug = base?.slug;
  if (!corso) notFound();

  return (
    <>
      <Link className="torna" href="/gestione/corsi">Tutti i corsi</Link>
      <h1 style={{ marginBottom: 4 }}>{corso.corso_nome}</h1>
      <p className="muto">
        {[corso.categoria, corso.fascia, corso.livello].filter(Boolean).join(' · ')}
        {' · '}<Link href={`/gestione/corsi/${id}/modifica`}>modifica</Link>
        {slug && <> · <Link href={`/corsi/${slug}`} target="_blank">pagina pubblica</Link></>}
      </p>

      <h2 style={{ marginTop: 24 }}>Orari settimanali</h2>
      <p className="muto piccolo">Le lezioni dei prossimi tre mesi si creano da sole a ogni modifica.</p>
      <Orari palestraId={p} corsoId={id} orari={orari || []} sale={sale || []} insegnanti={insegnanti || []} />

      <h2 style={{ marginTop: 32 }}>Iscritti</h2>
      <div className="filtri">
        <Link href={`/gestione/corsi/${id}`} aria-current={tutti !== '1' ? 'true' : undefined}>Attivi</Link>
        <Link href={`/gestione/corsi/${id}?tutti=1`} aria-current={tutti === '1' ? 'true' : undefined}>Anche scaduti</Link>
        <a className="btn" style={{ minHeight: 36, padding: '0 14px' }} href={`/api/corsi/${id}/csv`}>Esporta CSV</a>
      </div>

      {iscritti?.length === 0 && <div className="vuoto">Nessun iscritto in questo elenco.</div>}
      <ul className="elenco">
        {iscritti?.map((i) => (
          <li key={i.iscrizione_id} className="persona" style={{ alignItems: 'start' }}>
            <div>
              <Link className="persona-nome" href={`/gestione/persone/${i.allievo_id}`}>{i.cognome} {i.nome}</Link>
              <span className="piccolo muto"> · {etaAl(i.data_nascita)} anni</span>
              <div className="piccolo muto">{i.orari || 'Orari da assegnare'} · {i.abbonamento}</div>
              <div className="piccolo muto">
                <a href={`tel:${i.telefono}`}>{i.telefono}</a> · <a href={`mailto:${i.email}`}>{i.email}</a>
                {i.titolare_nome !== i.nome && <> · {i.titolare_nome} {i.titolare_cognome}</>}
              </div>
            </div>
            <div style={{ display: 'grid', gap: 4, justifyItems: 'end' }}>
              <span className={`tag ${i.stato === 'attiva' ? 'tag-ok' : 'tag-neutro'}`}>
                {i.stato === 'attiva' ? `fino al ${dataBreve(i.data_fine)}` : i.stato}
              </span>
              {i.bloccato && <span className="tag tag-rosso">Certificato</span>}
              {i.quota_mancante && <span className="tag tag-attenzione">Quota</span>}
            </div>
          </li>
        ))}
      </ul>

      {attese?.length > 0 && (
        <>
          <h2 style={{ marginTop: 32 }}>In lista d'attesa</h2>
          <ul className="elenco">
            {attese.map((a) => (
              <li key={a.id} className="persona">
                <span>{a.allievi?.cognome} {a.allievi?.nome}</span>
                <Link className="piccolo" href="/gestione/attese">gestisci</Link>
              </li>
            ))}
          </ul>
        </>
      )}
          <Materiali palestraId={staff.palestra_id} corsoId={id} righe={materiali || []} />

    </>
  );
}
