'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { euro, dataBreve, ora } from '@/lib/formato';
import { comeCsv } from '@/lib/stati';
import AssegnaGiorni from '../AssegnaGiorni';

const GIORNI = ['', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
const gg = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
const giorniTra = (da, a) => Math.round((new Date(`${a}T12:00:00Z`) - new Date(`${da}T12:00:00Z`)) / 86400000);
const oggiISO = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });

const PROBLEMI = [
  ['certificato', 'Certificato da sistemare'],
  ['saldo', 'Da saldare'],
  ['incasso', 'Senza incasso'],
  ['tessera', 'Tessera da fare'],
  ['scade', 'Abbonamento in scadenza (14 gg)'],
  ['giorni', 'Giorni da sistemare'],
];

// stato del certificato: ok | presto (entro 30 gg) | no
function certStato(c, oggi) {
  if (!c) return ['no', 'manca'];
  if (c < oggi) return ['no', `scaduto ${gg(c)}`];
  if (giorniTra(oggi, c) <= 30) return ['presto', `scade ${gg(c)}`];
  return ['ok', dataBreve(c)];
}

// Iscritti per corso (query 154): al posto del file Excel della segreteria. Filtri per area, nome e problemi;
// note e scadenza del certificato si cambiano scrivendoci sopra; i giorni con "giorni".
export default function Iscritti({ dati, corsoIniziale = '', cercaIniziale = '', problemaIniziale = '' }) {
  const oggi = dati?.data || oggiISO();
  const corsi = useMemo(() => dati?.corsi || [], [dati]);
  const [cat, setCat] = useState('');
  const [corsoSel, setCorsoSel] = useState(corsoIniziale);
  const [cerca, setCerca] = useState(cercaIniziale);
  const [problemi, setProblemi] = useState(problemaIniziale && PROBLEMI.some(([k]) => k === problemaIniziale) ? [problemaIniziale] : []);
  const [conProve, setConProve] = useState(true);
  const [note, setNote] = useState({});        // iscrizione_id → nota cambiata qui
  const [certificati, setCertificati] = useState({});   // allievo_id → scadenza cambiata qui
  const [giorniAperti, setGiorniAperti] = useState(null);
  const [errore, setErrore] = useState('');

  const categorie = useMemo(() => [...new Set(corsi.map((c) => c.categoria || 'Altro'))], [corsi]);
  const notaDi = (p) => (p.iscrizione_id in note ? note[p.iscrizione_id] : p.note || '');
  const certDi = (p) => (p.allievo_id in certificati ? certificati[p.allievo_id] : p.certificato);

  const problemiDi = (p) => {
    const out = [];
    if (certStato(certDi(p), oggi)[0] !== 'ok') out.push('certificato');
    if (p.da_saldare) out.push('saldo');
    if (!p.tessera || p.tessera.stato !== 'tesserato') out.push('tessera');
    if (p.fino_al && giorniTra(oggi, p.fino_al) <= 14) out.push('scade');
    if (p.modalita === 'orari_fissi' && (!p.orari?.length || (p.volte > 0 && p.orari.length > p.volte))) out.push('giorni');
    if (p.senza_incasso && !p.da_saldare) out.push('incasso');
    return out;
  };

  const vista = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return corsi
      .filter((c) => (!cat || (c.categoria || 'Altro') === cat) && (!corsoSel || c.id === corsoSel))
      .map((c) => {
        const persone = c.persone.filter((p) => (!q || `${p.nome} ${p.cognome} ${p.cognome} ${p.nome} ${p.chi_paga || ''} ${p.telefono || ''} ${notaDi(p)}`.toLowerCase().includes(q))
          && (!problemi.length || problemiDi(p).some((x) => problemi.includes(x))));
        const prove = conProve && !problemi.length ? c.prove.filter((p) => !q || `${p.nome} ${p.cognome}`.toLowerCase().includes(q)) : [];
        const attese = conProve && !problemi.length ? c.attese.filter((p) => !q || `${p.nome} ${p.cognome}`.toLowerCase().includes(q)) : [];
        return { ...c, visibili: persone, proveV: prove, atteseV: attese };
      })
      .filter((c) => c.visibili.length || c.proveV.length || c.atteseV.length || (!q && !problemi.length));
  }, [corsi, cat, corsoSel, cerca, problemi, conProve, note, certificati]); // eslint-disable-line react-hooks/exhaustive-deps

  const totali = useMemo(() => {
    const visti = new Set(); let saldo = 0, cert = 0, n = 0;
    for (const c of vista) for (const p of c.visibili) {
      n += 1;
      if (visti.has(p.allievo_id)) continue;
      visti.add(p.allievo_id);
      if (p.da_saldare) saldo += 1;
      if (certStato(certDi(p), oggi)[0] === 'no') cert += 1;
    }
    return { n, persone: visti.size, saldo, cert };
  }, [vista]); // eslint-disable-line react-hooks/exhaustive-deps

  async function salvaNota(p, testo) {
    if ((p.note || '') === testo && !(p.iscrizione_id in note)) return;
    setNote((x) => ({ ...x, [p.iscrizione_id]: testo }));
    const { error } = await supabaseBrowser().from('iscrizioni').update({ note: testo.trim() || null }).eq('id', p.iscrizione_id);
    if (error) setErrore('Nota non salvata: riprova.');
  }
  async function salvaCert(p, data) {
    setCertificati((x) => ({ ...x, [p.allievo_id]: data || null }));
    const { error } = await supabaseBrowser().from('allievi').update({ certificato_scadenza: data || null }).eq('id', p.allievo_id);
    if (error) setErrore('Scadenza del certificato non salvata: riprova.');
  }

  function scarica() {
    const righe = [];
    for (const c of vista) {
      const orariTesto = c.orari.map((o) => `${GIORNI[o.giorno]} ${o.ora}${o.insegnante ? ` ${o.insegnante}` : ''}`).join(' · ');
      c.visibili.forEach((p, i) => righe.push([c.nome, orariTesto, i + 1, `${p.cognome} ${p.nome}`, p.chi_paga || '', p.telefono || '', p.email || '',
        c.orari.filter((o) => p.orari?.includes(o.id)).map((o) => `${GIORNI[o.giorno]} ${o.ora}`).join(', '),
        p.prova ? dataBreve(p.prova) : '', certDi(p) ? dataBreve(certDi(p)) : 'manca',
        p.tessera ? `${p.tessera.numero || ''} ${p.tessera.stato}`.trim() : '', p.abbonamento || '', p.fino_al ? dataBreve(p.fino_al) : '',
        p.da_saldare ? `da saldare ${euro(p.da_saldare)}` : p.senza_incasso ? 'incasso non trovato' : 'pagato', p.altri || '', notaDi(p)]));
      c.proveV.forEach((p) => righe.push([c.nome, orariTesto, 'prova', `${p.cognome} ${p.nome}`, '', p.telefono || '', '', '', dataBreve(p.data), '', '', '', '', '', '', p.stato]));
    }
    const csv = comeCsv(['CORSO', 'ORARI', 'N', 'COGNOME E NOME', 'CHI PAGA', 'CELL', 'MAIL', 'GIORNI', 'DATA DI PROVA', 'CERTIFICATO M. SCADENZA',
      'TESSERA', 'ABBONAMENTO', 'ABBONAMENTO SCADENZA', 'PAGAMENTO', 'ALTRI CORSI', 'NOTE'], righe);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `iscritti-per-corso-${oggi}.csv`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  return (
    <div className="ipc">
      <div className="ipc-filtri">
        <input type="search" value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca nome, telefono o nota" aria-label="Cerca" />
        <select value={corsoSel} onChange={(e) => setCorsoSel(e.target.value)} aria-label="Corso">
          <option value="">Tutti i corsi</option>
          {corsi.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.quanti ? ` (${c.quanti})` : ''}</option>)}
        </select>
        <div className="pastiglie ipc-cat">
          <button type="button" className="stato-pillola" aria-pressed={!cat} onClick={() => setCat('')}>Tutte le aree</button>
          {categorie.map((x) => <button key={x} type="button" className="stato-pillola" aria-pressed={cat === x} onClick={() => setCat(cat === x ? '' : x)}>{x}</button>)}
        </div>
        <div className="pastiglie ipc-prob">
          {PROBLEMI.map(([k, t]) => (
            <button key={k} type="button" className="stato-pillola" aria-pressed={problemi.includes(k)}
                    onClick={() => setProblemi((v) => (v.includes(k) ? v.filter((y) => y !== k) : [...v, k]))}>{t}</button>
          ))}
        </div>
        <div className="ipc-conti">
          <span><b>{totali.persone}</b> persone · <b>{totali.n}</b> iscrizioni in {vista.length} corsi</span>
          {totali.saldo > 0 && <span className="ipc-rosso">{totali.saldo} da saldare</span>}
          {totali.cert > 0 && <span className="ipc-rosso">{totali.cert} certificati scaduti o mancanti</span>}
          <label className="spunta ipc-spunta"><input type="checkbox" checked={conProve} onChange={(e) => setConProve(e.target.checked)} /><span>mostra prove e liste d&apos;attesa</span></label>
          <span className="ipc-azioni">
            <button type="button" className="btn btn-piccolo" onClick={scarica}>Scarica (Excel)</button>
            <button type="button" className="btn btn-piccolo" onClick={() => window.print()}>Stampa</button>
          </span>
        </div>
      </div>
      {errore && <div className="errore" role="alert">{errore}</div>}

      {vista.length === 0 && <div className="vuoto">Nessuno con questi filtri.</div>}
      {vista.map((c) => (
        <section key={c.id} className="ipc-corso" style={{ '--c': c.colore || 'var(--nero)' }}>
          <header className="ipc-testa">
            <div className="ipc-nome">
              <h2>{c.nome}</h2>
              <span className="piccolo muto">{[c.categoria, c.disciplina].filter(Boolean).join(' · ')}</span>
            </div>
            <div className="ipc-orari">
              {c.orari.map((o) => (
                <span key={o.id} className="ipc-orario">{GIORNI[o.giorno]} {o.ora}{o.insegnante ? <small> {o.insegnante}</small> : null}{o.gruppo ? <small> · {o.gruppo}</small> : null}</span>
              ))}
              {c.orari.length === 0 && <span className="piccolo muto">nessun orario attivo</span>}
            </div>
            <div className="ipc-quanti">
              <strong>{c.quanti}</strong>{c.capienza ? <span className="muto">/{c.capienza}</span> : null}
              <span className="ipc-link">
                <Link prefetch={false} href="/gestione/sportello" className="link-btn piccolo">Iscrivi</Link>
                <Link prefetch={false} href={`/gestione/corsi/${c.id}`} className="link-btn piccolo">Corso ›</Link>
              </span>
            </div>
          </header>

          {c.visibili.length > 0 && (
            <div className="ipc-tabella" role="table" aria-label={`Iscritti di ${c.nome}`}>
              <div className="ipc-riga ipc-intest" role="row">
                <span>#</span><span>Nome</span><span>Telefono</span><span>Giorni</span><span>Abbonamento</span><span>Certificato</span>
                <span>Tessera</span><span>Pagamento</span><span>Altri corsi</span><span>Note</span>
              </div>
              {c.visibili.map((p, i) => {
                const cs = certStato(certDi(p), oggi);
                const suoi = c.orari.filter((o) => p.orari?.includes(o.id));
                const scade = p.fino_al && giorniTra(oggi, p.fino_al) <= 14;
                return (
                  <div key={p.iscrizione_id} className={`ipc-riga${p.da_saldare || p.senza_incasso ? ' saldo' : ''}`} role="row">
                    <span className="ipc-n">{i + 1}</span>
                    <span className="ipc-chi">
                      <Link prefetch={false} href={`/gestione/sportello?persona=${p.allievo_id}`} className={p.da_saldare || p.senza_incasso ? 'nome-rosso' : undefined}>{p.cognome} {p.nome}</Link>
                      <small className="muto">{[p.eta != null && p.eta < 18 ? `${p.eta} anni` : null, p.chi_paga ? `paga ${p.chi_paga}` : null].filter(Boolean).join(' · ')}</small>
                      {p.futuro && <small className="ipc-futuro">dal {gg(p.dal)}</small>}
                    </span>
                    <span className="ipc-tel">{p.telefono ? <a href={`tel:${p.telefono}`}>{p.telefono}</a> : <span className="muto">—</span>}</span>
                    <span className="ipc-giorni">
                      {p.modalita === 'orari_fissi'
                        ? (suoi.length ? <>{suoi.map((o) => `${GIORNI[o.giorno]} ${o.ora}`).join(', ')}
                            {p.volte > 0 && (p.orari?.length || 0) > p.volte && <b className="ipc-rosso"> · {p.orari.length} giorni su {p.volte}</b>}</>
                          : <b className="ipc-rosso">senza giorni</b>)
                        : <span className="muto">{p.modalita === 'ingressi' ? `a ingressi${p.ingressi != null ? ` (${p.ingressi})` : ''}` : 'libero'}</span>}
                      {p.modalita === 'orari_fissi' && c.orari.length > 0 && (
                        <button type="button" className="link-btn piccolo" onClick={() => setGiorniAperti(giorniAperti === p.iscrizione_id ? null : p.iscrizione_id)}>giorni</button>
                      )}
                    </span>
                    <span className={`ipc-abb${scade ? ' ipc-attenzione' : ''}`}>{p.abbonamento || '—'}<small>fino al {gg(p.fino_al)}{scade ? ' · in scadenza' : ''}</small></span>
                    <span className={`ipc-cert ${cs[0]}`}>
                      <input type="date" value={certDi(p) || ''} onChange={(e) => salvaCert(p, e.target.value)} aria-label={`Scadenza certificato di ${p.nome}`} />
                      <small>{cs[1]}</small>
                    </span>
                    <span className={`ipc-tess${p.tessera?.stato === 'tesserato' ? '' : ' ipc-attenzione'}`}>
                      {p.tessera ? `${p.tessera.numero ? `n. ${p.tessera.numero}` : ''} ${p.tessera.stato === 'tesserato' ? '' : p.tessera.stato.replace('_', ' ')}`.trim() : 'da fare'}
                    </span>
                    <span className="ipc-pag">{p.da_saldare
                      ? <Link prefetch={false} href={`/gestione/sportello?persona=${p.allievo_id}`} className="ipc-rosso">da saldare {euro(p.da_saldare)}</Link>
                      : p.senza_incasso ? <span className="ipc-incasso ipc-rosso" title="L'abbonamento non ha nessun incasso registrato: pagato in APP Palestre e non abbinato, o mai pagato?">incasso non trovato</span>
                      : <span className="ipc-ok">✓ pagato</span>}</span>
                    <span className="ipc-altri">{p.altri || <span className="muto">—</span>}</span>
                    <span className="ipc-nota">
                      <input type="text" defaultValue={notaDi(p)} placeholder="nota" aria-label={`Nota per ${p.nome}`}
                             onBlur={(e) => salvaNota(p, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
                    </span>
                    {giorniAperti === p.iscrizione_id && (
                      <div className="ipc-assegna">
                        <AssegnaGiorni iscrizioneId={p.iscrizione_id} scelti={p.orari || []} quanti={p.volte}
                                       orari={c.orari.map((o) => ({ id: o.id, giorno_settimana: o.giorno, ora_inizio: o.ora, gruppo: o.gruppo }))} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {(c.proveV.length > 0 || c.atteseV.length > 0) && (
            <div className="ipc-extra">
              {c.proveV.length > 0 && (
                <div><b>In prova</b>
                  <ul>{c.proveV.map((p) => (
                    <li key={p.prova_id}>
                      <Link prefetch={false} href={`/gestione/sportello?persona=${p.allievo_id}`}>{p.cognome} {p.nome}</Link>
                      <span className="muto"> · {gg(p.data)} {ora(p.inizio)}{p.telefono ? ` · ${p.telefono}` : ''} · {p.stato === 'presente' ? 'è venuta/o' : p.stato === 'assente' ? 'non è venuta/o' : 'prenotata'}</span>
                    </li>
                  ))}</ul>
                </div>
              )}
              {c.atteseV.length > 0 && (
                <div><b>In lista d&apos;attesa</b>
                  <ul>{c.atteseV.map((p) => (
                    <li key={p.id}>
                      <Link prefetch={false} href={`/gestione/sportello?persona=${p.allievo_id}`}>{p.cognome} {p.nome}</Link>
                      <span className="muto"> · dal {dataBreve(p.dal)}{p.telefono ? ` · ${p.telefono}` : ''}{p.note ? ` · ${p.note}` : ''}</span>
                    </li>
                  ))}</ul>
                </div>
              )}
            </div>
          )}
          {c.visibili.length === 0 && c.proveV.length === 0 && c.atteseV.length === 0 && <p className="piccolo muto ipc-vuoto">Nessun iscritto.</p>}
        </section>
      ))}
    </div>
  );
}
