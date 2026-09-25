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
    supabase.from('ricevute').select('*, numerazioni ( codice ), aliquote_iva ( riferimento ), rif:ricevute!riferimento_id ( numero, anno, data )').eq('id', id).maybeSingle(),
    supabase.from('palestre').select('nome, indirizzo, telefono, email, dicitura_ricevuta, dati_fiscali')
      .eq('id', staff.palestra_id).maybeSingle(),
  ]);
  if (!r) notFound();

  return (
    <div className="foglio">
      <Stampa />

      <header className="foglio-testa">
        <div>
          <strong>{pal?.nome}</strong>
          <div className="piccolo muto" style={{ whiteSpace: 'pre-wrap' }}>
            {pal?.dati_fiscali || [pal?.indirizzo, pal?.telefono, pal?.email].filter(Boolean).join('\n')}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="piccolo muto">{r.tipo_documento === 'nota_credito' ? 'Nota di credito' : 'Ricevuta'}</div>
          <strong style={{ fontSize: 22 }}>{r.numerazioni?.codice ? `${r.numerazioni.codice} ` : ''}n. {r.numero}/{r.anno}</strong>
          <div className="piccolo muto">{dataBreve(r.data)}</div>
        </div>
      </header>

      {r.annullata && <div className="errore">ANNULLATA — {r.motivo_annullo}</div>}
      {r.tipo_documento === 'nota_credito' && r.rif && (
        <p className="piccolo" style={{ marginTop: 12 }}>
          A rettifica della ricevuta n. {r.rif.numero}/{r.rif.anno} del {dataBreve(r.rif.data)}.
        </p>
      )}

      <section style={{ marginTop: 26 }}>
        <div className="piccolo muto">{r.tipo_documento === 'nota_credito' ? 'Rimborso a' : 'Ricevuta da'}</div>
        <strong style={{ fontSize: 17 }}>{r.intestatario}</strong>
        <div className="piccolo muto">
          {[r.indirizzo, r.codice_fiscale && `C.F. ${r.codice_fiscale}`].filter(Boolean).join(' · ')}
        </div>
      </section>

      <table style={{ marginTop: 26, width: '100%' }}>
        <thead>
          <tr><th>Descrizione</th><th style={{ textAlign: 'right' }}>Importo</th></tr>
        </thead>
        <tbody>
          <tr><td>{r.descrizione}</td><td style={{ textAlign: 'right' }}>{euro(r.importo_cent)}</td></tr>
          <tr>
            <td>{r.iva_cent ? `IVA (${r.aliquota})` : `${r.aliquota}${r.natura ? ` · ${r.natura}` : ''}${r.aliquote_iva?.riferimento ? ` · ${r.aliquote_iva.riferimento}` : ''}`}</td>
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

      <footer className="foglio-piede">
        {pal?.dicitura_ricevuta}
      </footer>
    </div>
  );
}
