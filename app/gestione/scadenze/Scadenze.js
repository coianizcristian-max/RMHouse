'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { dataBreve, euro } from '@/lib/formato';
import { TIPI_SCADENZA, scaricaCsv } from '@/lib/stati';

const chiave = (r) => `${r.tipo}|${r.allievo_id}|${r.riferimento}`;
const quando = (g) => g == null ? '—' : g < 0 ? `${-g} giorni fa` : g === 0 ? 'oggi' : g === 1 ? 'domani' : `tra ${g} giorni`;
const whatsapp = (tel) => {
  const n = String(tel || '').replace(/[^\d+]/g, '').replace(/^\+/, '');
  return n ? `https://wa.me/${n.length <= 10 ? '39' + n : n}` : null;
};

export default function Scadenze({ palestraId, righe }) {
  const router = useRouter();
  const [scelte, setScelte] = useState(new Set());
  const [nota, setNota] = useState('');
  const [avviso, setAvviso] = useState('');
  const selezionate = righe.filter((r) => scelte.has(chiave(r)));
  const tutte = righe.length > 0 && righe.every((r) => scelte.has(chiave(r)));
  const email = [...new Set(selezionate.map((r) => r.email).filter(Boolean))];
  const cambia = (k) => { const s = new Set(scelte); s.has(k) ? s.delete(k) : s.add(k); setScelte(s); };
  const mostra = (t) => { setAvviso(t); setTimeout(() => setAvviso(''), 3000); };

  async function gestisci(elenco, gestito) {
    const db = supabaseBrowser();
    const { error } = gestito
      ? await db.from('scadenze_gestite').upsert(elenco.map((r) => ({
          palestra_id: palestraId, allievo_id: r.allievo_id, tipo: r.tipo, riferimento: r.riferimento, nota: nota || null,
        })), { onConflict: 'allievo_id,tipo,riferimento' })
      : await db.from('scadenze_gestite').delete().in('allievo_id', elenco.map((r) => r.allievo_id))
          .in('tipo', elenco.map((r) => r.tipo)).in('riferimento', elenco.map((r) => r.riferimento));
    if (error) { mostra('Operazione non riuscita'); return; }
    setScelte(new Set()); setNota('');
    mostra(gestito ? 'Segnate come gestite' : 'Tornate da gestire');
    router.refresh();
  }

  function esporta() {
    const elenco = selezionate.length ? selezionate : righe;
    scaricaCsv('scadenze.csv', ['Tipo', 'Cognome', 'Nome', 'Chi paga', 'Scadenza', 'Dettaglio', 'Importo', 'Email', 'Telefono', 'Gestita'],
      elenco.map((r) => [TIPI_SCADENZA[r.tipo], r.cognome, r.nome, r.is_titolare ? '' : `${r.titolare_nome} ${r.titolare_cognome}`.trim(),
        r.data || '', r.dettaglio, r.importo_cent != null ? (r.importo_cent / 100).toFixed(2).replace('.', ',') : '',
        r.email || '', r.telefono || '', r.gestito ? 'sì' : '']));
  }

  if (righe.length === 0) return <div className="vuoto">Niente da gestire qui. Ottimo.</div>;

  return (
    <>
      <div className="elenco-testa">
        <label className="spunta" style={{ margin: 0 }}>
          <input type="checkbox" checked={tutte} onChange={() => setScelte(tutte ? new Set() : new Set(righe.map(chiave)))} />
          <span>{tutte ? 'Deseleziona tutto' : 'Seleziona tutto'}</span>
        </label>
        <span className="piccolo muto">{righe.length} scadenze</span>
        <button className="link-btn piccolo" onClick={esporta}>Esporta in CSV</button>
      </div>

      <div className="tabella-scorre">
        <table className="tabella-persone">
          <thead>
            <tr>
              <th aria-label="Seleziona" />
              <th>Persona</th>
              <th>Cosa</th>
              <th>Quando</th>
              <th className="col-desktop">Contatti</th>
              <th aria-label="Azioni" />
            </tr>
          </thead>
          <tbody>
            {righe.map((r) => {
              const k = chiave(r);
              const wa = whatsapp(r.telefono);
              return (
                <tr key={k} className={scelte.has(k) ? 'selezionata' : r.gestito ? 'gestita' : undefined}>
                  <td><input type="checkbox" aria-label={`Seleziona ${r.nome} ${r.cognome}`} checked={scelte.has(k)} onChange={() => cambia(k)} /></td>
                  <td>
                    <Link className="persona-nome" href={`/gestione/persone/${r.allievo_id}`}>{r.cognome} {r.nome}</Link>
                    {!r.is_titolare && <div className="piccolo muto">paga {r.titolare_nome} {r.titolare_cognome}</div>}
                  </td>
                  <td>
                    <span className="tag tag-neutro">{TIPI_SCADENZA[r.tipo]}</span>
                    <div className="piccolo">{r.dettaglio}{r.importo_cent != null && <> · {euro(r.importo_cent)}</>}</div>
                    {r.gestito && <div className="piccolo muto">gestita il {dataBreve(r.gestito_at)}{r.nota_gestione && `: ${r.nota_gestione}`}</div>}
                  </td>
                  <td className="piccolo">
                    <span className={r.giorni != null && r.giorni < 0 ? 'scaduta' : r.giorni != null && r.giorni <= 3 ? 'vicina' : ''}>
                      {quando(r.giorni)}
                    </span>
                    {r.data && <div className="muto">{dataBreve(r.data)}</div>}
                  </td>
                  <td className="col-desktop piccolo">
                    {r.telefono && <a href={`tel:${r.telefono}`}>{r.telefono}</a>}
                    {r.telefono && r.email && <br />}
                    {r.email ? <a href={`mailto:${r.email}`}>{r.email}</a> : <span className="muto">senza email</span>}
                  </td>
                  <td className="piccolo" style={{ whiteSpace: 'nowrap' }}>
                    {wa && <a href={wa} target="_blank" rel="noreferrer">WhatsApp</a>}
                    {wa && ' · '}
                    <button className="link-btn" onClick={() => gestisci([r], !r.gestito)}>{r.gestito ? 'riapri' : 'gestita'}</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {scelte.size > 0 && (
        <div className="barra-selezione" role="region" aria-label="Azioni sulle scadenze selezionate">
          <strong>{scelte.size} selezionate</strong>
          <input className="nota-breve" placeholder="Nota (facoltativa): es. chiamata, richiama lunedì" value={nota}
                 onChange={(e) => setNota(e.target.value)} />
          <div className="azioni">
            <button className="btn btn-primario" onClick={() => gestisci(selezionate, true)}>Segna gestite</button>
            <button className="btn" onClick={async () => { await navigator.clipboard.writeText(email.join(', ')); mostra(`${email.length} email copiate`); }}
                    disabled={!email.length}>Copia email</button>
            <a className="btn" href={email.length ? `mailto:?bcc=${encodeURIComponent(email.join(','))}` : undefined}>Scrivi</a>
            <button className="btn" onClick={esporta}>Esporta</button>
            <button className="link-btn" onClick={() => setScelte(new Set())}>Annulla</button>
          </div>
          {avviso && <div className="piccolo" role="status">{avviso}</div>}
        </div>
      )}
      {avviso && scelte.size === 0 && <div className="piccolo" role="status" style={{ marginTop: 8 }}>{avviso}</div>}
    </>
  );
}
