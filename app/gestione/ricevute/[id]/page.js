import { notFound } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import { euro, dataBreve } from '@/lib/formato';
import Stampa from './Stampa';
import FoglioRicevuta from '../FoglioRicevuta';

export const dynamic = 'force-dynamic';

// Foglio della ricevuta, pensato per la stampa o il PDF del browser
export default async function PaginaRicevuta({ params }) {
  const { id } = await params;
  const { supabase, staff } = await staffCorrente();

  const [{ data: r }, { data: pal }, { data: sedi }] = await Promise.all([
    supabase.from('ricevute').select('*, numerazioni ( codice ), aliquote_iva ( riferimento, percentuale ), rif:riferimento_id ( numero, anno, data, tipo_documento, numerazioni ( codice ) ), account ( email, telefono, nome )').eq('id', id).maybeSingle(),
    supabase.from('palestre').select('nome, indirizzo, telefono, email, dicitura_ricevuta, dati_fiscali, fatturazione')
      .eq('id', staff.palestra_id).maybeSingle(),
    supabase.from('sedi').select('logo_url, principale, ordine').eq('palestra_id', staff.palestra_id).not('logo_url', 'is', null).order('principale', { ascending: false }).order('ordine').limit(1),
  ]);
  if (!r) notFound();
  const tipo = r.tipo_documento === 'nota_credito' ? 'Nota di credito' : r.tipo_documento === 'fattura' ? 'Fattura' : 'Ricevuta';
  const documento = {
    id: r.id, token: r.token, tipo, numero: `${r.numerazioni?.codice ? `${r.numerazioni.codice} ` : ''}${r.numero}/${r.anno}`, data: dataBreve(r.data),
    importo: euro(r.importo_cent + r.iva_cent), descrizione: r.descrizione, annullata: r.annullata,
    email: r.account?.email || '', telefono: r.account?.telefono || '', nome: r.account?.nome || '', gestione: staff.ruolo !== 'insegnante',
  };

  return (
    <div className="foglio">
      <Stampa documento={documento} />
      <FoglioRicevuta r={r} pal={pal} logo={sedi?.[0]?.logo_url || '/logo.png'} />
    </div>
  );
}
