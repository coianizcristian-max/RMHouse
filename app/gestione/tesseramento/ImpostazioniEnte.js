'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import PreferitoAsi from './PreferitoAsi';
import { TIPI_ASI, QUALIFICHE_ASI, CAMPI, COLONNE_ASI, FORMATI_STAGIONE, stagioneCome, impostazioniEnte } from '@/lib/tessereEnte';

// Le impostazioni dell'ente (ASI): dati dell'affiliazione, valori predefiniti per tutti, come si traducono le vostre
// discipline in quelle dell'ente e com'è fatto il file da caricare sul portale. Salvate in palestre.ente.
// La password del portale NON si salva qui: resta nel browser (gestore delle password).
export default function ImpostazioniEnte({ palestraId, ente, discipline = [], stagione, onChiudi }) {
  const router = useRouter();
  const [e, setE] = useState(() => impostazioniEnte(ente));
  const [elenco, setElenco] = useState(() => impostazioniEnte(ente).discipline_ente.join('\n'));
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const set = (k) => (ev) => setE((x) => ({ ...x, [k]: ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value }));
  const discEnte = elenco.split('\n').map((x) => x.trim()).filter(Boolean);
  const setCol = (i, k, v) => setE((x) => ({ ...x, colonne: x.colonne.map((c, j) => (j === i ? { ...c, [k]: v } : c)) }));
  const sposta = (i, d) => setE((x) => {
    const c = [...x.colonne]; const j = i + d; if (j < 0 || j >= c.length) return x;
    [c[i], c[j]] = [c[j], c[i]]; return { ...x, colonne: c };
  });

  async function salva(ev) {
    ev.preventDefault();
    setErrore('');
    if (e.portale && !/^https:\/\//i.test(e.portale.trim())) { setErrore('Il link del portale deve iniziare con https://'); return; }
    const nuovo = { ...e, nome: e.nome.trim(), affiliazione: e.affiliazione.trim(), portale: e.portale.trim(), discipline_ente: discEnte,
      // tolte dall'elenco: non valgono più come traduzione
      mappa: Object.fromEntries(Object.entries(e.mappa).filter(([, v]) => v && discEnte.includes(v))),
      mappa_tipo: Object.fromEntries(Object.entries(e.mappa_tipo).filter(([, v]) => v)),
      disciplina: discEnte.includes(e.disciplina) ? e.disciplina : '',
      colonne: e.colonne.filter((c) => c.titolo.trim()).map((c) => ({ titolo: c.titolo.trim(), campo: c.campo, valore: c.campo === 'fisso' ? c.valore : '' })) };
    setInvio(true);
    const { error } = await supabaseBrowser().from('palestre').update({ ente: nuovo }).eq('id', palestraId);
    setInvio(false);
    if (error) { setErrore('Salvataggio non riuscito.'); return; }
    router.refresh(); onChiudi?.();
  }

  return (
    <form className="pannello te-impostazioni" onSubmit={salva}>
      <h2>Impostazioni dell&apos;ente</h2>
      {errore && <div className="errore" role="alert">{errore}</div>}

      <h3>L&apos;ente e la vostra affiliazione</h3>
      <div className="te-griglia">
        <div className="campo"><label htmlFor="te-n">Ente</label>
          <input id="te-n" value={e.nome} onChange={set('nome')} placeholder="Es. ASI, CSEN, UISP…" /></div>
        <div className={`campo${e.affiliazione.trim() ? '' : ' te-manca'}`}><label htmlFor="te-a">Codice di affiliazione <span className="eti-info">· va nel file (CODICE AFFILIAZIONE)</span></label>
          <input id="te-a" value={e.affiliazione} onChange={set('affiliazione')} placeholder="Es. VEN-VI0421" /></div>
        <div className="campo te-largo"><label htmlFor="te-p">Link del portale <span className="eti-info">· la pagina dove fate le tessere</span></label>
          <input id="te-p" value={e.portale} onChange={set('portale')} placeholder="https://…" /></div>
        <div className="campo"><label htmlFor="te-v">La tessera vale</label>
          <select id="te-v" value={e.validita} onChange={set('validita')}>
            <option value="anno">un anno da quando si fa</option>
            <option value="stagione">fino alla fine della stagione</option>
          </select></div>
      </div>
      <label className="spunta"><input type="checkbox" checked={!!e.quota_comprende_tessera} onChange={set('quota_comprende_tessera')} />
        <span>La quota annuale comprende la tessera: chi paga la quota finisce in automatico fra i &quot;da mandare&quot;</span></label>
      <p className="piccolo muto">La password del portale non si scrive qui: lasciala salvare al browser quando entri nel sito dell&apos;ente.</p>

      <h3>Valori per tutti <span className="eti-info">· in ogni persona si possono cambiare solo per lei</span></h3>
      <div className="te-griglia">
        <div className="campo"><label htmlFor="te-t">Tipo tessera</label>
          <select id="te-t" value={e.tipo_tessera} onChange={set('tipo_tessera')}>
            <option value="">—</option>{TIPI_ASI.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <span className="piccolo muto">Solo se la disciplina non ne ha uno (qui sotto, colonna Tessera).</span></div>
        <div className="campo"><label htmlFor="te-q">Qualifica</label>
          <select id="te-q" value={e.qualifica} onChange={set('qualifica')}>
            <option value="">—</option>{QUALIFICHE_ASI.map((t) => <option key={t} value={t}>{t}</option>)}
          </select></div>
        <div className="campo te-largo"><label htmlFor="te-d">Disciplina <span className="eti-info">· se il corso non ne ha una qui sotto</span></label>
          <select id="te-d" value={e.disciplina} onChange={set('disciplina')}>
            <option value="">—</option>{discEnte.map((t) => <option key={t} value={t}>{t}</option>)}
          </select></div>
      </div>

      <h3>Discipline</h3>
      <div className="te-due">
        <div className="campo"><label htmlFor="te-el">Le discipline della vostra affiliazione <span className="eti-info">· una per riga, scritte come sul portale</span></label>
          <textarea id="te-el" rows={8} value={elenco} onChange={(ev) => setElenco(ev.target.value)} /></div>
        <div>
          <p className="piccolo" style={{ margin: '0 0 6px' }}><b>Le vostre discipline → quella dell&apos;ente e il tipo di tessera</b></p>
          <ul className="te-mappa">
            <li className="te-mappa-testa piccolo muto"><span>Disciplina</span><span>Per l&apos;ente</span><span>Tessera</span></li>
            {discipline.map((d) => (
              <li key={d.id}>
                <span>{d.nome}</span>
                <select value={e.mappa[d.id] || ''} onChange={(ev) => setE((x) => ({ ...x, mappa: { ...x.mappa, [d.id]: ev.target.value } }))} aria-label={`Disciplina dell'ente per ${d.nome}`}>
                  <option value="">{e.disciplina ? `predefinita (${e.disciplina})` : '—'}</option>
                  {discEnte.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <select value={e.mappa_tipo[d.id] || ''} onChange={(ev) => setE((x) => ({ ...x, mappa_tipo: { ...x.mappa_tipo, [d.id]: ev.target.value } }))} aria-label={`Tipo di tessera per ${d.nome}`}>
                  <option value="">{e.tipo_tessera ? `(${e.tipo_tessera})` : '—'}</option>
                  {TIPI_ASI.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </li>
            ))}
          </ul>
          <p className="piccolo muto" style={{ margin: '6px 0 0' }}><b>Per l&apos;ente</b>: la disciplina {e.nome || 'dell\'ente'} che va nella colonna DISCIPLINA del file (se resta &quot;—&quot; il file avvisa).
            <b> Tessera</b>: il tipo per chi fa quella disciplina (es. Aerea e Pole B, le altre A). Chi fa più corsi prende quello del corso più recente.</p>
        </div>
      </div>

      <h3>Il file da caricare <span className="eti-info">· sul portale ASI: Tesserati → Caricamento tessere da file</span></h3>
      <div className="te-griglia">
        <div className="campo"><label htmlFor="te-s">Stagione scritta come</label>
          <select id="te-s" value={e.stagione_formato} onChange={set('stagione_formato')}>
            {FORMATI_STAGIONE.map(([k]) => <option key={k} value={k}>{stagioneCome(stagione, k)}</option>)}
          </select></div>
        <div className="campo"><label htmlFor="te-c">Lettere accentate</label>
          <select id="te-c" value={e.codifica} onChange={set('codifica')}>
            <option value="utf8">UTF-8 (normale)</option>
            <option value="windows">Windows (se il portale le mostra storte)</option>
          </select></div>
      </div>
      <p className="piccolo muto" style={{ margin: '4px 0 8px' }}>Le colonne, nell&apos;ordine del file (separate da &quot;;&quot;). Il titolo è la prima riga del file; accanto, cosa ci va.</p>
      <ol className="te-colonne">
        {e.colonne.map((c, i) => (
          <li key={i}>
            <input value={c.titolo} onChange={(ev) => setCol(i, 'titolo', ev.target.value.toUpperCase())} aria-label={`Titolo della colonna ${i + 1}`} />
            <select value={c.campo} onChange={(ev) => setCol(i, 'campo', ev.target.value)} aria-label={`Cosa va nella colonna ${c.titolo}`}>
              {CAMPI.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
            {c.campo === 'fisso' ? <input value={c.valore || ''} onChange={(ev) => setCol(i, 'valore', ev.target.value)} placeholder="testo" aria-label="Testo fisso" /> : <span />}
            <span className="te-frecce">
              <button type="button" className="link-btn piccolo" onClick={() => sposta(i, -1)} disabled={i === 0} aria-label="Più su">↑</button>
              <button type="button" className="link-btn piccolo" onClick={() => sposta(i, 1)} disabled={i === e.colonne.length - 1} aria-label="Più giù">↓</button>
              <button type="button" className="link-btn piccolo" onClick={() => setE((x) => ({ ...x, colonne: x.colonne.filter((_, j) => j !== i) }))} aria-label="Togli la colonna">×</button>
            </span>
          </li>
        ))}
      </ol>
      <div className="azioni-riga">
        <button type="button" className="link-btn piccolo" onClick={() => setE((x) => ({ ...x, colonne: [...x.colonne, { titolo: 'NUOVA', campo: 'vuoto', valore: '' }] }))}>+ colonna</button>
        <button type="button" className="link-btn piccolo" onClick={() => setE((x) => ({ ...x, colonne: COLONNE_ASI }))}>torna al modello ASI</button>
      </div>

      <h3>Compilare il portale una persona alla volta</h3>
      <PreferitoAsi portale={e.portale} />

      <div className="azioni-riga" style={{ marginTop: 14 }}>
        <button className="btn btn-primario" disabled={invio}>{invio ? 'Salvo…' : 'Salva le impostazioni'}</button>
        <button type="button" className="btn" onClick={onChiudi}>Chiudi</button>
      </div>
    </form>
  );
}
