import { notFound } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import Stampa from '../../ricevute/[id]/Stampa';

export const dynamic = 'force-dynamic';

// Il modulo firmato, com'era al momento della firma
export default async function FirmaStampata({ params }) {
  const { id } = await params;
  const { supabase, staff } = await staffCorrente();
  const [{ data: f }, { data: pal }] = await Promise.all([
    supabase.from('firme').select('*, allievi ( nome, cognome, data_nascita, codice_fiscale )').eq('id', id).maybeSingle(),
    supabase.from('palestre').select('nome, dati_fiscali, indirizzo').eq('id', staff.palestra_id).maybeSingle(),
  ]);
  if (!f) notFound();
  const quando = new Date(f.firmato_at).toLocaleString('it-IT', { timeZone: 'Europe/Rome', dateStyle: 'long', timeStyle: 'short' });
  return (
    <div className="foglio">
      <Stampa />
      <header className="foglio-testa">
        <div><strong>{pal?.nome}</strong><div className="piccolo muto" style={{ whiteSpace: 'pre-wrap' }}>{pal?.dati_fiscali || pal?.indirizzo}</div></div>
        <div style={{ textAlign: 'right' }}><div className="piccolo muto">Modulo firmato</div><strong>versione {f.versione}</strong></div>
      </header>
      <h2 style={{ marginTop: 22 }}>{f.titolo}</h2>
      <p className="piccolo muto">
        Per {f.allievi?.nome} {f.allievi?.cognome}{f.allievi?.codice_fiscale ? ` · C.F. ${f.allievi.codice_fiscale}` : ''}
      </p>
      <div style={{ whiteSpace: 'pre-wrap', marginTop: 12 }}>{f.testo}</div>
      <div className="firma-stampata">
        <div className="piccolo muto">
          Firmato da <strong>{f.firmatario}</strong>{f.firmatario_cf ? ` (C.F. ${f.firmatario_cf})` : ''}{f.per_conto ? ', genitore o tutore' : ''}
          {' '}il {quando}, {f.dove === 'reception' ? 'alla reception' : "dall'area clienti"}.
        </div>
        {/* come immagine: un SVG dentro <img> non può eseguire nulla */}
        <img className="firma-img" alt={`Firma di ${f.firmatario}`} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(f.firma_svg)}`} />
      </div>
    </div>
  );
}
