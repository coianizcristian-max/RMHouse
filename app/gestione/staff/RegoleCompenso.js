'use client';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { euro, dataBreve } from '@/lib/formato';

// Le regole di compenso di un insegnante. Senza regole vale la tariffa oraria standard della scheda.
// Per ogni lezione si usa la regola più precisa: corso > disciplina > lezioni private > tutte.
export const TIPI = {
  ora: ['A ora', 'Un importo per ogni ora di lezione (le lezioni da 1h30 valgono 1,5 ore).'],
  lezione: ['A lezione', 'Un importo fisso per ogni lezione, qualunque sia la durata.'],
  fasce: ['A fasce di persone', 'L\'importo cambia con quante persone c\'erano (o si erano prenotate).'],
  a_persona: ['A persona', 'Un importo per ogni persona presente (o prenotata), con minimo e massimo se vuoi.'],
  privata: ['Lezione privata', 'Un importo per ogni lezione privata confermata.'],
  forfait_mese: ['Forfait mensile di un corso', 'Un importo fisso al mese per un corso (es. corso didattico): le sue lezioni non si pagano a parte.'],
  fisso_mese: ['Fisso mensile', 'Un importo fisso ogni mese (coordinamento, rimborso spese…).'],
};
const AMBITI = { tutte: 'Tutte le lezioni', corso: 'Un corso', disciplina: 'Una disciplina', private: 'Le lezioni private' };
const VUOTA = { tipo: 'ora', ambito: 'tutte', corso_id: '', disciplina_id: '', importo: '', minimo: '', massimo: '', conta: 'presenti', unita: 'lezione',
  fasce: [{ da: '0', a: '5', importo: '' }, { da: '6', a: '', importo: '' }], dal: '', al: '', nota: '' };

const aCent = (v) => { const s = String(v ?? '').trim(); if (!s) return null; const n = Math.round(parseFloat(s.replace(/[€\s]/g, '').replace(',', '.')) * 100); return Number.isFinite(n) ? n : NaN; };
const daCent = (c) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ',').replace(',00', ''));

export function descrivi(r, corsi = [], discipline = []) {
  const dove = r.ambito === 'corso' ? (corsi.find((c) => c.id === r.corso_id)?.nome || 'corso')
    : r.ambito === 'disciplina' ? (discipline.find((d) => d.id === r.disciplina_id)?.nome || 'disciplina')
    : r.ambito === 'private' ? 'lezioni private' : 'tutte le lezioni';
  let quanto = '';
  if (r.tipo === 'ora') quanto = `${euro(r.importo_cent)}/ora`;
  else if (r.tipo === 'lezione' || r.tipo === 'privata') quanto = `${euro(r.importo_cent)} a lezione`;
  else if (r.tipo === 'a_persona') quanto = `${euro(r.importo_cent)} a persona (${r.conta})${r.minimo_cent != null ? `, min ${euro(r.minimo_cent)}` : ''}${r.massimo_cent != null ? `, max ${euro(r.massimo_cent)}` : ''}`;
  else if (r.tipo === 'fasce') quanto = (r.fasce || []).map((f) => `${f.da}${f.a ? `–${f.a}` : '+'}: ${euro(f.importo_cent)}`).join(' · ') + ` ${r.unita === 'ora' ? 'all\'ora' : 'a lezione'} (${r.conta})`;
  else quanto = `${euro(r.importo_cent)} al mese`;
  return { titolo: TIPI[r.tipo]?.[0] || r.tipo, dove: ['forfait_mese', 'fisso_mese', 'privata'].includes(r.tipo) && r.ambito === 'tutte' ? '' : dove, quanto };
}

export default function RegoleCompenso({ staffId, palestraId, corsi = [] }) {
  const db = supabaseBrowser();
  const [regole, setRegole] = useState(null);
  const [discipline, setDiscipline] = useState([]);
  const [f, setF] = useState(null);           // la regola che si sta scrivendo (nuova o in modifica)
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);

  async function carica() {
    const { data } = await db.from('regole_compenso').select('*').eq('staff_id', staffId).order('created_at');
    setRegole(data || []);
  }
  useEffect(() => {
    carica();
    db.from('discipline').select('id, nome').eq('palestra_id', palestraId).order('nome').then(({ data }) => setDiscipline(data || []));
  }, [staffId]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  function modifica(r) {
    setErrore('');
    setF({
      id: r.id, tipo: r.tipo, ambito: r.ambito, corso_id: r.corso_id || '', disciplina_id: r.disciplina_id || '',
      importo: daCent(r.importo_cent), minimo: daCent(r.minimo_cent), massimo: daCent(r.massimo_cent),
      conta: r.conta, unita: r.unita, dal: r.dal || '', al: r.al || '', nota: r.nota || '',
      fasce: (r.fasce?.length ? r.fasce : VUOTA.fasce).map((x) => ({ da: String(x.da ?? ''), a: x.a == null ? '' : String(x.a), importo: daCent(x.importo_cent) })),
    });
  }

  async function salva(e) {
    e.preventDefault();
    setErrore('');
    const r = {
      palestra_id: palestraId, staff_id: staffId, tipo: f.tipo, ambito: f.tipo === 'forfait_mese' && f.ambito === 'tutte' ? 'corso' : f.ambito,
      corso_id: null, disciplina_id: null, importo_cent: null, minimo_cent: null, massimo_cent: null,
      conta: f.conta, unita: f.unita, fasce: [], dal: f.dal || null, al: f.al || null, nota: f.nota.trim() || null,
    };
    if (f.tipo === 'fisso_mese') r.ambito = 'tutte';
    if (f.tipo === 'privata') r.ambito = 'private';
    if (r.ambito === 'corso') { if (!f.corso_id) { setErrore('Scegli il corso.'); return; } r.corso_id = f.corso_id; }
    if (r.ambito === 'disciplina') { if (!f.disciplina_id) { setErrore('Scegli la disciplina.'); return; } r.disciplina_id = f.disciplina_id; }
    if (f.tipo === 'fasce') {
      const fasce = f.fasce.filter((x) => String(x.da).trim() !== '' || String(x.importo).trim() !== '').map((x) => ({
        da: parseInt(x.da, 10) || 0, a: String(x.a).trim() === '' ? null : parseInt(x.a, 10), importo_cent: aCent(x.importo),
      }));
      if (!fasce.length || fasce.some((x) => x.importo_cent == null || Number.isNaN(x.importo_cent) || (x.a != null && x.a < x.da))) {
        setErrore('Controlla le fasce: "da" e "a" sono numeri di persone ("a" vuoto = in su), e ogni fascia ha il suo importo.'); return;
      }
      r.fasce = fasce.sort((a, b) => a.da - b.da);
    } else {
      r.importo_cent = aCent(f.importo);
      if (r.importo_cent == null || Number.isNaN(r.importo_cent)) { setErrore('Scrivi l\'importo, per esempio 25 oppure 22,50.'); return; }
      if (f.tipo === 'a_persona') {
        r.minimo_cent = aCent(f.minimo); r.massimo_cent = aCent(f.massimo);
        if (Number.isNaN(r.minimo_cent) || Number.isNaN(r.massimo_cent)) { setErrore('Minimo e massimo: scrivi un importo o lasciali vuoti.'); return; }
      }
    }
    setInvio(true);
    const { error } = f.id ? await db.from('regole_compenso').update(r).eq('id', f.id) : await db.from('regole_compenso').insert(r);
    setInvio(false);
    if (error) { setErrore('Regola non salvata.'); return; }
    setF(null); carica();
  }

  async function attiva(r) { await db.from('regole_compenso').update({ attiva: !r.attiva }).eq('id', r.id); carica(); }
  async function togli(r) { if (!confirm('Eliminare questa regola? I cedolini già calcolati non cambiano finché non ricalcoli.')) return; await db.from('regole_compenso').delete().eq('id', r.id); carica(); }

  const conPersone = f && (f.tipo === 'fasce' || f.tipo === 'a_persona');
  const conAmbito = f && !['fisso_mese', 'privata'].includes(f.tipo);

  return (
    <section className="pannello regole-compenso">
      <div className="pannello-testa">
        <h2>Regole di compenso</h2>
        {!f && <button type="button" className="btn btn-piccolo" onClick={() => { setErrore(''); setF({ ...VUOTA }); }}>+ Aggiungi una regola</button>}
      </div>
      <p className="piccolo muto" style={{ marginTop: 0 }}>Senza regole vale la tariffa oraria standard. Per ogni lezione si usa la regola più precisa:
        corso, poi disciplina, poi tutte. Le ore contano solo se la lezione è confermata con l&apos;appello (o dalla segreteria).</p>

      {regole === null ? <span className="piccolo muto">Carico…</span> : regole.length === 0 && !f ? (
        <div className="vuoto">Nessuna regola: si paga a tariffa oraria standard.</div>
      ) : (
        <ul className="rc-elenco">
          {regole.map((r) => {
            const d = descrivi(r, corsi, discipline);
            return (
              <li key={r.id} className={r.attiva ? '' : 'spenta'}>
                <span className="rc-testo">
                  <strong>{d.titolo}{d.dove ? ` · ${d.dove}` : ''}</strong>
                  <span>{d.quanto}</span>
                  {(r.dal || r.al || r.nota) && <span className="piccolo muto">{[r.dal && `dal ${dataBreve(r.dal)}`, r.al && `al ${dataBreve(r.al)}`, r.nota].filter(Boolean).join(' · ')}</span>}
                </span>
                <span className="rc-azioni">
                  <button type="button" className="link-btn piccolo" onClick={() => modifica(r)}>modifica</button>
                  <button type="button" className="link-btn piccolo" onClick={() => attiva(r)}>{r.attiva ? 'spegni' : 'riaccendi'}</button>
                  <button type="button" className="link-btn piccolo pericolo" onClick={() => togli(r)}>elimina</button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {f && (
        <form className="rc-modulo" onSubmit={salva}>
          {errore && <div className="errore" role="alert">{errore}</div>}
          <label className="rc-largo"><span>Tipo di regola</span>
            <select value={f.tipo} onChange={set('tipo')}>{Object.entries(TIPI).map(([k, [t]]) => <option key={k} value={k}>{t}</option>)}</select>
            <small className="muto">{TIPI[f.tipo][1]}</small>
          </label>
          {conAmbito && (
            <label><span>Vale per</span>
              <select value={f.tipo === 'forfait_mese' && f.ambito === 'tutte' ? 'corso' : f.ambito} onChange={set('ambito')}>
                {Object.entries(AMBITI).filter(([k]) => f.tipo === 'forfait_mese' ? ['corso', 'disciplina'].includes(k) : true)
                  .map(([k, t]) => <option key={k} value={k}>{t}</option>)}
              </select></label>
          )}
          {conAmbito && (f.ambito === 'corso' || (f.tipo === 'forfait_mese' && f.ambito === 'tutte')) && (
            <label><span>Corso</span>
              <select value={f.corso_id} onChange={set('corso_id')}><option value="">—</option>{corsi.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
          )}
          {conAmbito && f.ambito === 'disciplina' && (
            <label><span>Disciplina</span>
              <select value={f.disciplina_id} onChange={set('disciplina_id')}><option value="">—</option>{discipline.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
          )}
          {conPersone && (
            <label><span>Si contano</span>
              <select value={f.conta} onChange={set('conta')}><option value="presenti">i presenti all&apos;appello</option><option value="prenotati">i prenotati</option></select></label>
          )}
          {f.tipo !== 'fasce' && (
            <label><span>{f.tipo === 'ora' ? 'Importo all\'ora (€)' : f.tipo === 'a_persona' ? 'Importo a persona (€)' : ['forfait_mese', 'fisso_mese'].includes(f.tipo) ? 'Importo al mese (€)' : 'Importo a lezione (€)'}</span>
              <input inputMode="decimal" value={f.importo} onChange={set('importo')} placeholder="es. 25" /></label>
          )}
          {f.tipo === 'a_persona' && (<>
            <label><span>Minimo a lezione (€)</span><input inputMode="decimal" value={f.minimo} onChange={set('minimo')} placeholder="facoltativo" /></label>
            <label><span>Massimo a lezione (€)</span><input inputMode="decimal" value={f.massimo} onChange={set('massimo')} placeholder="facoltativo" /></label>
          </>)}
          {f.tipo === 'fasce' && (<>
            <label><span>L&apos;importo della fascia è</span>
              <select value={f.unita} onChange={set('unita')}><option value="lezione">a lezione</option><option value="ora">all&apos;ora</option></select></label>
            <div className="rc-fasce rc-largo">
              <span className="piccolo muto">Fasce (numero di persone)</span>
              {f.fasce.map((x, i) => (
                <div key={i} className="rc-fascia">
                  <span>da</span><input inputMode="numeric" value={x.da} onChange={(e) => setF({ ...f, fasce: f.fasce.map((y, j) => (j === i ? { ...y, da: e.target.value } : y)) })} />
                  <span>a</span><input inputMode="numeric" value={x.a} placeholder="in su" onChange={(e) => setF({ ...f, fasce: f.fasce.map((y, j) => (j === i ? { ...y, a: e.target.value } : y)) })} />
                  <span>€</span><input inputMode="decimal" value={x.importo} onChange={(e) => setF({ ...f, fasce: f.fasce.map((y, j) => (j === i ? { ...y, importo: e.target.value } : y)) })} />
                  <button type="button" className="link-btn piccolo" aria-label="Togli la fascia" onClick={() => setF({ ...f, fasce: f.fasce.filter((_, j) => j !== i) })}>✕</button>
                </div>
              ))}
              <button type="button" className="link-btn piccolo" onClick={() => setF({ ...f, fasce: [...f.fasce, { da: '', a: '', importo: '' }] })}>+ fascia</button>
            </div>
          </>)}
          <label><span>Dal (facoltativo)</span><input type="date" value={f.dal} onChange={set('dal')} /></label>
          <label><span>Al (facoltativo)</span><input type="date" value={f.al} onChange={set('al')} /></label>
          <label className="rc-largo"><span>Nota (finisce sul cedolino)</span><input value={f.nota} onChange={set('nota')} placeholder="es. accordo 2026/2027" /></label>
          <span className="rc-largo azioni-riga">
            <button className="btn btn-primario btn-piccolo" disabled={invio}>{invio ? 'Salvo…' : 'Salva la regola'}</button>
            <button type="button" className="btn btn-piccolo" onClick={() => setF(null)}>Annulla</button>
          </span>
        </form>
      )}
    </section>
  );
}
