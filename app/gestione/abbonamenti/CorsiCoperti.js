'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { euro } from '@/lib/formato';

const VISTE = [['modifica', 'Modifica per abbonamento'], ['abbonamenti', 'Abbonamento → corsi'], ['corsi', 'Corso → abbonamenti']];
const chiave = (t, c) => `${t}|${c}`;
const perNome = (a, b) => a.nome.localeCompare(b.nome, 'it', { numeric: true, sensitivity: 'base' });
// prezzo, durata e volte a settimana in una riga (come la lista abbonamenti di APP Titolare)
const durataBreve = (t) => {
  if (t.modalita === 'ingressi') return `${t.num_ingressi || '?'} ingressi`;
  if (t.durata_giorni && t.durata_giorni < 28) return t.durata_giorni === 1 ? '1 giorno' : `${t.durata_giorni} giorni`;
  const m = t.durata_mesi || 1;
  return m === 1 ? (t.scadenza_fine_mese ? 'mese solare' : '1 mese') : `${m} mesi`;
};
const infoTipo = (t) => [t.codice, durataBreve(t), t.lezioni_settimanali ? `${t.lezioni_settimanali}×/sett.` : null,
  t.prezzo_cent != null ? euro(t.prezzo_cent) : null,
  t.prezzo_web_cent != null && t.prezzo_web_cent !== t.prezzo_cent ? `${euro(t.prezzo_web_cent)} web` : null,
  t.attivo === false ? 'non attivo' : null].filter(Boolean).join(' · ');
const minuscolo = (s) => (s || '').toLocaleLowerCase('it').normalize('NFD').replace(/[̀-ͯ]/g, '');

// Quali corsi dà diritto a frequentare ogni abbonamento. Nessun corso = tutti.
// Tre viste: si modifica per abbonamento, e si controlla incrociato (abbonamento → corsi, corso → abbonamenti)
export default function CorsiCoperti({ tipi: tutti, corsi, coperti, gruppi = [] }) {
  const router = useRouter();
  const [vista, setVista] = useState('modifica');
  const [gruppo, setGruppo] = useState('');
  const tipi = gruppo ? tutti.filter((t) => t.gruppo_id === gruppo) : tutti;
  const [tipoId, setTipoId] = useState(tipi[0]?.id || '');
  const [errore, setErrore] = useState('');
  const [cerca, setCerca] = useState('');
  const [soloDaVedere, setSoloDaVedere] = useState(false);
  const [corsoAperto, setCorsoAperto] = useState('');

  // gli abbinamenti come li conosce la pagina: si aggiornano subito al tocco e poi seguono il database
  const dalDb = useMemo(() => new Set(coperti.map((c) => chiave(c.tipo_abbonamento_id, c.corso_id))), [coperti]);
  const [coppie, setCoppie] = useState(dalDb);
  useEffect(() => { setCoppie(dalDb); }, [dalDb]);

  const corsiDi = useMemo(() => {
    const m = {};
    for (const k of coppie) { const [t, c] = k.split('|'); (m[t] ||= new Set()).add(c); }
    return m;
  }, [coppie]);
  const nomeCorso = useMemo(() => Object.fromEntries(corsi.map((c) => [c.id, c.nome])), [corsi]);
  const scelti = corsiDi[tipoId] || new Set();
  const famiglie = [...new Set(tipi.map((t) => t.famiglia || 'Altri'))];
  const nomeGruppo = Object.fromEntries(gruppi.map((g) => [g.id, g.nome]));

  async function cambia(tId, corsoId) {
    setErrore('');
    const db = supabaseBrowser();
    const k = chiave(tId, corsoId);
    const togli = coppie.has(k);
    const prima = coppie;
    const prossimo = new Set(coppie);
    togli ? prossimo.delete(k) : prossimo.add(k);
    setCoppie(prossimo);
    const { error } = togli
      ? await db.from('tipi_abbonamento_corsi').delete().eq('tipo_abbonamento_id', tId).eq('corso_id', corsoId)
      // se l'abbinamento c'è già (doppio clic, pagina non aggiornata) non è un errore
      : await db.from('tipi_abbonamento_corsi').upsert({ tipo_abbonamento_id: tId, corso_id: corsoId },
          { onConflict: 'tipo_abbonamento_id,corso_id', ignoreDuplicates: true });
    if (error) { setCoppie(prima); setErrore('Modifica non riuscita.'); return; }
    router.refresh();
  }

  function apriAbbonamento(id) {
    const t = tutti.find((x) => x.id === id);
    if (gruppo && t?.gruppo_id !== gruppo) setGruppo('');
    setTipoId(id); setVista('modifica'); setCerca('');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const q = minuscolo(cerca.trim());
  const perTutti = tipi.filter((t) => !corsiDi[t.id]?.size);

  // vista abbonamento → corsi, raggruppata per gruppo di listino
  const righeAbb = tipi.filter((t) => (!q || minuscolo(`${t.nome} ${t.codice || ''}`).includes(q)) && (!soloDaVedere || !corsiDi[t.id]?.size));
  const blocchiAbb = [...new Set(righeAbb.map((t) => t.gruppo_id || ''))]
    .map((g) => ({ g, titolo: g ? nomeGruppo[g] || 'Gruppo' : 'Senza gruppo', righe: righeAbb.filter((t) => (t.gruppo_id || '') === g).sort(perNome) }))
    .sort((a, b) => (a.g ? 0 : 1) - (b.g ? 0 : 1) || a.titolo.localeCompare(b.titolo, 'it'));

  // vista corso → abbonamenti (quelli scelti apposta; quelli "per tutti" valgono per ogni corso e si contano a parte)
  const abbDi = useMemo(() => {
    const m = {};
    for (const t of tipi) for (const c of corsiDi[t.id] || []) (m[c] ||= []).push(t);
    return m;
  }, [tipi, corsiDi]);
  const righeCorsi = corsi.filter((c) => (!q || minuscolo(c.nome).includes(q)) && (!soloDaVedere || !abbDi[c.id]?.length));
  const blocchiCorsi = [...new Set(righeCorsi.map((c) => c.disciplina || 'Altri corsi'))].sort((a, b) => a.localeCompare(b, 'it'))
    .map((d) => ({ d, righe: righeCorsi.filter((c) => (c.disciplina || 'Altri corsi') === d).sort(perNome) }));

  const sceltaGruppo = gruppi.length > 0 && (
    <div className="campo">
      <label htmlFor="gruppo-coperti">Gruppo</label>
      <select id="gruppo-coperti" value={gruppo} onChange={(e) => {
        const g = e.target.value; setGruppo(g);
        setTipoId((g ? tutti.filter((t) => t.gruppo_id === g) : tutti)[0]?.id || '');
      }}>
        <option value="">Tutti i gruppi</option>
        {gruppi.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
      </select>
    </div>
  );

  return (
    <>
      <div className="segmenti" role="group" aria-label="Vista dei corsi coperti">
        {VISTE.map(([k, t]) => (
          <button key={k} type="button" aria-pressed={vista === k} onClick={() => { setVista(k); setCorsoAperto(''); setCerca(''); }}>{t}</button>
        ))}
      </div>
      {errore && <div className="errore" role="alert">{errore}</div>}

      {vista === 'modifica' && (
        <>
          <p className="muto piccolo">
            Scegli un abbonamento e tocca i corsi che copre. Servono a proporre l'abbonamento giusto quando iscrivi
            qualcuno a un corso. Se non ne tocchi nessuno, l'abbonamento vale per tutti i corsi.
          </p>
          <div className="coperti-scelta">
            {sceltaGruppo}
            <div className="campo">
              <label htmlFor="tipo-coperti">Abbonamento</label>
              <select id="tipo-coperti" value={tipoId} onChange={(e) => setTipoId(e.target.value)}>
                {famiglie.map((f) => (
                  <optgroup key={f} label={f}>
                    {tipi.filter((t) => (t.famiglia || 'Altri') === f).map((t) => (
                      <option key={t.id} value={t.id}>{t.nome}{t.codice ? ` · ${t.codice}` : ''}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>
          <p className="piccolo muto">{scelti.size ? `${scelti.size} corsi coperti` : 'Vale per tutti i corsi'}</p>
          <div className="pastiglie">
            {[...corsi].sort((a, b) => (scelti.has(b.id) - scelti.has(a.id)) || a.nome.localeCompare(b.nome)).map((c) => (
              <button key={c.id} type="button" aria-pressed={scelti.has(c.id)} onClick={() => cambia(tipoId, c.id)}
                      style={{ paddingLeft: 14 }}>{c.nome}</button>
            ))}
          </div>
        </>
      )}

      {vista !== 'modifica' && (
        <>
          <p className="muto piccolo">
            {vista === 'abbonamenti'
              ? 'Ogni abbonamento con i corsi che copre. Tocca il nome per cambiarli.'
              : 'Ogni corso con gli abbonamenti che lo coprono. Tocca il corso per aggiungere o togliere abbonamenti.'}
          </p>
          <div className="coperti-scelta coperti-filtri">
            {sceltaGruppo}
            <div className="campo">
              <label htmlFor="cerca-coperti">Cerca</label>
              <input id="cerca-coperti" type="search" value={cerca} onChange={(e) => setCerca(e.target.value)}
                     placeholder={vista === 'abbonamenti' ? 'nome o codice abbonamento' : 'nome del corso'} />
            </div>
          </div>
          <label className="spunta piccolo coperti-solo">
            <input type="checkbox" checked={soloDaVedere} onChange={(e) => setSoloDaVedere(e.target.checked)} />
            {vista === 'abbonamenti' ? ' solo quelli senza corsi scelti (valgono per tutti)' : ' solo i corsi senza un abbonamento scelto apposta'}
          </label>
        </>
      )}

      {vista === 'abbonamenti' && (
        <div className="coperti-tabella">
          <div className="coperti-riga coperti-intestazione" aria-hidden="true"><span>Abbonamento</span><span>Corsi coperti</span></div>
          {blocchiAbb.length === 0 && <div className="vuoto">Nessun abbonamento.</div>}
          {blocchiAbb.map(({ g, titolo, righe }) => (
            <div key={g || 'senza'}>
              {!gruppo && <h3 className="coperti-blocco">{titolo} <span className="muto">· {righe.length}</span></h3>}
              {righe.map((t) => {
                const cs = [...(corsiDi[t.id] || [])].map((id) => nomeCorso[id]).filter(Boolean).sort((a, b) => a.localeCompare(b, 'it'));
                return (
                  <div key={t.id} className="coperti-riga">
                    <button type="button" className="coperti-nome" onClick={() => apriAbbonamento(t.id)}>
                      <strong>{t.nome}</strong>
                      <span className="piccolo muto">{infoTipo(t)}</span>
                    </button>
                    <div className="coperti-lista">
                      {cs.length ? cs.map((n) => <span key={n} className="coperti-chip">{n}</span>)
                        : <span className="coperti-tutti">tutti i corsi</span>}
                      {cs.length > 0 && <span className="piccolo muto">{cs.length}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {vista === 'corsi' && (
        <div className="coperti-tabella">
          <div className="coperti-riga coperti-intestazione" aria-hidden="true"><span>Corso</span><span>Abbonamenti che lo coprono</span></div>
          {perTutti.length > 0 && (
            <p className="piccolo muto coperti-nota">
              Più {perTutti.length} {perTutti.length === 1 ? 'abbonamento che vale' : 'abbonamenti che valgono'} per tutti i corsi
              (nessun corso scelto): non sono ripetuti qui sotto. Li vedi in &quot;Abbonamento → corsi&quot;.
            </p>
          )}
          {blocchiCorsi.length === 0 && <div className="vuoto">Nessun corso.</div>}
          {blocchiCorsi.map(({ d, righe }) => (
            <div key={d}>
              <h3 className="coperti-blocco">{d} <span className="muto">· {righe.length}</span></h3>
              {righe.map((c) => {
                const as = [...(abbDi[c.id] || [])].sort(perNome);
                const aperto = corsoAperto === c.id;
                return (
                  <div key={c.id} className={`coperti-riga${aperto ? ' aperta' : ''}`}>
                    <button type="button" className="coperti-nome" aria-expanded={aperto} onClick={() => setCorsoAperto(aperto ? '' : c.id)}>
                      <strong>{c.nome}</strong>
                      <span className="piccolo muto">{aperto ? 'chiudi' : 'modifica'}</span>
                    </button>
                    {!aperto ? (
                      <div className="coperti-lista">
                        {as.length ? as.map((t) => (
                          <button key={t.id} type="button" className="coperti-chip" title="Apri questo abbonamento" onClick={() => apriAbbonamento(t.id)}>
                            {t.nome}{t.codice ? ` · ${t.codice}` : ''}
                          </button>
                        )) : <span className="coperti-manca">nessun abbonamento scelto apposta{perTutti.length ? ' (solo quelli per tutti i corsi)' : ''}</span>}
                        {as.length > 0 && <span className="piccolo muto">{as.length}</span>}
                      </div>
                    ) : (
                      <div>
                        <p className="piccolo muto" style={{ margin: '0 0 8px' }}>
                          Tocca gli abbonamenti che coprono {c.nome}. Attenzione: uno che ora vale per tutti i corsi, se lo tocchi,
                          varrà solo per i corsi scelti.
                        </p>
                        <div className="pastiglie">
                          {[...tipi].sort((a, b) => (coppie.has(chiave(b.id, c.id)) - coppie.has(chiave(a.id, c.id))) || perNome(a, b)).map((t) => (
                            <button key={t.id} type="button" aria-pressed={coppie.has(chiave(t.id, c.id))} onClick={() => cambia(t.id, c.id)}
                                    style={{ paddingLeft: 14 }}>
                              {t.nome}{t.codice ? ` · ${t.codice}` : ''}{!corsiDi[t.id]?.size ? ' (tutti)' : ''}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
