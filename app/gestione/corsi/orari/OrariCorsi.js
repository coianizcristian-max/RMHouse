'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';

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
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Struttura → Orari dei corsi: tutti i corsi × i sette giorni. Si guarda, si cambia e si aggiunge da qui.
// Le lezioni seguono da sole (trigger sugli orari): spostate con chi è prenotato, o tolte se l'orario si sospende.
export default function OrariCorsi({ corsi, orari, sale, persone, palestraId }) {
  const router = useRouter();
  const [cerca, setCerca] = useState('');
  const [filtro, setFiltro] = useState('tutti');   // tutti | senza | nonapp | temporanei
  const [vediSospesi, setVediSospesi] = useState(false);
  const [modifica, setModifica] = useState(null);  // { corso, orario? , giorno }
  const [msg, setMsg] = useState({ t: '', errore: false });
  const o0 = oggi();
  const salaDi = useMemo(() => Object.fromEntries(sale.map((s) => [s.id, s.nome])), [sale]);
  const persDi = useMemo(() => Object.fromEntries(persone.map((s) => [s.id, s.breve])), [persone]);

  const valido = (o) => o.attivo && (!o.valido_al || o.valido_al >= o0);
  const perCorso = useMemo(() => {
    const m = {};
    for (const o of orari) (m[o.corso_id] ||= []).push(o);
    return m;
  }, [orari]);
  const righe = corsi.map((c) => {
    const tutti = perCorso[c.id] || [];
    const vivi = tutti.filter(valido);
    return { c, tutti, vivi, visti: vediSospesi ? tutti : vivi };
  });
  const q = norm(cerca.trim());
  const temporaneo = (o) => o.valido_al || (o.valido_dal && o.valido_dal > o0);
  const filtrate = righe.filter(({ c, vivi }) => (!q || norm(`${c.nome} ${c.disciplina}`).includes(q))
    && (filtro === 'tutti' || (filtro === 'senza' && vivi.length === 0) || (filtro === 'nonapp' && vivi.some((o) => o.prenotabile === false))
      || (filtro === 'temporanei' && vivi.some(temporaneo))));
  const nSenza = righe.filter((r) => r.vivi.length === 0).length;
  const nNonApp = righe.reduce((n, r) => n + r.vivi.filter((o) => o.prenotabile === false).length, 0);
  const nTemp = righe.filter((r) => r.vivi.some(temporaneo)).length;

  function nuovo(c, giorno) {
    // sala, insegnante e durata come gli altri orari del corso
    const simile = (perCorso[c.id] || []).filter(valido)[0];
    setModifica({ corso: c, orario: null, dati: {
      giorno_settimana: giorno, ora_inizio: '', durata_min: simile?.durata_min || 60, sala_id: simile?.sala_id || '',
      insegnante_id: simile?.insegnante_id || '', valido_dal: '', valido_al: '', prenotabile: simile ? simile.prenotabile !== false : true, attivo: true,
    } });
  }
  function apri(c, o) {
    setModifica({ corso: c, orario: o, dati: {
      giorno_settimana: o.giorno_settimana, ora_inizio: hhmm(o.ora_inizio), durata_min: o.durata_min || 60, sala_id: o.sala_id || '',
      insegnante_id: o.insegnante_id || '', valido_dal: o.valido_dal || '', valido_al: o.valido_al || '', prenotabile: o.prenotabile !== false, attivo: o.attivo !== false,
    } });
  }
  const fatto = (t) => { setModifica(null); setMsg({ t, errore: false }); router.refresh(); };

  return (
    <div className="oc">
      <div className="oc-filtri">
        <input type="search" value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca un corso" aria-label="Cerca un corso" />
        <div className="segmenti segmenti-piccoli" role="group" aria-label="Mostra">
          {[['tutti', `Tutti (${corsi.length})`], ['senza', `Senza giorni (${nSenza})`], ['nonapp', `Non scelti dall'app (${nNonApp})`], ['temporanei', `Con date (${nTemp})`]].map(([k, t]) => (
            <button key={k} type="button" aria-pressed={filtro === k} onClick={() => setFiltro(k)}>{t}</button>
          ))}
        </div>
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
                    {c.iscrizioni_app !== 'aperte' ? ' · iscrizioni app chiuse' : ''}</span>
                </th>
                {[1, 2, 3, 4, 5, 6, 7].map((g) => {
                  const delGiorno = visti.filter((o) => o.giorno_settimana === g).sort((a, b) => hhmm(a.ora_inizio).localeCompare(hhmm(b.ora_inizio)));
                  return (
                    <td key={g}>
                      {delGiorno.map((o) => {
                        const v = valido(o);
                        return (
                          <button key={o.id} type="button" onClick={() => apri(c, o)}
                                  className={`oc-orario${!v ? ' spento' : ''}${o.prenotabile === false ? ' no-app' : ''}`}
                                  title={[`${GIORNI_LUNGHI[g]} ${hhmm(o.ora_inizio)}–${fine(o)}`, salaDi[o.sala_id], persDi[o.insegnante_id],
                                    o.prenotabile === false ? 'non si sceglie dall\'app' : 'si sceglie dall\'app'].filter(Boolean).join(' · ')}>
                            <span className="oc-ora"><span className={`oc-pallino ${o.prenotabile === false ? 'no' : 'si'}`} />{hhmm(o.ora_inizio)}–{fine(o)}
                              {(!o.attivo || temporaneo(o)) && (
                                <span className="oc-date">{!o.attivo ? 'sospeso' : o.valido_dal > o0 ? `dal ${it(o.valido_dal)}` : `al ${it(o.valido_al)}`}</span>
                              )}</span>
                            <span className="oc-riga">{salaDi[o.sala_id] || 'sala —'}</span>
                            <span className="oc-riga">{persDi[o.insegnante_id] || 'insegnante —'}</span>
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
                  onChiudi={() => setModifica(null)} onFatto={fatto} />
      )}
    </div>
  );
}

function Modifica({ m, sale, persone, palestraId, onChiudi, onFatto }) {
  const [d, setD] = useState(m.dati);
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const set = (k) => (e) => setD((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const nuovo = !m.orario;
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
    setInvio(true); setErrore('');
    const dati = {
      giorno_settimana: Number(d.giorno_settimana), ora_inizio: d.ora_inizio, durata_min: Number(d.durata_min),
      sala_id: d.sala_id || null, insegnante_id: d.insegnante_id || null, valido_dal: d.valido_dal || m.orario?.valido_dal || oggi(), valido_al: d.valido_al || null,
      prenotabile: !!d.prenotabile, attivo: !!d.attivo,
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
        </div>
        <label className="spunta"><input type="checkbox" checked={!!d.prenotabile} onChange={set('prenotabile')} />
          <span>Si sceglie dall&apos;app <span className="piccolo muto">(iscrizioni, prove e recuperi dei clienti)</span></span></label>
        {!nuovo && !m.orario.attivo && (
          <label className="spunta"><input type="checkbox" checked={!!d.attivo} onChange={set('attivo')} /><span>Attivo (riattiva l&apos;orario)</span></label>
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
