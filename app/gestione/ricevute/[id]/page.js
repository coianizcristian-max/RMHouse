import { notFound } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import { euro, dataBreve } from '@/lib/formato';
import Stampa from './Stampa';

export const dynamic = 'force-dynamic';

// Foglio della ricevuta, pensato per la stampa o il PDF del browser
export default async function PaginaRicevuta({ params }) {
  const { id } = await params;
  const { supabase, staff } = await staffCorrente();

  const [{ data: r }, { data: pal }] = await Promise.all([
    supabase.from('ricevute').select('*, numerazioni ( codice ), aliquote_iva ( riferimento, percentuale ), rif:riferimento_id ( numero, anno, data, tipo_documento, numerazioni ( codice ) )').eq('id', id).maybeSingle(),
    supabase.from('palestre').select('nome, indirizzo, telefono, email, dicitura_ricevuta, dati_fiscali, fatturazione')
      .eq('id', staff.palestra_id).maybeSingle(),
  ]);
  if (!r) notFound();
  // fattura, o nota di credito su una fattura: documenti fiscali con cliente completo e file XML
  const fattura = r.tipo_documento === 'fattura' || (r.tipo_documento === 'nota_credito' && r.rif?.tipo_documento === 'fattura');
  const fz = pal?.fatturazione || {};
  const c = r.cliente || {};

  return (
    <div className="foglio">
      <Stampa />

      <header className="foglio-testa">
        <div>
          <strong>{fattura && fz.denominazione ? fz.denominazione : pal?.nome}</strong>
          <div className="piccolo muto" style={{ whiteSpace: 'pre-wrap' }}>
            {fattura && fz.piva
              ? [`${fz.indirizzo}, ${fz.cap} ${fz.comune}${fz.provincia ? ` (${fz.provincia})` : ''}`, `P.IVA ${fz.piva}${fz.cf && fz.cf !== fz.piva ? ` · C.F. ${fz.cf}` : ''}`, pal?.email].filter(Boolean).join('\n')
              : pal?.dati_fiscali || [pal?.indirizzo, pal?.telefono, pal?.email].filter(Boolean).join('\n')}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="piccolo muto">{r.tipo_documento === 'nota_credito' ? 'Nota di credito' : fattura ? 'Fattura' : 'Ricevuta'}</div>
          <strong style={{ fontSize: 22 }}>{r.numerazioni?.codice ? `${r.numerazioni.codice} ` : ''}n. {r.numero}/{r.anno}</strong>
          <div className="piccolo muto">{dataBreve(r.data)}</div>
        </div>
      </header>

      {r.annullata && <div className="errore">ANNULLATA — {r.motivo_annullo}</div>}
      {r.tipo_documento === 'nota_credito' && r.rif && (
        <p className="piccolo" style={{ marginTop: 12 }}>
          A rettifica {r.rif.tipo_documento === 'fattura' ? `della fattura n. ${r.rif.numerazioni?.codice || ''} ${r.rif.numero}/${r.rif.anno}` : `della ricevuta n. ${r.rif.numero}/${r.rif.anno}`} del {dataBreve(r.rif.data)}.
        </p>
      )}

      <section style={{ marginTop: 26 }}>
        <div className="piccolo muto">{fattura ? 'Cliente' : r.tipo_documento === 'nota_credito' ? 'Rimborso a' : 'Ricevuta da'}</div>
        <strong style={{ fontSize: 17 }}>{r.intestatario}</strong>
        <div className="piccolo muto">
          {fattura
            ? [r.indirizzo, c.piva && `P.IVA ${c.piva}`, c.cf && `C.F. ${c.cf}`,
               c.codice_destinatario && c.codice_destinatario !== '0000000' ? `Codice destinatario ${c.codice_destinatario}` : c.pec ? `PEC ${c.pec}` : null].filter(Boolean).join(' · ')
            : [r.indirizzo, r.codice_fiscale && `C.F. ${r.codice_fiscale}`].filter(Boolean).join(' · ')}
        </div>
      </section>

      <table style={{ marginTop: 26, width: '100%' }}>
        <thead>
          <tr><th>Descrizione</th><th style={{ textAlign: 'right' }}>Importo</th></tr>
        </thead>
        <tbody>
          <tr><td>{r.descrizione}{fattura && <span className="piccolo muto"> · imponibile</span>}</td><td style={{ textAlign: 'right' }}>{euro(r.importo_cent)}</td></tr>
          <tr>
            <td>{r.iva_cent ? (r.aliquote_iva?.percentuale != null ? `IVA ${Number(r.aliquote_iva.percentuale)}%` : `IVA (${r.aliquota})`) : `${r.aliquota}${r.natura ? ` · ${r.natura}` : ''}${r.aliquote_iva?.riferimento ? ` · ${r.aliquote_iva.riferimento}` : ''}`}</td>
            <td style={{ textAlign: 'right' }}>{euro(r.iva_cent)}</td>
          </tr>
          <tr>
            <td><strong>Totale</strong></td>
            <td style={{ textAlign: 'right', fontSize: 20 }}><strong>{euro(r.importo_cent + r.iva_cent)}</strong></td>
          </tr>
        </tbody>
      </table>

      <p className="piccolo muto" style={{ marginTop: 18 }}>
        Pagato con {r.metodo || 'metodo non indicato'}{r.note ? ` · ${r.note}` : ''}
      </p>

      {fattura && r.bollo_cent > 0 && <p className="piccolo">Imposta di bollo di {euro(r.bollo_cent)} assolta in modo virtuale.</p>}
      {fattura ? (
        <div className="fattura-cortesia">
          Copia di cortesia. Il documento valido è quello elettronico (file XML) trasmesso al Sistema di Interscambio
          e disponibile nella tua area riservata del sito dell&apos;Agenzia delle Entrate.
        </div>
      ) : (
        <footer className="foglio-piede">
          {pal?.dicitura_ricevuta}
        </footer>
      )}
    </div>
  );
}
