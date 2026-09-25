'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { dataBreve, etaAl } from '@/lib/formato';
import { STATI_CLIENTE, scaricaCsv } from '@/lib/stati';

// Elenco con spunte: chi selezioni finisce nella barra d'azioni in basso
export default function ElencoPersone({ palestraId, persone, etichette, totale, esporta }) {
  const router = useRouter();
  const [scelti, setScelti] = useState(new Set());
  const [pannello, setPannello] = useState(null);     // 'etichetta'
  const [nuova, setNuova] = useState('');
  const [avviso, setAvviso] = useState('');

  const tutti = persone.length > 0 && persone.every((p) => scelti.has(p.id));
  const selezionate = persone.filter((p) => scelti.has(p.id));
  const cambia = (id) => {
    const s = new Set(scelti);
    s.has(id) ? s.delete(id) : s.add(id);
    setScelti(s);
  };

  const email = [...new Set(selezionate.map((p) => p.email).filter(Boolean))];

  function mostra(testo) { setAvviso(testo); setTimeout(() => setAvviso(''), 3000); }

  async function copiaEmail() {
    await navigator.clipboard.writeText(email.join(', '));
    mostra(`${email.length} indirizzi copiati`);
  }

  function esportaScelti() {
    scaricaCsv('persone-selezionate.csv',
      ['Cognome', 'Nome', 'Nascita', 'Chi paga', 'Email', 'Telefono', 'Stato', 'Abbonamento fino al', 'Certificato fino al', 'Etichette'],
      selezionate.map((p) => [p.cognome, p.nome, p.data_nascita || '', p.is_titolare ? '' : `${p.titolare_nome} ${p.titolare_cognome}`.trim(),
        p.email || '', p.telefono || '', STATI_CLIENTE[p.stato]?.testo || p.stato, p.fine_prossima || p.ultima_fine || '',
        p.certificato_scadenza || '', (p.etichette || []).join(', ')]));
  }

  async function etichetta(id, togli = false) {
    const db = supabaseBrowser();
    let etichettaId = id;
    if (!etichettaId) {
      const nome = nuova.trim();
      if (!nome) return;
      const { data, error } = await db.from('etichette').insert({ palestra_id: palestraId, nome }).select('id').single();
      if (error) { mostra('Etichetta già esistente o non valida'); return; }
      etichettaId = data.id;
    }
    const righe = selezionate.map((p) => ({ allievo_id: p.id, etichetta_id: etichettaId, palestra_id: palestraId }));
    const { error } = togli
      ? await db.from('allievi_etichette').delete().eq('etichetta_id', etichettaId).in('allievo_id', selezionate.map((p) => p.id))
      : await db.from('allievi_etichette').upsert(righe, { onConflict: 'allievo_id,etichetta_id', ignoreDuplicates: true });
    if (error) { mostra('Operazione non riuscita'); return; }
    setPannello(null); setNuova('');
    mostra(togli ? 'Etichetta tolta' : 'Etichetta aggiunta');
    router.refresh();
  }

  return (
    <>
      <div className="elenco-testa">
        <label className="spunta" style={{ margin: 0 }}>
          <input type="checkbox" checked={tutti}
                 onChange={() => setScelti(tutti ? new Set() : new Set(persone.map((p) => p.id)))} />
          <span>{tutti ? 'Deseleziona' : 'Seleziona'} questa pagina</span>
        </label>
        <span className="piccolo muto">{totale} persone</span>
        <a className="link-btn piccolo" href={esporta}>Esporta tutte in CSV</a>
      </div>

      {persone.length === 0 && <div className="vuoto">Nessuna persona con questi filtri.</div>}

      {persone.length > 0 && (
        <div className="tabella-scorre">
          <table className="tabella-persone">
            <thead>
              <tr>
                <th aria-label="Seleziona" />
                <th>Persona</th>
                <th>Stato</th>
                <th className="col-desktop">Abbonamento</th>
                <th className="col-desktop">Certificato</th>
                <th className="col-desktop">Contatti</th>
              </tr>
            </thead>
            <tbody>
              {persone.map((p) => {
                const st = STATI_CLIENTE[p.stato];
                return (
                  <tr key={p.id} className={scelti.has(p.id) ? 'selezionata' : undefined}>
                    <td><input type="checkbox" aria-label={`Seleziona ${p.nome} ${p.cognome}`}
                               checked={scelti.has(p.id)} onChange={() => cambia(p.id)} /></td>
                    <td>
                      <Link className="persona-nome" href={`/gestione/persone/${p.id}`}>{p.cognome} {p.nome}</Link>
                      {p.data_nascita && <span className="piccolo muto"> · {etaAl(p.data_nascita)} anni</span>}
                      {!p.is_titolare && (
                        <div className="piccolo muto">paga {p.titolare_nome} {p.titolare_cognome}</div>
                      )}
                      {(p.etichette?.length > 0 || p.senza_orari || p.quota_mancante) && (
                        <div className="segni">
                          {p.senza_orari && <span className="tag tag-attenzione">giorni da assegnare</span>}
                          {p.quota_mancante && <span className="tag tag-attenzione">quota</span>}
                          {p.etichette?.map((e) => <span key={e} className="tag tag-neutro"># {e}</span>)}
                        </div>
                      )}
                    </td>
                    <td><span className={`tag tag-${st?.tono || 'neutro'}`}>{st?.testo || p.stato}</span></td>
                    <td className="col-desktop piccolo">
                      {p.fine_prossima ? <>fino al {dataBreve(p.fine_prossima)}</>
                        : p.ultima_fine ? <span className="muto">finito il {dataBreve(p.ultima_fine)}</span> : <span className="muto">—</span>}
                    </td>
                    <td className="col-desktop piccolo">
                      {p.certificato_scaduto
                        ? <span style={{ color: 'var(--rosso-scuro)' }}>{p.certificato_scadenza ? `scaduto il ${dataBreve(p.certificato_scadenza)}` : 'mancante'}</span>
                        : p.certificato_scadenza ? <span className="muto">fino al {dataBreve(p.certificato_scadenza)}</span> : <span className="muto">—</span>}
                    </td>
                    <td className="col-desktop piccolo">
                      {p.telefono && <a href={`tel:${p.telefono}`}>{p.telefono}</a>}
                      {p.telefono && p.email && <br />}
                      {p.email ? <a href={`mailto:${p.email}`}>{p.email}</a> : <span className="muto">senza email</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {scelti.size > 0 && (
        <div className="barra-selezione" role="region" aria-label="Azioni sulle persone selezionate">
          <strong>{scelti.size} selezionate</strong>
          <div className="azioni">
            <button className="btn" onClick={() => setPannello(pannello === 'etichetta' ? null : 'etichetta')}>Etichetta</button>
            <button className="btn" onClick={copiaEmail} disabled={!email.length}>Copia email</button>
            <a className="btn" href={email.length ? `mailto:?bcc=${encodeURIComponent(email.join(','))}` : undefined}
               aria-disabled={!email.length}>Scrivi</a>
            <button className="btn" onClick={esportaScelti}>Esporta</button>
            <button className="link-btn" onClick={() => { setScelti(new Set()); setPannello(null); }}>Annulla</button>
          </div>
          {pannello === 'etichetta' && (
            <div className="pannello-etichette">
              <div className="pastiglie">
                {etichette.map((e) => (
                  <span key={e.id} className="doppio-bottone">
                    <button type="button" onClick={() => etichetta(e.id)}># {e.nome}</button>
                    <button type="button" className="togli" title={`Togli # ${e.nome}`} onClick={() => etichetta(e.id, true)}>×</button>
                  </span>
                ))}
              </div>
              <div className="barra-cerca" style={{ margin: 0 }}>
                <input placeholder="Nuova etichetta, es. Saggio 2027" value={nuova} onChange={(e) => setNuova(e.target.value)}
                       onKeyDown={(e) => { if (e.key === 'Enter') etichetta(null); }} />
                <button className="btn btn-primario" onClick={() => etichetta(null)} disabled={!nuova.trim()}>Crea e aggiungi</button>
              </div>
            </div>
          )}
          {avviso && <div className="piccolo" role="status">{avviso}</div>}
        </div>
      )}
      {avviso && scelti.size === 0 && <div className="piccolo" role="status" style={{ marginTop: 8 }}>{avviso}</div>}
    </>
  );
}
