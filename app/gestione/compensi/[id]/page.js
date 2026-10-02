import { notFound } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import { euro, dataBreve, ora } from '@/lib/formato';
import Stampa from '../../ricevute/[id]/Stampa';

export const dynamic = 'force-dynamic';

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const NOTA = { da_verificare: 'non confermata · non contata', sostituita: 'non contata', forfait: 'nel forfait' };

// Il riepilogo del mese di un insegnante, da stampare o salvare in PDF (lo apre anche l'insegnante stessa)
export default async function RiepilogoCompenso({ params }) {
  const { id } = await params;
  const { supabase, staff } = await staffCorrente();
  const { data: c } = await supabase.from('compensi').select('*, staff ( nome, cognome )').eq('id', id).maybeSingle();
  if (!c) notFound();                       // le regole del database fanno vedere solo i propri all'insegnante
  const [{ data: righe }, { data: pal }] = await Promise.all([
    supabase.rpc('dettaglio_compenso', { p_id: id }),
    supabase.from('palestre').select('nome, dati_fiscali, indirizzo').eq('id', staff.palestra_id).maybeSingle(),
  ]);
  const lezioni = (righe || []).filter((r) => r.stato !== 'mensile');
  const mensili = (righe || []).filter((r) => r.stato === 'mensile');

  return (
    <div className="foglio foglio-compenso">
      <Stampa />
      <header className="foglio-testa">
        <div><strong>{pal?.nome}</strong><div className="piccolo muto" style={{ whiteSpace: 'pre-wrap' }}>{pal?.dati_fiscali || pal?.indirizzo}</div></div>
        <div style={{ textAlign: 'right' }}>
          <div className="piccolo muto">Riepilogo compensi</div>
          <strong style={{ fontSize: 20, textTransform: 'capitalize' }}>{MESI[c.mese - 1]} {c.anno}</strong>
        </div>
      </header>
      <h2 style={{ margin: '18px 0 2px' }}>{c.staff?.nome} {c.staff?.cognome}</h2>
      <p className="piccolo muto" style={{ marginTop: 0 }}>
        {c.lezioni} lezioni contate · {Number(c.ore).toFixed(2).replace('.', ',')} ore
        {c.sostituzioni > 0 && ` · ${c.sostituzioni} sostituzioni fatte`}
        {c.da_verificare > 0 && ` · ${c.da_verificare} lezioni non confermate (non contate)`}
        {c.tariffa_cent > 0 && ` · tariffa standard ${euro(c.tariffa_cent)}/ora`}
      </p>

      <table style={{ width: '100%', marginTop: 10 }}>
        <thead><tr><th>Data</th><th>Lezione</th><th>Ore</th><th>Pers.</th><th>Come</th><th style={{ textAlign: 'right' }}>Importo</th></tr></thead>
        <tbody>
          {lezioni.map((r, i) => (
            <tr key={i} className={`cr-${r.stato}`}>
              <td style={{ whiteSpace: 'nowrap' }}>{dataBreve(r.data)}{r.inizio ? ` ${ora(r.inizio)}` : ''}</td>
              <td>{r.corso}{r.sostituzione ? <div className="piccolo muto">{r.sostituzione}</div> : null}</td>
              <td>{Number(r.ore).toFixed(2).replace('.', ',')}</td>
              <td>{r.presenti ?? '—'}/{r.prenotati ?? '—'}</td>
              <td className="piccolo">{[r.regola, NOTA[r.stato]].filter(Boolean).join(' · ')}</td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{r.stato === 'contata' ? euro(r.importo_cent) : '—'}</td>
            </tr>
          ))}
          {mensili.map((r, i) => (
            <tr key={`m${i}`}><td colSpan={5}><strong>{r.corso}</strong> <span className="piccolo muto">· {r.regola}</span></td>
              <td style={{ textAlign: 'right' }}>{euro(r.importo_cent)}</td></tr>
          ))}
          {c.extra_cent > 0 && (
            <tr><td colSpan={5}><strong>Extra</strong>{c.extra_nota ? <span className="piccolo muto"> · {c.extra_nota}</span> : null}</td>
              <td style={{ textAlign: 'right' }}>{euro(c.extra_cent)}</td></tr>
          )}
          <tr><td colSpan={5}><strong>Totale</strong></td><td style={{ textAlign: 'right', fontSize: 20 }}><strong>{euro(c.totale_cent)}</strong></td></tr>
        </tbody>
      </table>

      <p className="piccolo muto" style={{ marginTop: 14 }}>
        Pers. = presenti all&apos;appello / prenotati. Contano le lezioni confermate con l&apos;appello (&quot;Ho tenuto io la lezione&quot;).
        {c.visto_at ? ` Conteggio confermato dall'insegnante il ${dataBreve(c.visto_at)}.` : ' Da controllare e confermare dall\'app: menù → I miei compensi.'}
        {c.stato === 'pagato' ? ` Pagato il ${dataBreve(c.pagato_at)}.` : ''}
      </p>
    </div>
  );
}
