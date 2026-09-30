'use client';
import { useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';

// Regole di disdetta e recupero, poi "chi frequenta X può recuperare in…":
// si sceglie il corso (o l'abbonamento) e si spuntano i corsi, divisi per disciplina.
export default function DoveSiRecupera({ palestra, corsi, tipi, regole, gruppi = [], onSalvato }) {
  return (
    <div className="recuperi-pagina">
      <RegoleDisdetta palestra={palestra} onSalvato={onSalvato} />
      <Associazioni corsi={corsi} tipi={tipi} regole={regole} gruppi={gruppi} onSalvato={onSalvato} />
    </div>
  );
}

function RegoleDisdetta({ palestra, onSalvato }) {
  const [f, setF] = useState({
    ore: String(palestra.ore_disdetta ?? 4),
    max: palestra.recuperi_max_mese == null ? '' : String(palestra.recuperi_max_mese),
  });
  const [stato, setStato] = useState('');

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
      <p className="piccolo muto" style={{ marginBottom: 0 }}>
        Il limite conta i recuperi prenotati nel mese della lezione di recupero. Quanti recuperi dà ogni abbonamento
        in tutto e quanti giorni valgono si decide nel singolo abbonamento.
      </p>
    </section>
  );
}

function Associazioni({ corsi, tipi, regole, gruppi, onSalvato }) {
  const [origine, setOrigine] = useState('corso');
  const [gruppo, setGruppo] = useState('');
  const [origineId, setOrigineId] = useState('');
  const [scelti, setScelti] = useState(new Set());
  const [salvati, setSalvati] = useState(regole);
  const [stato, setStato] = useState('');

  const discipline = useMemo(() => [...new Set(corsi.map((c) => c.disciplina))].sort(), [corsi]);
  const tipiVisibili = gruppo ? tipi.filter((t) => t.gruppo_id === gruppo) : tipi;
  const regoleDi = (o, id) => salvati.filter((r) => r.origine === o && r.origine_id === id).map((r) => r.corso_ammesso_id);
  const nome = (o, id) => (o === 'corso' ? corsi.find((c) => c.id === id)?.nome : tipi.find((t) => t.id === id)?.nome);

  function scegli(o, id) {
    setOrigine(o); setOrigineId(id); setStato('');
    setScelti(new Set(regoleDi(o, id)));
  }
  function tocca(id) {
    setScelti((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toccaDisciplina(d) {
    const ids = corsi.filter((c) => c.disciplina === d && !(origine === 'corso' && c.id === origineId)).map((c) => c.id);
    const tutti = ids.every((id) => scelti.has(id));
    setScelti((s) => { const n = new Set(s); ids.forEach((id) => (tutti ? n.delete(id) : n.add(id))); return n; });
  }

  const prima = new Set(regoleDi(origine, origineId));
  const cambiato = origineId && (prima.size !== scelti.size || [...scelti].some((id) => !prima.has(id)));

  async function salva() {
    setStato('salvo');
    const { error } = await supabaseBrowser().rpc('imposta_recuperi_ammessi', {
      p_origine: origine, p_origine_id: origineId, p_corsi: [...scelti],
    });
    if (error) { setStato('errore'); return; }
    setSalvati([...salvati.filter((r) => !(r.origine === origine && r.origine_id === origineId)),
      ...[...scelti].map((c) => ({ origine, origine_id: origineId, corso_ammesso_id: c }))]);
    setStato('fatto'); onSalvato?.();
  }

  // riepilogo: chi ha già delle regole
  const conRegole = [...new Map(salvati.map((r) => [`${r.origine}:${r.origine_id}`, r])).values()]
    .map((r) => ({ ...r, n: regoleDi(r.origine, r.origine_id).length, nome: nome(r.origine, r.origine_id) }))
    .filter((r) => r.nome).sort((a, b) => a.nome.localeCompare(b.nome));

  return (
    <section className="pannello">
      <h2>Dove si può recuperare</h2>
      <p className="piccolo muto" style={{ marginTop: 0 }}>
        Il proprio corso è sempre ammesso. Scegli un corso (vale per tutti i suoi iscritti) oppure un abbonamento,
        poi spunta i corsi dove si può recuperare.
      </p>

      <div className="recupero-scelta">
        <div className="campo">
          <label htmlFor="rec-origine">La regola vale per</label>
          <select id="rec-origine" value={origine} onChange={(e) => { setOrigine(e.target.value); setOrigineId(''); setScelti(new Set()); }}>
            <option value="corso">Chi frequenta un corso</option>
            <option value="abbonamento">Chi ha un abbonamento</option>
          </select>
        </div>
        {origine === 'abbonamento' && gruppi.length > 0 && (
          <div className="campo">
            <label htmlFor="rec-gruppo">Gruppo di listino</label>
            <select id="rec-gruppo" value={gruppo} onChange={(e) => { setGruppo(e.target.value); setOrigineId(''); setScelti(new Set()); }}>
              <option value="">Tutti</option>
              {gruppi.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
            </select>
          </div>
        )}
        <div className="campo">
          <label htmlFor="rec-id">{origine === 'corso' ? 'Corso' : 'Abbonamento'}</label>
          <select id="rec-id" value={origineId} onChange={(e) => scegli(origine, e.target.value)}>
            <option value="">— scegli —</option>
            {origine === 'corso'
              ? discipline.map((d) => (
                  <optgroup key={d} label={d}>
                    {corsi.filter((c) => c.disciplina === d).map((c) => (
                      <option key={c.id} value={c.id}>{c.nome}{regoleDi('corso', c.id).length ? ` (${regoleDi('corso', c.id).length})` : ''}</option>
                    ))}
                  </optgroup>
                ))
              : tipiVisibili.map((t) => (
                  <option key={t.id} value={t.id}>{t.nome}{regoleDi('abbonamento', t.id).length ? ` (${regoleDi('abbonamento', t.id).length})` : ''}</option>
                ))}
          </select>
        </div>
      </div>

      {origineId && (
        <>
          <p className="piccolo" style={{ margin: '4px 0 10px' }}>
            <strong>{nome(origine, origineId)}</strong> può recuperare in{' '}
            {scelti.size ? `${scelti.size} ${scelti.size === 1 ? 'altro corso' : 'altri corsi'}` : 'nessun altro corso'}
            {origine === 'corso' ? ', oltre al suo.' : '.'}
          </p>
          <div className="recupero-discipline">
            {discipline.map((d) => {
              const delGruppo = corsi.filter((c) => c.disciplina === d && !(origine === 'corso' && c.id === origineId));
              if (!delGruppo.length) return null;
              const tutti = delGruppo.every((c) => scelti.has(c.id));
              return (
                <div key={d} className="recupero-disciplina">
                  <label className="spunta recupero-testa">
                    <input type="checkbox" checked={tutti} onChange={() => toccaDisciplina(d)} />
                    <strong>{d}</strong>
                  </label>
                  <div className="pastiglie">
                    {delGruppo.map((c) => (
                      <button key={c.id} type="button" aria-pressed={scelti.has(c.id)} onClick={() => tocca(c.id)}>{c.nome}</button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="azioni" style={{ alignItems: 'center' }}>
            <button className="btn btn-primario btn-piccolo" disabled={!cambiato || stato === 'salvo'} onClick={salva}>
              {stato === 'salvo' ? 'Salvo…' : stato === 'fatto' && !cambiato ? 'Salvato ✓' : 'Salva'}
            </button>
            {cambiato && <button className="btn btn-piccolo" onClick={() => setScelti(prima)}>Annulla le modifiche</button>}
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
                <button type="button" className="riga-regola" onClick={() => scegli(r.origine, r.origine_id)}>
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
