'use client';
import { useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { etaAl } from '@/lib/formato';

const ETICHETTE = { prova: ['In prova', 'tag-rosso'], recupero: ['Recupero', 'tag-attenzione'], ingresso: ['Ingresso', 'tag-neutro'] };

export default function Appello({ lezioneId, palestraId, persone }) {
  const [presenze, setPresenze] = useState(Object.fromEntries(persone.map((p) => [p.allievo_id, p.presente])));
  const [errore, setErrore] = useState('');
  const [cerca, setCerca] = useState('');

  async function segna(allievoId, presente, bloccato) {
    if (presente && bloccato && !confirm('Certificato medico scaduto o mancante. Segnare comunque la presenza?')) return;
    const prima = presenze[allievoId];
    setPresenze({ ...presenze, [allievoId]: presente });
    setErrore('');
    const { error } = await supabaseBrowser().from('presenze').upsert(
      { palestra_id: palestraId, lezione_id: lezioneId, allievo_id: allievoId, presente },
      { onConflict: 'lezione_id,allievo_id' }
    );
    if (error) {
      setPresenze((p) => ({ ...p, [allievoId]: prima }));
      setErrore('Presenza non salvata. Controlla la connessione e riprova.');
    }
  }

  async function tuttiPresenti() {
    const mancanti = persone.filter((p) => presenze[p.allievo_id] == null);
    if (!mancanti.length) return;
    if (!confirm(`Segnare presenti le ${mancanti.length} persone non ancora spuntate?`)) return;
    setPresenze({ ...presenze, ...Object.fromEntries(mancanti.map((p) => [p.allievo_id, true])) });
    const { error } = await supabaseBrowser().from('presenze').upsert(
      mancanti.map((p) => ({ palestra_id: palestraId, lezione_id: lezioneId, allievo_id: p.allievo_id, presente: true })),
      { onConflict: 'lezione_id,allievo_id' }
    );
    if (error) {
      setPresenze({ ...presenze });
      setErrore('Presenze non salvate. Controlla la connessione e riprova.');
    }
  }

  const cicla = (p) => {
    const v = presenze[p.allievo_id];
    segna(p.allievo_id, v !== true, p.bloccato && v !== true);
  };

  if (!persone.length) return <div className="vuoto">Nessun iscritto o prova per questa lezione.</div>;

  const presenti = Object.values(presenze).filter((v) => v === true).length;
  const nProve = persone.filter((p) => p.tipo === 'prova').length;
  const visibili = cerca.trim()
    ? persone.filter((p) => `${p.nome} ${p.cognome}`.toLowerCase().includes(cerca.trim().toLowerCase()))
    : persone;

  return (
    <>
      <p className="piccolo muto">
        {persone.length - nProve} iscritti{nProve > 0 && `, ${nProve} in prova`} · tocca una riga per segnare la presenza
      </p>
      {errore && <div className="errore" role="alert">{errore}</div>}

      {persone.length > 10 && (
        <div className="campo" style={{ marginTop: 10 }}>
          <label htmlFor="cerca-persona">Cerca</label>
          <input id="cerca-persona" value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cognome o nome" />
        </div>
      )}

      <ul className="elenco">
        {visibili.map((p) => {
          const [etichetta, classe] = ETICHETTE[p.tipo] || [];
          const valore = presenze[p.allievo_id];
          return (
            <li key={p.allievo_id} className="persona appello-riga" onClick={() => cicla(p)}
                style={{
                  cursor: 'pointer',
                  ...(p.tipo === 'prova' ? { background: 'var(--rosso-tenue)', paddingInline: 10 }
                     : p.bloccato ? { borderLeft: '4px solid var(--rosso)', paddingInline: 10 } : {}),
                  ...(valore === true ? { boxShadow: 'inset 3px 0 0 var(--ok)' } : {}),
                  ...(valore === false ? { opacity: .55 } : {}),
                }}>
              <div>
                <span className="persona-nome">{p.cognome} {p.nome}</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  {etichetta && <span className={`tag ${classe}`}>{etichetta}</span>}
                  {etaAl(p.data_nascita) < 18 && <span className="tag tag-neutro">{etaAl(p.data_nascita)} anni</span>}
                  {p.bloccato && <span className="tag tag-rosso">Certificato scaduto</span>}
                  {p.certificato_in_scadenza && <span className="tag tag-attenzione">Certificato in scadenza</span>}
                  {p.quota_mancante && <span className="tag tag-attenzione">Quota da pagare</span>}
                </div>
              </div>
              <div className="presenza" role="group" aria-label={`Presenza di ${p.nome} ${p.cognome}`}
                   onClick={(e) => e.stopPropagation()}>
                <button type="button" className="si" aria-pressed={valore === true} onClick={() => segna(p.allievo_id, true, p.bloccato)}>Sì</button>
                <button type="button" className="no" aria-pressed={valore === false} onClick={() => segna(p.allievo_id, false)}>No</button>
              </div>
            </li>
          );
        })}
      </ul>

      {/* riepilogo sempre visibile mentre si scorre l'elenco */}
      <div className="barra-appello">
        <div>
          <strong>{presenti} presenti</strong>
          <span className="muto"> · {Object.values(presenze).filter((v) => v != null).length}/{persone.length} segnati</span>
          <div style={{ height: 5, borderRadius: 3, background: 'var(--linea)', marginTop: 5, overflow: 'hidden', width: 140 }}>
            <div style={{ width: `${Math.round((Object.values(presenze).filter((v) => v != null).length / persone.length) * 100)}%`,
                          height: '100%', background: 'var(--rosso)' }} />
          </div>
        </div>
        <button type="button" className="btn btn-primario" onClick={tuttiPresenti}>Tutti presenti</button>
      </div>
    </>
  );
}
