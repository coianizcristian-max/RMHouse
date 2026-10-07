'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { gruppiDi, nomeGruppo } from '@/lib/gruppi';

const GIORNI = ['', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const GIORNI_LUNGHI = ['', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
const oggi = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
const it = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
const hhmm = (t) => String(t || '').slice(0, 5);
const fine = (o) => {
  const [h, m] = hhmm(o.ora_inizio).split(':').map(Number);
  const t = h * 60 + m + (Number(o.durata_min) || 0);
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
const minuti = (t) => { const [h, m] = hhmm(t).split(':').map(Number); return (h || 0) * 60 + (m || 0); };
// due orari si pestano i piedi: stesso giorno, ore che si accavallano (anche solo in parte) e periodi di validità che si incrociano
export const sovrapposti = (a, b) => Number(a.giorno_settimana) === Number(b.giorno_settimana)
  && minuti(a.ora_inizio) < minuti(b.ora_inizio) + (Number(b.durata_min) || 0)
  && minuti(b.ora_inizio) < minuti(a.ora_inizio) + (Number(a.durata_min) || 0)
  && (a.valido_dal || '0000') <= (b.valido_al || '9999') && (b.valido_dal || '0000') <= (a.valido_al || '9999');
// per ogni orario: con chi si scontra (stessa sala o stessa insegnante nello stesso momento)
function scontriDi(orario, tutti, escludi) {
  const r = [];
  for (const x of tutti) {
    if (x.id === escludi || x.id === orario.id || !sovrapposti(orario, x)) continue;
    // stessa sala, e (a parte) stessa insegnante in qualunque corso o disciplina: si segnalano tutti e due
    if (orario.sala_id && x.sala_id === orario.sala_id) r.push({ tipo: 'sala', o: x });
    if (orario.insegnante_id && x.insegnante_id === orario.insegnante_id) r.push({ tipo: 'insegnante', o: x });
  }
  return r;
}
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Struttura → Orari dei corsi: tutti i corsi × i sette giorni. Si guarda, si cambia e si aggiunge da qui.
// Le lezioni seguono da sole (trigger sugli orari): spostate con chi è prenotato, o tolte se l'orario si sospende.
export default function OrariCorsi({ corsi, orari, sale, persone, palestraId, sedi = [] }) {
  const router = useRouter();
  const [cerca, setCerca] = useState('');
  const [filtro, setFiltro] = useState('tutti');   // tutti | senza | nonapp | temporanei
  const [vediSospesi, setVediSospesi] = useState(false);
  const [salaF, setSalaF] = useState('');            // solo gli orari di questa sala (vista "occupazione della sala")
  const [discF, setDiscF] = useState('');
  const [sedeF, setSedeF] = useState('');
  const [modifica, setModifica] = useState(null);  // { corso, orario? , giorno }
  const [msg, setMsg] = useState({ t: '', errore: false });
  const o0 = oggi();
  const salaDi = useMemo(() => Object.fromEntries(sale.map((s) => [s.id, s.nome])), [sale]);
  const persDi = useMemo(() => Object.fromEntries(persone.map((s) => [s.id, s.nome])), [persone]);   // nome e cognome: ci sono insegnanti con lo stesso nome

  const valido = (o) => o.attivo && (!o.valido_al || o.valido_al >= o0);
  const perCorso = useMemo(() => {
    const m = {};
    for (const o of orari) (m[o.corso_id] ||= []).push(o);
    return m;
  }, [orari]);
  const sedeSala = useMemo(() => Object.fromEntries(sale.map((x) => [x.id, x.sede_id])), [sale]);
  const discipline = useMemo(() => [...new Set(corsi.map((c) => c.disciplina).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'it')), [corsi]);
  const righe = corsi.filter((c) => !discF || c.disciplina === discF).map((c) => {
    const tutti = perCorso[c.id] || [];
    const vivi = tutti.filter(valido);
    // la sede di un orario è quella della sua sala; senza sala, quella del corso
    const sedeDi = (o) => sedeSala[o.sala_id] || c.sede_id || null;
    const ok = (o) => (!salaF || o.sala_id === salaF) && (!sedeF || sedeDi(o) === sedeF);
    const visti = (vediSospesi ? tutti : vivi).filter(ok);
    return { c, tutti, vivi, visti, inSala: (!salaF && !sedeF) ? true : visti.length > 0 || (!salaF && !tutti.length && c.sede_id === sedeF) };
  });
  // scontri fra gli orari validi oggi o in futuro (sospesi e scaduti non contano)
  const nomeCorso = useMemo(() => Object.fromEntries(corsi.map((c) => [c.id, c.nome])), [corsi]);
  const scontri = useMemo(() => {
    const vivi = orari.filter(valido);
    const m = {};
    for (const o of vivi) { const sc = scontriDi(o, vivi); if (sc.length) m[o.id] = sc; }
    return m;
  }, [orari]); // eslint-disable-line react-hooks/exhaustive-deps
  const descriviScontri = (sc) => sc.map(({ tipo, o }) => `${tipo === 'sala' ? 'stessa sala' : 'stessa insegnante'}: ${nomeCorso[o.corso_id] || 'altro corso'} ${hhmm(o.ora_inizio)}–${fine(o)}`).join('\n');
  const q = norm(cerca.trim());
  const temporaneo = (o) => o.valido_al || (o.valido_dal && o.valido_dal > o0);
  const filtrate = righe.filter(({ c, vivi, inSala }) => inSala && (!q || norm(`${c.nome} ${c.disciplina}`).includes(q))
    && (filtro === 'tutti' || (filtro === 'senza' && vivi.length === 0) || (filtro === 'nonapp' && vivi.some((o) => o.prenotabile === false))
      || (filtro === 'temporanei' && vivi.some(temporaneo)) || (filtro === 'conflitti' && vivi.some((o) => scontri[o.id]))));
  const nConflitti = righe.filter((r) => r.vivi.some((o) => scontri[o.id])).length;
  const nSenza = righe.filter((r) => r.vivi.length === 0).length;
  const nNonApp = righe.reduce((n, r) => n + r.vivi.filter((o) => o.prenotabile === false).length, 0);
  const nTemp = righe.filter((r) => r.vivi.some(temporaneo)).length;

  function nuovo(c, giorno) {
    // sala, insegnante e durata come gli altri orari del corso
    const simile = (perCorso[c.id] || []).filter(valido)[0];
    setModifica({ corso: c, orario: null, dati: {
      giorno_settimana: giorno, ora_inizio: '', durata_min: simile?.durata_min || 60, sala_id: simile?.sala_id || '',
      insegnante_id: simile?.insegnante_id || '', valido_dal: '', valido_al: '', prenotabile: simile ? simile.prenotabile !== false : true, attivo: true, gruppo: '',
    } });
  }
  function apri(c, o) {
    setModifica({ corso: c, orario: o, dati: {
      giorno_settimana: o.giorno_settimana, ora_inizio: hhmm(o.ora_inizio), durata_min: o.durata_min || 60, sala_id: o.sala_id || '',
      insegnante_id: o.insegnante_id || '', valido_dal: o.valido_dal || '', valido_al: o.valido_al || '', prenotabile: o.prenotabile !== false, attivo: o.attivo !== false,
      gruppo: o.gruppo || '',
    } });
  }
  const fatto = (t) => { setModifica(null); setMsg({ t, errore: false }); router.refresh(); };

  return (
    <div className="oc">
      <div className="oc-filtri">
        <input type="search" value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca un corso" aria-label="Cerca un corso" />
        <div className="segmenti segmenti-piccoli" role="group" aria-label="Mostra">
          {[['tutti', `Tutti (${corsi.length})`], ['conflitti', `⚠ In conflitto (${nConflitti})`], ['senza', `Senza giorni (${nSenza})`], ['nonapp', `Non scelti dall'app (${nNonApp})`], ['temporanei', `Con date (${nTemp})`]].map(([k, t]) => (
            <button key={k} type="button" aria-pressed={filtro === k} onClick={() => setFiltro(k)} className={k === 'conflitti' && nConflitti ? 'oc-filtro-rosso' : undefined}>{t}</button>
          ))}
        </div>
        {sedi.length > 1 && (
          <select value={sedeF} onChange={(e) => { setSedeF(e.target.value); setSalaF(''); }} aria-label="Sede" className={sedeF ? 'oc-sel attivo' : 'oc-sel'}>
            <option value="">Tutte le sedi</option>
            {sedi.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
          </select>
        )}
        <select value={salaF} onChange={(e) => setSalaF(e.target.value)} aria-label="Sala" className={salaF ? 'oc-sel attivo' : 'oc-sel'}>
          <option value="">Tutte le sale</option>
          {sale.filter((x) => !sedeF || x.sede_id === sedeF).map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
        </select>
        <select value={discF} onChange={(e) => setDiscF(e.target.value)} aria-label="Disciplina" className={discF ? 'oc-sel attivo' : 'oc-sel'}>
          <option value="">Tutte le discipline</option>
          {discipline.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <label className="spunta piccolo" style={{ margin: 0 }}><input type="checkbox" checked={vediSospesi} onChange={(e) => setVediSospesi(e.target.checked)} /> anche sospesi o scaduti</label>
        <span className="oc-legenda piccolo muto">
          <span className="oc-pallino si" /> si sceglie dall&apos;app <span className="oc-pallino no" /> solo in segreteria
        </span>
      </div>
      {msg.t && <p className={`piccolo ${msg.errore ? 'pl-errore' : 'pl-ok'}`} role="status">{msg.t}</p>}

      <div className="oc-scorre">
        <table className="oc-tabella">
          <colgroup><col className="oc-col-corso" />{[1, 2, 3, 4, 5, 6, 7].map((g) => <col key={g} />)}</colgroup>
          <thead>
            <tr><th>Corso</th>{GIORNI.slice(1).map((g) => <th key={g}>{g}</th>)}</tr>
          </thead>
          <tbody>
            {filtrate.map(({ c, vivi, visti }) => (
              <tr key={c.id} className={vivi.length === 0 ? 'oc-vuoto' : ''}>
                <th scope="row">
                  <Link prefetch={false} href={`/gestione/corsi/${c.id}`} title="Apri la scheda del corso">
                    <span className="oc-colore" style={{ background: c.colore || 'var(--linea)' }} /><span className="oc-nome">{c.nome}</span>
                  </Link>
                  <span className="oc-sotto">{vivi.length === 0 ? 'nessun giorno' : `${vivi.length} ${vivi.length === 1 ? 'giorno' : 'giorni'}`}
                    {gruppiDi(vivi).length ? ` · ${gruppiDi(vivi).length} gruppi` : ''}
                    {c.iscrizioni_app !== 'aperte' ? ' · iscrizioni app chiuse' : ''}</span>
                </th>
                {[1, 2, 3, 4, 5, 6, 7].map((g) => {
                  const delGiorno = visti.filter((o) => o.giorno_settimana === g).sort((a, b) => hhmm(a.ora_inizio).localeCompare(hhmm(b.ora_inizio)));
                  return (
                    <td key={g}>
                      {delGiorno.map((o) => {
                        const v = valido(o);
                        const sc = v ? scontri[o.id] : null;
                        return (
                          <button key={o.id} type="button" onClick={() => apri(c, o)}
                                  className={`oc-orario${!v ? ' spento' : ''}${o.prenotabile === false ? ' no-app' : ''}${sc ? ' conflitto' : ''}`}
                                  title={[[`${GIORNI_LUNGHI[g]} ${hhmm(o.ora_inizio)}–${fine(o)}`, salaDi[o.sala_id], persDi[o.insegnante_id],
                                    o.prenotabile === false ? 'non si sceglie dall\'app' : 'si sceglie dall\'app'].filter(Boolean).join(' · '),
                                    sc ? `⚠ IN CONFLITTO\n${descriviScontri(sc)}` : null].filter(Boolean).join('\n')}>
                            <span className="oc-ora"><span className={`oc-pallino ${o.prenotabile === false ? 'no' : 'si'}`} />{hhmm(o.ora_inizio)}–{fine(o)}
                              {(!o.attivo || temporaneo(o)) && (
                                <span className="oc-date">{!o.attivo ? 'sospeso' : o.valido_dal > o0 ? `dal ${it(o.valido_dal)}` : `al ${it(o.valido_al)}`}</span>
                              )}
                              {nomeGruppo(o) && <span className="oc-gruppo" title={`Gruppo: ${nomeGruppo(o)}`}>{nomeGruppo(o)}</span>}
                              {sc && <span className="oc-avviso-scontro" aria-label="In conflitto">
                                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 2 1 21h22L12 2Zm1 15h-2v2h2v-2Zm0-7h-2v5h2v-5Z"/></svg></span>}</span>
                            <span className={`oc-riga${sc?.some((x) => x.tipo === 'sala') ? ' rosso' : ''}`}>{salaDi[o.sala_id] || 'sala —'}</span>
                            <span className={`oc-riga${sc?.some((x) => x.tipo === 'insegnante') ? ' rosso' : ''}`}>{persDi[o.insegnante_id] || 'insegnante —'}</span>
                          </button>
                        );
                      })}
                      <button type="button" className="oc-aggiungi" onClick={() => nuovo(c, g)} aria-label={`Aggiungi un orario di ${c.nome} il ${GIORNI_LUNGHI[g]}`} title="Aggiungi un orario">+</button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtrate.length === 0 && <div className="vuoto">Nessun corso.</div>}
      <p className="piccolo muto" style={{ marginTop: 8 }}>
        Cambiando giorno, ora o durata le lezioni future si spostano con chi è prenotato. Sospendendo un orario le sue lezioni future spariscono
        (chi era prenotato viene avvisato e alla segreteria arriva il promemoria per spostarlo).
      </p>

      {modifica && (
        <Modifica m={modifica} sale={sale} persone={persone} palestraId={palestraId}
                  orariVivi={orari.filter(valido)} nomeCorso={nomeCorso} salaDi={salaDi} persDi={persDi}
                  onChiudi={() => setModifica(null)} onFatto={fatto} />
      )}
    </div>
  );
}

function Modifica({ m, sale, persone, palestraId, orariVivi, nomeCorso, salaDi, persDi, onChiudi, onFatto }) {
  const [d, setD] = useState(m.dati);
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const set = (k) => (e) => setD((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const nuovo = !m.orario;
  // mentre si scrive: chi occupa già quella sala quel giorno, e cosa si accavalla (anche l'insegnante)
  const prova = { id: m.orario?.id || 'nuovo', giorno_settimana: Number(d.giorno_settimana), ora_inizio: d.ora_inizio || '00:00', durata_min: Number(d.durata_min) || 0,
    sala_id: d.sala_id || null, insegnante_id: d.insegnante_id || null, valido_dal: d.valido_dal || oggi(), valido_al: d.valido_al || null };
  const altri = orariVivi.filter((x) => x.id !== m.orario?.id);
  const gruppiCorso = [...new Set(orariVivi.filter((x) => x.corso_id === m.corso.id).map(nomeGruppo).filter(Boolean))].sort();
  const scontriOra = d.ora_inizio && Number(d.durata_min) > 0 ? scontriDi(prova, altri) : [];
  const giornataSala = d.sala_id ? altri.filter((x) => x.sala_id === d.sala_id && Number(x.giorno_settimana) === prova.giorno_settimana
    && (prova.valido_dal || '0000') <= (x.valido_al || '9999') && (x.valido_dal || '0000') <= (prova.valido_al || '9999'))
    .sort((a, b) => hhmm(a.ora_inizio).localeCompare(hhmm(b.ora_inizio))) : [];
  const spostato = !nuovo && (Number(d.giorno_settimana) !== m.orario.giorno_settimana || d.ora_inizio !== hhmm(m.orario.ora_inizio) || Number(d.durata_min) !== m.orario.durata_min);
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onChiudi(); };
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc);
  }, [onChiudi]);

  async function salva(e) {
    e?.preventDefault();
    if (!d.ora_inizio) { setErrore('Scrivi l\'ora di inizio.'); return; }
    if (!(Number(d.durata_min) > 0)) { setErrore('Scrivi la durata in minuti.'); return; }
    if (d.valido_al && d.valido_dal && d.valido_al < d.valido_dal) { setErrore('"Fino al" è prima di "Dal".'); return; }
    if (scontriOra.length && !confirm(`Attenzione: ${scontriOra.length === 1 ? 'si accavalla con' : `si accavalla con ${scontriOra.length} orari:`}\n\n${scontriOra.map(({ tipo, o }) => `• ${nomeCorso[o.corso_id] || 'altro corso'} ${hhmm(o.ora_inizio)}–${fine(o)} (${tipo === 'sala' ? `stessa sala: ${salaDi[o.sala_id] || ''}` : `stessa insegnante: ${persDi[o.insegnante_id] || ''}`})`).join('\n')}\n\nSalvare comunque?`)) return;
    setInvio(true); setErrore('');
    const dati = {
      giorno_settimana: Number(d.giorno_settimana), ora_inizio: d.ora_inizio, durata_min: Number(d.durata_min),
      sala_id: d.sala_id || null, insegnante_id: d.insegnante_id || null, valido_dal: d.valido_dal || m.orario?.valido_dal || oggi(), valido_al: d.valido_al || null,
      prenotabile: !!d.prenotabile, attivo: !!d.attivo, gruppo: String(d.gruppo || '').trim() || null,
    };
    const db = supabaseBrowser();
    const { error } = nuovo
      ? await db.from('orari').insert({ ...dati, palestra_id: palestraId, corso_id: m.corso.id })
      : await db.from('orari').update(dati).eq('id', m.orario.id);
    setInvio(false);
    if (error) { setErrore('Non salvato: controlla i dati e riprova.'); return; }
    onFatto(nuovo
      ? `${m.corso.nome}: aggiunto ${GIORNI_LUNGHI[dati.giorno_settimana]} alle ${dati.ora_inizio}. Le lezioni dei prossimi tre mesi sono nel palinsesto.`
      : `${m.corso.nome}: orario aggiornato${spostato ? ', lezioni future spostate' : ''}.`);
  }

  async function sospendi() {
    if (!confirm(`Sospendere ${m.corso.nome} del ${GIORNI_LUNGHI[m.orario.giorno_settimana]} alle ${hhmm(m.orario.ora_inizio)}?\n\nLe lezioni future di questo orario spariscono dal palinsesto; chi era prenotato viene avvisato e alla segreteria arriva il promemoria per spostarlo.`)) return;
    setInvio(true);
    const { error } = await supabaseBrowser().from('orari').update({ attivo: false }).eq('id', m.orario.id);
    setInvio(false);
    if (error) { setErrore('Non riuscito. Riprova.'); return; }
    onFatto(`${m.corso.nome}: orario del ${GIORNI_LUNGHI[m.orario.giorno_settimana]} sospeso.`);
  }

  const insegnanti = persone.filter((p) => p.attivo || p.id === d.insegnante_id);
  return (
    <div className="oc-velo" role="dialog" aria-modal="true" aria-label={nuovo ? 'Nuovo orario' : 'Modifica orario'} onClick={onChiudi}>
      <form className="oc-modifica" onClick={(e) => e.stopPropagation()} onSubmit={salva}>
        <div className="oc-mod-testa">
          <span className="oc-colore" style={{ background: m.corso.colore || 'var(--linea)' }} />
          <h2>{m.corso.nome}</h2>
          <span className="piccolo muto">{nuovo ? 'nuovo orario' : 'modifica orario'}</span>
        </div>
        {errore && <div className="errore" role="alert">{errore}</div>}
        <div className="oc-campi">
          <div className="campo"><label htmlFor="oc-g">Giorno</label>
            <select id="oc-g" value={d.giorno_settimana} onChange={set('giorno_settimana')}>
              {[1, 2, 3, 4, 5, 6, 7].map((g) => <option key={g} value={g}>{GIORNI_LUNGHI[g]}</option>)}
            </select></div>
          <div className="campo"><label htmlFor="oc-o">Inizio</label>
            <input id="oc-o" type="time" step="300" value={d.ora_inizio} onChange={set('ora_inizio')} autoFocus={nuovo} required /></div>
          <div className="campo"><label htmlFor="oc-d">Durata (min)</label>
            <input id="oc-d" type="number" min="5" step="5" value={d.durata_min} onChange={set('durata_min')} required />
            {d.ora_inizio && Number(d.durata_min) > 0 && <span className="piccolo muto">finisce alle {fine({ ora_inizio: d.ora_inizio, durata_min: d.durata_min })}</span>}</div>
          <div className="campo"><label htmlFor="oc-s">Sala</label>
            <select id="oc-s" value={d.sala_id} onChange={set('sala_id')}>
              <option value="">—</option>
              {sale.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select></div>
          <div className="campo"><label htmlFor="oc-i">Insegnante</label>
            <select id="oc-i" value={d.insegnante_id} onChange={set('insegnante_id')}>
              <option value="">—</option>
              {insegnanti.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select></div>
          <div className="campo"><label htmlFor="oc-dal">Valido dal</label>
            <input id="oc-dal" type="date" value={d.valido_dal} onChange={set('valido_dal')} />
            <span className="piccolo muto">vuoto = da oggi</span></div>
          <div className="campo"><label htmlFor="oc-al">Fino al</label>
            <input id="oc-al" type="date" value={d.valido_al} min={d.valido_dal || undefined} onChange={set('valido_al')} />
            <span className="piccolo muto">vuoto = sempre</span></div>
          <div className="campo oc-campo-gruppo"><label htmlFor="oc-gr">Gruppo <span className="piccolo muto">(se il corso ha più gruppi)</span></label>
            <input id="oc-gr" list="oc-gruppi" value={d.gruppo} onChange={set('gruppo')} placeholder="es. Serale Eloise" maxLength={40} />
            <datalist id="oc-gruppi">{gruppiCorso.map((g) => <option key={g} value={g} />)}</datalist>
            <span className="piccolo muto">Chi si iscrive dall&apos;app sceglie prima il gruppo e poi solo i suoi giorni.</span></div>
        </div>
        <label className="spunta"><input type="checkbox" checked={!!d.prenotabile} onChange={set('prenotabile')} />
          <span>Si sceglie dall&apos;app <span className="piccolo muto">(iscrizioni, prove e recuperi dei clienti)</span></span></label>
        {!nuovo && !m.orario.attivo && (
          <label className="spunta"><input type="checkbox" checked={!!d.attivo} onChange={set('attivo')} /><span>Attivo (riattiva l&apos;orario)</span></label>
        )}
        {d.sala_id && (
          <div className={`oc-occupazione${scontriOra.length ? ' scontro' : ''}`}>
            <div className="oc-occ-testa">
              {scontriOra.length
                ? <><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 2 1 21h22L12 2Zm1 15h-2v2h2v-2Zm0-7h-2v5h2v-5Z"/></svg> Si accavalla con {scontriOra.length === 1 ? 'un altro orario' : `${scontriOra.length} orari`}</>
                : d.ora_inizio ? '✓ Sala e insegnante libere in questo orario' : 'Scegli l\'ora per vedere se la sala è libera'}
            </div>
            <div className="piccolo muto">{salaDi[d.sala_id]} · {GIORNI_LUNGHI[prova.giorno_settimana]}: {giornataSala.length ? '' : 'nessun altro corso'}</div>
            {giornataSala.length > 0 && (
              <ul className="oc-occ-lista">
                {giornataSala.map((x) => {
                  const pesta = d.ora_inizio && sovrapposti(prova, x);
                  return <li key={x.id} className={pesta ? 'pesta' : ''}><b>{hhmm(x.ora_inizio)}–{fine(x)}</b> {nomeCorso[x.corso_id] || 'altro corso'}{persDi[x.insegnante_id] ? ` · ${persDi[x.insegnante_id]}` : ''}{pesta ? ' ← si accavalla' : ''}</li>;
                })}
              </ul>
            )}
            {scontriOra.filter((x) => x.tipo === 'insegnante').map(({ o }) => (
              <div key={o.id} className="oc-occ-ins">{persDi[o.insegnante_id]} è già a {nomeCorso[o.corso_id] || 'un altro corso'} {hhmm(o.ora_inizio)}–{fine(o)}{o.sala_id ? ` (${salaDi[o.sala_id]})` : ''}</div>
            ))}
          </div>
        )}
        {spostato && <p className="piccolo oc-avviso">Le lezioni future di questo orario si spostano al nuovo giorno/ora, con chi è prenotato.</p>}
        <div className="oc-mod-azioni">
          <button type="submit" className="btn btn-primario" disabled={invio}>{invio ? 'Salvo…' : nuovo ? 'Aggiungi orario' : 'Salva'}</button>
          <button type="button" className="btn" onClick={onChiudi}>Annulla</button>
          {!nuovo && m.orario.attivo && <button type="button" className="link-btn piccolo oc-sospendi" onClick={sospendi} disabled={invio}>Sospendi questo orario</button>}
        </div>
      </form>
    </div>
  );
}
