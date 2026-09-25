import Link from 'next/link';
import Materiali from '../Materiali';
import { notFound, redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import { dataBreve, etaAl } from '@/lib/formato';
import Orari from './Orari';
import InsegnantiCorso from './InsegnantiCorso';
import AssegnaGiorni from '../../AssegnaGiorni';

export const dynamic = 'force-dynamic';

// Scheda del corso: a sinistra chi c'è (con i giorni da assegnare in un tocco),
// a destra come è fatto il corso (orari, insegnanti, materiali)
export default async function Corso({ params, searchParams }) {
  const { id } = await params;
  const { vista = '' } = await searchParams;
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const p = staff.palestra_id;

  const [{ data: corso }, { data: iscritti }, { data: orari }, { data: sale }, { data: insegnanti }, { data: attese },
         { data: base }, { data: abilitati }, { data: iscrizioni }] = await Promise.all([
    supabase.from('v_riepilogo_corsi').select('*').eq('corso_id', id).maybeSingle(),
    supabase.from('v_iscritti_corso').select('*').eq('corso_id', id)
      .in('stato', vista === 'tutti' ? ['attiva', 'sospesa', 'scaduta', 'annullata'] : ['attiva', 'sospesa'])
      .order('cognome'),
    supabase.from('orari').select('*').eq('corso_id', id).order('giorno_settimana').order('ora_inizio'),
    supabase.from('sale').select('id, nome').eq('palestra_id', p).order('nome'),
    supabase.from('staff').select('id, nome, cognome, ruolo, foto_url, archiviato').eq('palestra_id', p).eq('attivo', true).order('nome'),
    supabase.from('liste_attesa').select('id, allievi ( id, nome, cognome )').eq('corso_id', id).eq('stato', 'in_attesa'),
    supabase.from('corsi').select('slug, capienza').eq('id', id).maybeSingle(),
    supabase.from('corsi_insegnanti').select('staff_id').eq('corso_id', id),
    supabase.from('iscrizioni').select('id, tipi_abbonamento ( modalita, lezioni_settimanali ), iscrizioni_orari ( orario_id )')
      .eq('corso_id', id).in('stato', ['attiva', 'sospesa']),
  ]);
  const { data: materiali } = await supabase.from('materiali')
    .select('id, titolo, tipo, url, minuti_prima').eq('corso_id', id).eq('attivo', true).order('created_at');
  if (!corso) notFound();

  const idAbilitati = (abilitati || []).map((a) => a.staff_id);
  const docenti = (insegnanti || []).filter((s) =>
    idAbilitati.includes(s.id) || (s.ruolo !== 'segreteria' && !s.archiviato));
  const infoIscrizione = Object.fromEntries((iscrizioni || []).map((i) => [i.id, i]));
  const orariAttivi = (orari || []).filter((o) => o.attivo);
  const senzaGiorni = (iscritti || []).filter((i) => {
    const x = infoIscrizione[i.iscrizione_id];
    return x && x.tipi_abbonamento?.modalita === 'orari_fissi' && (x.iscrizioni_orari || []).length === 0;
  });
  const elenco = vista === 'senza_giorni' ? senzaGiorni : (iscritti || []);
  const certificati = (iscritti || []).filter((i) => i.stato === 'attiva' && i.bloccato).length;

  return (
    <>
      <Link className="torna" href="/gestione/corsi">Tutti i corsi</Link>
      <div className="scheda-testa">
        <span className="banda-verticale" style={{ background: corso.colore || 'var(--rosso)' }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1>{corso.corso_nome}</h1>
          <div className="scheda-sotto">
            <span>{[corso.categoria, corso.disciplina, corso.fascia, corso.livello, corso.sede].filter(Boolean).join(' · ')}</span>
            {corso.visibilita !== 'pubblico' && <span className="tag tag-neutro">nascosto</span>}
            {corso.prenotabile === false && <span className="tag tag-neutro">non prenotabile</span>}
          </div>
        </div>
        <div className="azioni scheda-azioni">
          <Link className="btn btn-piccolo" href={`/gestione/corsi/${id}/modifica`}>Modifica corso</Link>
          {base?.slug && <Link className="btn btn-piccolo" href={`/corsi/${base.slug}`} target="_blank">Pagina pubblica</Link>}
          <a className="btn btn-piccolo" href={`/api/corsi/${id}/csv`}>Esporta iscritti</a>
        </div>
      </div>

      <div className="riquadri">
        <div className="riquadro">
          <span className="etichetta">Iscritti attivi</span>
          <strong>{corso.iscritti_attivi}{base?.capienza ? ` / ${base.capienza}` : ''}</strong>
        </div>
        <div className={`riquadro${senzaGiorni.length ? ' attenzione' : ''}`}>
          <span className="etichetta">Senza giorni</span>
          <strong>{senzaGiorni.length}</strong>
        </div>
        <div className={`riquadro${certificati ? ' allarme' : ''}`}>
          <span className="etichetta">Certificati da sistemare</span>
          <strong>{certificati}</strong>
        </div>
        <div className="riquadro">
          <span className="etichetta">Prove in arrivo</span>
          <strong>{corso.prove_in_arrivo}</strong>
        </div>
        <div className="riquadro">
          <span className="etichetta">In lista d'attesa</span>
          <strong>{attese?.length || 0}</strong>
        </div>
        <div className="riquadro">
          <span className="etichetta">Lezioni a settimana</span>
          <strong>{orariAttivi.length}</strong>
        </div>
      </div>

      <div className="scheda-due">
        <section className="pannello">
          <div className="pannello-testa">
            <h2>Iscritti</h2>
            <div className="pastiglie" style={{ margin: 0 }}>
              <Link className="stato-pillola" aria-current={!vista ? 'true' : undefined} href={`/gestione/corsi/${id}`}>In corso</Link>
              {senzaGiorni.length > 0 && (
                <Link className="stato-pillola attenzione" aria-current={vista === 'senza_giorni' ? 'true' : undefined}
                      href={`/gestione/corsi/${id}?vista=senza_giorni`}>Senza giorni <strong>{senzaGiorni.length}</strong></Link>
              )}
              <Link className="stato-pillola" aria-current={vista === 'tutti' ? 'true' : undefined} href={`/gestione/corsi/${id}?vista=tutti`}>Anche scaduti</Link>
            </div>
          </div>

          {elenco.length === 0 && <div className="vuoto">Nessuno in questo elenco.</div>}
          <ul className="elenco-iscritti">
            {elenco.map((i) => {
              const x = infoIscrizione[i.iscrizione_id];
              const fissi = x?.tipi_abbonamento?.modalita === 'orari_fissi' && (i.stato === 'attiva' || i.stato === 'sospesa');
              const assegnati = (x?.iscrizioni_orari || []).map((o) => o.orario_id);
              return (
                <li key={i.iscrizione_id}>
                  <div className="ei-testa">
                    <div style={{ minWidth: 0 }}>
                      <Link className="persona-nome" href={`/gestione/persone/${i.allievo_id}`}>{i.cognome} {i.nome}</Link>
                      {i.data_nascita && <span className="piccolo muto"> · {etaAl(i.data_nascita)} anni</span>}
                      <div className="piccolo muto">
                        {i.abbonamento} · {i.stato === 'attiva' ? `fino al ${dataBreve(i.data_fine)}` : i.stato}
                        {i.titolare_nome !== i.nome && ` · paga ${i.titolare_nome} ${i.titolare_cognome || ''}`}
                      </div>
                    </div>
                    <div className="ei-segni">
                      {i.bloccato && i.stato === 'attiva' && <span className="tag tag-rosso">certificato</span>}
                      {i.quota_mancante && i.stato === 'attiva' && <span className="tag tag-attenzione">quota</span>}
                      {i.telefono && <a className="piccolo" href={`tel:${i.telefono}`}>{i.telefono}</a>}
                    </div>
                  </div>
                  {fissi && (
                    <AssegnaGiorni iscrizioneId={i.iscrizione_id} orari={orariAttivi} scelti={assegnati}
                                   quanti={x?.tipi_abbonamento?.lezioni_settimanali} compatto={assegnati.length > 0} />
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <aside>
          <section className="pannello">
            <h2>Orari settimanali</h2>
            <p className="piccolo muto" style={{ marginTop: -4 }}>Le lezioni dei prossimi tre mesi si creano da sole.</p>
            <Orari palestraId={p} corsoId={id} orari={orari || []} sale={sale || []} insegnanti={insegnanti || []}
                   abilitati={idAbilitati} />
          </section>
          <section className="pannello">
            <InsegnantiCorso palestraId={p} corsoId={id} staff={docenti} scelti={idAbilitati} />
          </section>
          {attese?.length > 0 && (
            <section className="pannello">
              <h2>In lista d'attesa</h2>
              <ul className="mini-lista">
                {attese.map((a) => (
                  <li key={a.id}>
                    <Link href={`/gestione/persone/${a.allievi?.id}`}>
                      <span className="ml-testo"><strong>{a.allievi?.cognome} {a.allievi?.nome}</strong></span>
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="piccolo"><Link href="/gestione/attese">Gestisci le liste d'attesa</Link></p>
            </section>
          )}
          <section className="pannello">
            <Materiali palestraId={p} corsoId={id} righe={materiali || []} />
          </section>
        </aside>
      </div>
    </>
  );
}
