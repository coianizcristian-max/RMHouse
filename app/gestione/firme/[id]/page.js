import { notFound } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import Stampa from '../../ricevute/[id]/Stampa';
import { dataBreve } from '@/lib/formato';

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
  const { data: modulo } = await supabase.from('moduli').select('scelte').eq('id', f.modulo_id).maybeSingle();
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
      {f.dati && (
        <dl className="firma-dati">
          <dt>Iscritto/a</dt><dd>{f.dati.nome}{f.dati.cf ? ` · C.F. ${f.dati.cf}` : ''}</dd>
          <dt>Nascita</dt><dd>{[f.dati.nato_a, f.dati.nato_il && dataBreve(f.dati.nato_il)].filter(Boolean).join(', ') || '—'}</dd>
          <dt>Residenza</dt><dd>{f.dati.residenza || '—'}</dd>
          {f.dati.genitore
            ? <><dt>Genitore</dt><dd>{[f.dati.genitore.nome, f.dati.genitore.cellulare, f.dati.genitore.email].filter(Boolean).join(' · ')}</dd></>
            : <><dt>Contatti</dt><dd>{[f.dati.cellulare, f.dati.email].filter(Boolean).join(' · ') || '—'}</dd></>}
          <dt>Corso</dt><dd>{f.dati.corsi || '—'}</dd>
          <dt>Date</dt><dd>{[f.dati.data_prova && `prova ${dataBreve(f.dati.data_prova)}`, f.dati.data_iscrizione && `iscrizione ${dataBreve(f.dati.data_iscrizione)}`].filter(Boolean).join(' · ') || '—'}</dd>
          <dt>Tessera</dt><dd>{f.dati.tessera || '—'}</dd>
        </dl>
      )}
      <div style={{ whiteSpace: 'pre-wrap', marginTop: 12 }}>{f.testo}</div>
      {f.risposte && (
        <ul className="firma-risposte">
          {(modulo?.scelte || Object.keys(f.risposte).map((k) => ({ k, titolo: k }))).filter((s) => s.k in f.risposte).map((s) => (
            <li key={s.k}><strong>{s.titolo}</strong>: {f.risposte[s.k] ? '☒ ACCONSENTO ☐ NON ACCONSENTO' : '☐ ACCONSENTO ☒ NON ACCONSENTO'}</li>
          ))}
        </ul>
      )}
      <div className="firma-stampata">
        <div className="piccolo muto">
          Firmato da <strong>{f.firmatario}</strong>{f.firmatario_cf ? ` (C.F. ${f.firmatario_cf})` : ''}{f.per_conto ? ', genitore o tutore' : ''}
          {' '}il {quando}, {f.dove === 'reception' ? 'alla reception' : "dall'area clienti"}.
        </div>
        {/* come immagine: un SVG dentro <img> non può eseguire nulla */}
        <img className="firma-img" alt={`Firma di ${f.firmatario}`} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(f.firma_svg)}`} />
        {f.firma2_svg && (
          <>
            <div className="piccolo muto" style={{ marginTop: 14 }}>Secondo genitore: <strong>{f.firma2_nome}</strong></div>
            <img className="firma-img" alt={`Firma di ${f.firma2_nome}`} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(f.firma2_svg)}`} />
          </>
        )}
        {f.dichiarazione && <div className="piccolo" style={{ marginTop: 10 }}>{f.dichiarazione}</div>}
      </div>
    </div>
  );
}
