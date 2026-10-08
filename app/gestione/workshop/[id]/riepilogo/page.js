import { notFound, redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import { euro, dataBreve } from '@/lib/formato';
import { giornoOra, contiWorkshop } from '@/lib/workshop';
import Stampa from '../../../ricevute/[id]/Stampa';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Riepilogo del workshop' };

// "Nome C.": nel riepilogo che esce dalla scuola i partecipanti si vedono solo con nome e iniziale del cognome
const ridotto = (a) => {
  const nome = (a?.nome || '').trim();
  const iniz = (a?.cognome || '').trim().charAt(0).toUpperCase();
  return `${nome}${iniz ? ` ${iniz}.` : ''}` || '—';
};
const STATO = { pagato: 'pagato', in_attesa: 'da pagare', annullato: 'non pagato' };

// Il riepilogo di un workshop per l'insegnante: da stampare o salvare in PDF e allegare alla sua ricevuta o fattura
// (o da tenere con il cedolino, se è della scuola). Iscritti, cosa hanno preso, quanto è stato incassato, compenso.
export default async function RiepilogoWorkshop({ params }) {
  const { id } = await params;
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const p = staff.palestra_id;
  const [{ data: w }, { data: momenti }, { data: opzioni }, { data: iscrizioni }, { data: pal }] = await Promise.all([
    supabase.from('workshop').select('*').eq('id', id).eq('palestra_id', p).maybeSingle(),
    supabase.from('workshop_momenti').select('id, titolo, inizio, fine, sale ( nome )').eq('workshop_id', id).order('inizio').order('ordine'),
    supabase.from('workshop_opzioni').select('id, nome, momenti').eq('workshop_id', id).order('ordine').order('nome'),
    supabase.from('workshop_iscrizioni').select('id, opzione_id, stato, esterno, prezzo_cent, quota_cent, presenze, pagamenti ( stato, pagato_at ), allievi ( nome, cognome )')
      .eq('workshop_id', id).eq('stato', 'iscritto'),
    supabase.from('palestre').select('nome, dati_fiscali, indirizzo').eq('id', p).maybeSingle(),
  ]);
  if (!w) notFound();
  const righe = (iscrizioni || []).slice().sort((a, b) => ridotto(a.allievi).localeCompare(ridotto(b.allievi), 'it'));
  const conti = contiWorkshop(w, righe);
  const opz = (oid) => (opzioni || []).find((o) => o.id === oid);
  const perOpzione = (opzioni || []).map((o) => {
    const di = righe.filter((i) => i.opzione_id === o.id);
    return { ...o, n: di.length, incassato: di.filter((i) => i.pagamenti?.stato === 'pagato').reduce((t, i) => t + (i.prezzo_cent || 0), 0) };
  }).filter((o) => o.n > 0);
  const presenti = (m) => righe.filter((i) => (i.presenze || []).includes(m.id)).length;
  const comeCompenso = w.compenso_tipo === 'fisso' ? 'compenso fisso concordato'
    : w.compenso_tipo === 'percentuale' ? `${Number(w.compenso_percentuale || 0).toLocaleString('it-IT')}% dell'incassato del workshop` : 'nessun compenso indicato';

  return (
    <div className="foglio foglio-compenso">
      <Stampa />
      <header className="foglio-testa">
        <div><strong>{pal?.nome}</strong><div className="piccolo muto" style={{ whiteSpace: 'pre-wrap' }}>{pal?.dati_fiscali || pal?.indirizzo}</div></div>
        <div style={{ textAlign: 'right' }}>
          <div className="piccolo muto">Riepilogo del workshop</div>
          <strong style={{ fontSize: 18 }}>{w.titolo}</strong>
        </div>
      </header>

      <h2 style={{ margin: '18px 0 2px' }}>{w.insegnante || 'Insegnante'}</h2>
      <p className="piccolo muto" style={{ marginTop: 0 }}>
        {w.insegnante_id ? 'Insegnante della scuola: il compenso è nel cedolino del mese.' : 'Insegnante esterno/a: riepilogo da allegare alla ricevuta o fattura.'}
      </p>

      <h3 style={{ margin: '14px 0 4px', fontSize: 15 }}>Quando</h3>
      <table style={{ width: '100%' }}>
        <tbody>
          {(momenti || []).map((m) => (
            <tr key={m.id}>
              <td>{m.titolo}</td>
              <td>{giornoOra(m.inizio, m.fine)}{m.sale?.nome ? ` · ${m.sale.nome}` : ''}</td>
              <td style={{ textAlign: 'right' }}>{presenti(m) ? `${presenti(m)} presenti` : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 style={{ margin: '16px 0 4px', fontSize: 15 }}>Partecipanti ({righe.length})</h3>
      <table style={{ width: '100%' }}>
        <thead><tr><th>Partecipante</th><th>Opzione</th><th>Pagamento</th><th style={{ textAlign: 'right' }}>Workshop</th></tr></thead>
        <tbody>
          {righe.map((i) => (
            <tr key={i.id}>
              <td>{ridotto(i.allievi)}</td>
              <td>{opz(i.opzione_id)?.nome || '—'}</td>
              <td className="piccolo">{i.prezzo_cent ? (STATO[i.pagamenti?.stato] || '—') : 'gratuito'}
                {i.pagamenti?.stato === 'pagato' && i.pagamenti?.pagato_at ? ` il ${dataBreve(i.pagamenti.pagato_at)}` : ''}</td>
              <td style={{ textAlign: 'right' }}>{euro(i.prezzo_cent || 0)}</td>
            </tr>
          ))}
          {righe.length === 0 && <tr><td colSpan={4} className="muto">Nessun partecipante.</td></tr>}
        </tbody>
      </table>

      {perOpzione.length > 1 && (
        <>
          <h3 style={{ margin: '16px 0 4px', fontSize: 15 }}>Per opzione</h3>
          <table style={{ width: '100%' }}>
            <tbody>
              {perOpzione.map((o) => (
                <tr key={o.id}><td>{o.nome}</td><td>{o.n} {o.n === 1 ? 'iscritto' : 'iscritti'}</td><td style={{ textAlign: 'right' }}>{euro(o.incassato)} incassati</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h3 style={{ margin: '16px 0 4px', fontSize: 15 }}>Conti</h3>
      <table style={{ width: '100%' }}>
        <tbody>
          <tr><td>Incassato per il workshop <span className="piccolo muto">(senza le quote associative annuali)</span></td><td style={{ textAlign: 'right' }}>{euro(conti.incassato)}</td></tr>
          {conti.daIncassare > 0 && <tr><td>Ancora da incassare <span className="piccolo muto">({conti.nDaPagare} {conti.nDaPagare === 1 ? 'persona' : 'persone'})</span></td><td style={{ textAlign: 'right' }}>{euro(conti.daIncassare)}</td></tr>}
          <tr><td><strong>Compenso</strong> <span className="piccolo muto">· {comeCompenso}</span></td>
            <td style={{ textAlign: 'right', fontSize: 18 }}><strong>{euro(w.compenso_pagato_cent ?? conti.compenso)}</strong></td></tr>
        </tbody>
      </table>
      {w.compenso_pagato_at && (
        <p className="piccolo" style={{ marginTop: 8 }}>
          Pagato il {dataBreve(w.compenso_pagato_at)}{w.compenso_metodo ? ` con ${w.compenso_metodo}` : ''}{w.compenso_documento ? ` · ${w.compenso_documento}` : ''}.
        </p>
      )}
      <p className="piccolo muto" style={{ marginTop: 14 }}>
        Per riservatezza i partecipanti sono indicati solo con il nome e l&apos;iniziale del cognome. Riepilogo del {dataBreve(new Date().toISOString())}.
      </p>
    </div>
  );
}
