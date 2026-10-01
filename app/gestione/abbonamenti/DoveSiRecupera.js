'use client';
import { useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';

// Regole di disdetta e recupero; corsi aperti a tutti; "chi frequenta X / chi ha
// questi abbonamenti può recuperare in…": si spuntano i corsi, divisi per disciplina.
export default function DoveSiRecupera({ palestra, corsi, tipi, regole, gruppi = [], onSalvato }) {
  return (
    <div className="recuperi-pagina">
      <RegoleDisdetta palestra={palestra} onSalvato={onSalvato} />
      <CorsiPerTutti corsi={corsi} onSalvato={onSalvato} />
      <Associazioni corsi={corsi} tipi={tipi} regole={regole} gruppi={gruppi} onSalvato={onSalvato} />
    </div>
  );
}

function RegoleDisdetta({ palestra, onSalvato }) {
  const [f, setF] = useState({
    ore: String(palestra.ore_disdetta ?? 4),
    max: palestra.recuperi_max_mese == null ? '' : String(palestra.recuperi_max_mese),
    solo: palestra.recupero_solo_disdetta ?? true,
    vale: palestra.scadenza_recupero || 'giorni',
  });
  const [stato, setStato] = useState('');

  // le due scelte si salvano al tocco
  async function cambia(campo, chiave, valore) {
    const prima = f[chiave];
    setF((x) => ({ ...x, [chiave]: valore }));
    const { error } = await supabaseBrowser().from('palestre').update({ [campo]: valore }).eq('id', palestra.id);
    if (error) { setF((x) => ({ ...x, [chiave]: prima })); setStato('Salvataggio non riuscito.'); return; }
    onSalvato?.();
  }

  async function salva() {
    const ore = parseInt(f.ore, 10);
    const max = f.max === '' ? null : parseInt(f.max, 10);
    if (!Number.isFinite(ore) || ore < 0 || ore > 72) { setStato('Le ore vanno da 0 a 72.'); return; }
    if (max !== null && (!Number.isFinite(max) || max < 0)) { setStato('Scrivi un numero, o lascia vuoto per nessun limite.'); return; }
    setStato('salvo');
    const { error } = await supabaseBrowser().from('palestre').update({ ore_disdetta: ore, recuperi_max_mese: max }).eq('id', palestra.id);
    if (error) { setStato('Salvataggio non riuscito.'); return; }
    setStato('fatto'); onSalvato?.(); setTimeout(() => setStato(''), 2500);
  }

  return (
    <section className="pannello">
      <h2>Disdette e recuperi</h2>
      <p className="piccolo muto" style={{ marginTop: 0 }}>
        Dall'area clienti, con "Non vengo", la persona libera il posto e riceve il recupero. La segreteria può disdire sempre.
      </p>
      <div className="regole-recupero">
        <div className="campo">
          <label htmlFor="ore-disdetta">Si disdice fino a</label>
          <span className="con-unita">
            <input id="ore-disdetta" inputMode="numeric" value={f.ore} onChange={(e) => setF({ ...f, ore: e.target.value })} />
            <span>ore prima della lezione</span>
          </span>
        </div>
        <div className="campo">
          <label htmlFor="max-mese">Recuperi al mese per persona</label>
          <span className="con-unita">
            <input id="max-mese" inputMode="numeric" placeholder="∞" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} />
            <span>{f.max === '' ? 'nessun limite' : 'al massimo'}</span>
          </span>
        </div>
        <div className="regole-salva">
          <button className="btn btn-primario btn-piccolo" disabled={stato === 'salvo'} onClick={salva}>
            {stato === 'salvo' ? 'Salvo…' : stato === 'fatto' ? 'Salvato ✓' : 'Salva'}
          </button>
          {stato && !['salvo', 'fatto'].includes(stato) && <span className="piccolo" style={{ color: 'var(--rosso-scuro)' }}>{stato}</span>}
        </div>
      </div>

      <div className="campo" style={{ maxWidth: 560 }}>
        <label htmlFor="vale-recupero">Fino a quando vale un recupero</label>
        <select id="vale-recupero" value={f.vale} onChange={(e) => cambia('scadenza_recupero', 'vale', e.target.value)}>
          <option value="abbonamento">Fino alla fine dell'abbonamento (se rinnova, passa al nuovo)</option>
          <option value="giorni">Per un numero di giorni dalla lezione persa</option>
        </select>
        <span className="piccolo muto">
          {f.vale === 'abbonamento'
            ? 'Se l\'abbonamento scade e la persona non rinnova, i recuperi non usati si perdono. Se rinnova (lo stesso corso, entro 15 giorni dalla scadenza), passano al nuovo abbonamento.'
            : 'I giorni si scelgono in ogni abbonamento, nel campo "Validità recupero".'}
        </span>
      </div>

      <label className="spunta" style={{ marginBottom: 8 }}>
        <input type="checkbox" checked={f.solo} onChange={(e) => cambia('recupero_solo_disdetta', 'solo', e.target.checked)} />
        <span>
          Il recupero spetta solo a chi disdice o avvisa
          <span className="piccolo muto" style={{ display: 'block' }}>
            {f.solo
              ? 'Chi manca senza avvisare perde la lezione: ha tenuto il posto occupato.'
              : 'Anche chi viene segnato assente in appello riceve il recupero.'}
          </span>
        </span>
      </label>
      <p className="piccolo muto" style={{ marginBottom: 0 }}>
        Il limite al mese conta i recuperi prenotati nel mese della lezione di recupero.
        Quanti recuperi dà ogni abbonamento in tutto si decide nel singolo abbonamento.
      </p>
    </section>
  );
}

// Corsi dove possono recuperare tutti, qualunque abbonamento abbiano (es. Flexy)
function CorsiPerTutti({ corsi, onSalvato }) {
  const [aperti, setAperti] = useState(new Set(corsi.filter((c) => c.perTutti).map((c) => c.id)));
  const [scegli, setScegli] = useState(false);
  const [errore, setErrore] = useState('');
  const discipline = useMemo(() => [...new Set(corsi.map((c) => c.disciplina))].sort(), [corsi]);

  async function tocca(c) {
    const si = !aperti.has(c.id);
    setAperti((s) => { const n = new Set(s); si ? n.add(c.id) : n.delete(c.id); return n; });
    const { error } = await supabaseBrowser().rpc('imposta_recupero_per_tutti', { p_corso: c.id, p_si: si });
    if (error) {
      setAperti((s) => { const n = new Set(s); si ? n.delete(c.id) : n.add(c.id); return n; });
      setErrore('Salvataggio non riuscito.'); return;
    }
    setErrore(''); onSalvato?.();
  }

  const elenco = corsi.filter((c) => aperti.has(c.id));
  return (
    <section className="pannello">
      <h2>Corsi aperti a tutti per i recuperi</h2>
      <p className="piccolo muto" style={{ marginTop: 0 }}>
        Qui può recuperare chiunque, qualunque abbonamento abbia. Si salva al tocco.
      </p>
      {errore && <div className="errore" role="alert">{errore}</div>}
      <div className="pastiglie" style={{ marginBottom: 8 }}>
        {elenco.length === 0 && <span className="piccolo muto">Nessuno per ora.</span>}
        {elenco.map((c) => (
          <button key={c.id} type="button" aria-pressed="true" onClick={() => tocca(c)} title="Tocca per togliere">{c.nome} ✕</button>
        ))}
      </div>
      <button className="link-btn piccolo" aria-pressed={scegli} onClick={() => setScegli(!scegli)}>
        {scegli ? 'Chiudi' : '+ Aggiungi un corso'}
      </button>
      {scegli && (
        <div className="recupero-discipline" style={{ marginTop: 10 }}>
          {discipline.map((d) => (
            <div key={d} className="recupero-disciplina">
              <strong className="piccolo">{d}</strong>
              <div className="pastiglie">
                {corsi.filter((c) => c.disciplina === d).map((c) => (
                  <button key={c.id} type="button" aria-pressed={aperti.has(c.id)} onClick={() => tocca(c)}>{c.nome}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Associazioni({ corsi, tipi, regole, gruppi, onSalvato }) {
  const [origine, setOrigine] = useState('abbonamento');
  const [gruppo, setGruppo] = useState('');
  const [cerca, setCerca] = useState('');
  const [corsoId, setCorsoId] = useState('');            // origine = corso
  const [abbonamenti, setAbbonamenti] = useState([]);    // origine = abbonamento, anche più di uno
  const [scelti, setScelti] = useState(new Set());
  const [prima, setPrima] = useState(new Set());
  const [salvati, setSalvati] = useState(regole);
  const [stato, setStato] = useState('');

  const discipline = useMemo(() => [...new Set(corsi.map((c) => c.disciplina))].sort(), [corsi]);
  const regoleDi = (o, id) => salvati.filter((r) => r.origine === o && r.origine_id === id).map((r) => r.corso_ammesso_id);
  const nome = (o, id) => (o === 'corso' ? corsi.find((c) => c.id === id)?.nome : tipi.find((t) => t.id === id)?.nome);
  const testo = cerca.trim().toLowerCase();
  const tipiVisibili = tipi
    .filter((t) => (!gruppo || t.gruppo_id === gruppo) && (!testo || `${t.nome} ${t.codice || ''} ${t.famiglia || ''}`.toLowerCase().includes(testo)))
    .sort((a, b) => (a.famiglia || '').localeCompare(b.famiglia || '') || a.nome.localeCompare(b.nome, 'it', { numeric: true }));
  const famiglie = [...new Set(tipiVisibili.map((t) => t.famiglia || 'Senza famiglia'))];
  const origineScelta = origine === 'corso' ? !!corsoId : abbonamenti.length > 0;

  function carica(ids, o) {
    // si parte dalle regole del primo: salvando, valgono per tutti i selezionati
    const base = new Set(ids.length ? regoleDi(o, ids[0]) : []);
    setScelti(base); setPrima(base); setStato('');
  }
  function scegliCorso(id) { setCorsoId(id); carica(id ? [id] : [], 'corso'); }
  function toccaAbbonamento(id) {
    const n = abbonamenti.includes(id) ? abbonamenti.filter((x) => x !== id) : [...abbonamenti, id];
    setAbbonamenti(n);
    if (abbonamenti.length === 0 || n.length === 0) carica(n, 'abbonamento');
  }
  function toccaFamiglia(f) {
    const ids = tipiVisibili.filter((t) => (t.famiglia || 'Senza famiglia') === f).map((t) => t.id);
    const tutti = ids.every((id) => abbonamenti.includes(id));
    const n = tutti ? abbonamenti.filter((x) => !ids.includes(x)) : [...new Set([...abbonamenti, ...ids])];
    setAbbonamenti(n);
    if (abbonamenti.length === 0 || n.length === 0) carica(n, 'abbonamento');
  }
  function tocca(id) {
    setScelti((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toccaDisciplina(d) {
    const ids = corsi.filter((c) => c.disciplina === d && !(origine === 'corso' && c.id === corsoId)).map((c) => c.id);
    const tutti = ids.every((id) => scelti.has(id));
    setScelti((s) => { const n = new Set(s); ids.forEach((id) => (tutti ? n.delete(id) : n.add(id))); return n; });
  }

  const piuDiUno = origine === 'abbonamento' && abbonamenti.length > 1;
  const cambiato = origineScelta && (piuDiUno || prima.size !== scelti.size || [...scelti].some((id) => !prima.has(id)));

  async function salva() {
    setStato('salvo');
    const db = supabaseBrowser();
    const { error } = origine === 'corso'
      ? await db.rpc('imposta_recuperi_ammessi', { p_origine: 'corso', p_origine_id: corsoId, p_corsi: [...scelti] })
      : await db.rpc('imposta_recuperi_ammessi_tanti', { p_tipi: abbonamenti, p_corsi: [...scelti] });
    if (error) { setStato('errore'); return; }
    const ids = origine === 'corso' ? [corsoId] : abbonamenti;
    setSalvati([...salvati.filter((r) => !(r.origine === origine && ids.includes(r.origine_id))),
      ...ids.flatMap((id) => [...scelti].filter((c) => !(origine === 'corso' && c === id))
        .map((c) => ({ origine, origine_id: id, corso_ammesso_id: c })))]);
    setPrima(new Set(scelti));
    setStato(`fatto:${ids.length}`); onSalvato?.();
  }

  function cambiaOrigine(o) {
    setOrigine(o); setCorsoId(''); setAbbonamenti([]); setScelti(new Set()); setPrima(new Set()); setStato('');
  }

  const conRegole = [...new Map(salvati.map((r) => [`${r.origine}:${r.origine_id}`, r])).values()]
    .map((r) => ({ ...r, n: regoleDi(r.origine, r.origine_id).length, nome: nome(r.origine, r.origine_id) }))
    .filter((r) => r.nome).sort((a, b) => a.nome.localeCompare(b.nome));
  const titoloOrigine = origine === 'corso' ? nome('corso', corsoId)
    : abbonamenti.length === 1 ? nome('abbonamento', abbonamenti[0]) : `${abbonamenti.length} abbonamenti`;

  return (
    <section className="pannello">
      <h2>Dove si può recuperare</h2>
      <p className="piccolo muto" style={{ marginTop: 0 }}>
        Il proprio corso è sempre ammesso, e così i corsi aperti a tutti. Per il resto: scegli gli abbonamenti
        (anche una famiglia intera, es. tutti gli "attrezzi") e spunta i corsi dove possono recuperare.
      </p>

      <div className="segmenti" role="group" aria-label="La regola vale per">
        <button type="button" aria-pressed={origine === 'abbonamento'} onClick={() => cambiaOrigine('abbonamento')}>Per abbonamento</button>
        <button type="button" aria-pressed={origine === 'corso'} onClick={() => cambiaOrigine('corso')}>Per corso frequentato</button>
      </div>

      {origine === 'corso' ? (
        <div className="campo" style={{ maxWidth: 480 }}>
          <label htmlFor="rec-id">Chi frequenta il corso</label>
          <select id="rec-id" value={corsoId} onChange={(e) => scegliCorso(e.target.value)}>
            <option value="">— scegli —</option>
            {discipline.map((d) => (
              <optgroup key={d} label={d}>
                {corsi.filter((c) => c.disciplina === d).map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}{regoleDi('corso', c.id).length ? ` (${regoleDi('corso', c.id).length})` : ''}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      ) : (
        <div className="scelta-abbonamenti">
          <div className="filtri-persone">
            {gruppi.length > 0 && (
              <select value={gruppo} onChange={(e) => setGruppo(e.target.value)} aria-label="Gruppo di listino">
                <option value="">Tutti i gruppi</option>
                {gruppi.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
              </select>
            )}
            <input type="search" placeholder="Cerca abbonamento, es. attrezzi" value={cerca} onChange={(e) => setCerca(e.target.value)} aria-label="Cerca abbonamento" />
            {abbonamenti.length > 0 && <button className="link-btn piccolo" onClick={() => { setAbbonamenti([]); carica([], 'abbonamento'); }}>deseleziona ({abbonamenti.length})</button>}
          </div>
          <div className="elenco-abbonamenti">
            {famiglie.map((f) => {
              const della = tipiVisibili.filter((t) => (t.famiglia || 'Senza famiglia') === f);
              return (
                <div key={f} className="gruppo-famiglia">
                  <label className="spunta gruppo-famiglia-testa">
                    <input type="checkbox" checked={della.every((t) => abbonamenti.includes(t.id))} onChange={() => toccaFamiglia(f)} />
                    <span><strong>{f}</strong> <span className="piccolo muto">· {della.length}</span></span>
                  </label>
                  {della.map((t) => (
                    <label key={t.id} className="spunta gruppo-voce">
                      <input type="checkbox" checked={abbonamenti.includes(t.id)} onChange={() => toccaAbbonamento(t.id)} />
                      <span>{t.nome}{regoleDi('abbonamento', t.id).length > 0 && <span className="muto"> · {regoleDi('abbonamento', t.id).length} corsi</span>}</span>
                    </label>
                  ))}
                </div>
              );
            })}
            {famiglie.length === 0 && <div className="vuoto">Nessun abbonamento trovato.</div>}
          </div>
        </div>
      )}

      {origineScelta && (
        <>
          <p className="piccolo" style={{ margin: '12px 0 10px' }}>
            <strong>{titoloOrigine}</strong> {piuDiUno ? 'potranno' : 'può'} recuperare in{' '}
            {scelti.size ? `${scelti.size} ${scelti.size === 1 ? 'corso' : 'corsi'}` : 'nessun altro corso'}
            , oltre al proprio e ai corsi aperti a tutti.
            {piuDiUno && <span className="muto"> Salvando, queste regole sostituiscono quelle di tutti i selezionati.</span>}
          </p>
          <div className="recupero-discipline">
            {discipline.map((d) => {
              const della = corsi.filter((c) => c.disciplina === d && !(origine === 'corso' && c.id === corsoId));
              if (!della.length) return null;
              return (
                <div key={d} className="recupero-disciplina">
                  <label className="spunta recupero-testa">
                    <input type="checkbox" checked={della.every((c) => scelti.has(c.id))} onChange={() => toccaDisciplina(d)} />
                    <strong>{d}</strong>
                  </label>
                  <div className="pastiglie">
                    {della.map((c) => (
                      <button key={c.id} type="button" aria-pressed={scelti.has(c.id)} onClick={() => tocca(c.id)}>{c.nome}</button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="azioni barra-salva-recuperi">
            <button className="btn btn-primario btn-piccolo" disabled={!cambiato || stato === 'salvo'} onClick={salva}>
              {stato === 'salvo' ? 'Salvo…' : piuDiUno ? `Salva per ${abbonamenti.length} abbonamenti` : 'Salva'}
            </button>
            {cambiato && !piuDiUno && <button className="btn btn-piccolo" onClick={() => setScelti(new Set(prima))}>Annulla le modifiche</button>}
            {stato.startsWith('fatto') && !cambiato && <span className="piccolo" style={{ color: 'var(--ok)' }}>Salvato ✓</span>}
            {stato.startsWith('fatto:') && piuDiUno && <span className="piccolo" style={{ color: 'var(--ok)' }}>Salvato per {stato.split(':')[1]} abbonamenti ✓</span>}
            {stato === 'errore' && <span className="piccolo" style={{ color: 'var(--rosso-scuro)' }}>Salvataggio non riuscito.</span>}
          </div>
        </>
      )}

      {conRegole.length > 0 && (
        <>
          <h3 className="recupero-sottotitolo">Regole già impostate</h3>
          <ul className="mini-lista">
            {conRegole.map((r) => (
              <li key={`${r.origine}:${r.origine_id}`}>
                <button type="button" className="riga-regola" onClick={() => {
                  setOrigine(r.origine); setStato('');
                  if (r.origine === 'corso') { setAbbonamenti([]); scegliCorso(r.origine_id); }
                  else { setCorsoId(''); setAbbonamenti([r.origine_id]); carica([r.origine_id], 'abbonamento'); }
                }}>
                  <span className="ml-testo">
                    <strong>{r.nome}</strong>
                    <span className="piccolo muto">{r.origine === 'corso' ? 'corso' : 'abbonamento'}</span>
                  </span>
                  <span className="tag tag-neutro">{r.n} {r.n === 1 ? 'corso' : 'corsi'}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
