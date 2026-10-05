'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { dataBreve, euro } from '@/lib/formato';

const GIORNI = ['', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const oggi = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
const durata = (t) => {
  if (t.modalita === 'ingressi') return t.num_ingressi ? `${t.num_ingressi} ingressi` : 'a ingressi';
  if (t.durata_giorni === 1) return '1 lezione';
  if (t.durata_giorni && t.durata_giorni < 28) return `${t.durata_giorni} giorni`;
  const m = t.durata_mesi || Math.max(1, Math.round((t.durata_giorni || 30) / 30));
  return m === 1 ? '1 mese' : m >= 9 ? `${m} mesi (annuale)` : `${m} mesi`;
};
// mese solare: scade a fine mese (non a ingressi né a giorni): dall'app si parte il 1° del mese
const aMese = (t) => !!t && t.scadenza_fine_mese !== false && t.modalita !== 'ingressi' && (!t.durata_giorni || t.durata_giorni >= 28);
const primiDelMese = () => {
  const o = oggi(); const [y, m] = o.split('-').map(Number); const out = [];
  if (o.endsWith('-01')) out.push(o);
  for (let k = 1; out.length < 3; k++) { const d = new Date(Date.UTC(y, m - 1 + k, 1)); out.push(d.toISOString().slice(0, 10)); }
  return out;
};
const nomeMese = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('it-IT', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const giornoDopo = (d) => { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate() + 1); return x.toISOString().slice(0, 10); };
const ERRORI = {
  richiesta_gia_inviata: 'L\'hai già chiesto: la segreteria lo attiva appena arriva il bonifico.',
  scegli_i_giorni: 'Scegli i giorni in cui verrai.',
  abbonamento_non_disponibile: 'Questo abbonamento non è più disponibile.',
  corso_non_aperto: 'Le iscrizioni a questo corso non sono aperte.',
  orario_non_attivo: 'Uno dei giorni scelti non c\'è più: aggiorna la pagina e scegline un altro.',
  orario_pieno: 'Uno dei giorni scelti è al completo: scegline un altro o chiedi alla segreteria la lista d\'attesa.',
  troppi_giorni: 'Hai scelto più giorni di quelli compresi nell\'abbonamento.',
  eta_non_adatta: 'Questo corso è per un\'altra età: chiedi alla segreteria quello giusto.',
  inizio_meta_mese: 'Gli abbonamenti vanno a mese solare: dall\'app si parte il 1° del mese. Per iniziare adesso passa dalla segreteria.',
  annuale_in_segreteria: 'L\'annuale va da ottobre a luglio: iniziandolo a stagione avviata la segreteria ti scala i mesi già passati. Passa in segreteria per farlo.',
};

export default function Acquista({ allievi, tipi, corsi, orari, coperti, gruppi, corsoIniziale, quotaCent, carta, rinnovo, bonifico, annullato, pieni = [], attivi = [] }) {
  const [chi, setChi] = useState(allievi[0]?.id || '');
  const [cerca, setCerca] = useState('');
  const [gruppo, setGruppo] = useState('');
  const [corsoFiltro, setCorsoFiltro] = useState(corsoIniziale);
  const [scelto, setScelto] = useState(null);
  const [f, setF] = useState({ corso: corsoIniziale, orari: [], inizio: oggi(), ricorrente: false });
  const [fine, setFine] = useState(null);
  const [descrizione, setDescrizione] = useState(false);
  const [tuttiCorsi, setTuttiCorsi] = useState(false);
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState(annullato ? 'Pagamento non completato: non ti abbiamo addebitato nulla.' : '');
  const [inCoda, setInCoda] = useState([]);   // giorni pieni per cui si è messo in coda
  async function inCodaPer(o) {
    const { error } = await supabaseBrowser().rpc('mettimi_in_coda_orario', { p_allievo: chi, p_orario: o.id });
    if (error) { setErrore('Non riuscito. Riprova.'); return; }
    setInCoda([...inCoda, o.id]);
  }
  const [richiesta, setRichiesta] = useState(null);       // esito del bonifico
  const persona = allievi.find((a) => a.id === chi);

  const corsiDi = useMemo(() => {
    const m = {};
    tipi.forEach((t) => {
      const ids = coperti.filter((c) => c.tipo_abbonamento_id === t.id).map((c) => c.corso_id);
      m[t.id] = ids.length ? corsi.filter((c) => ids.includes(c.id)) : corsi;
    });
    return m;
  }, [tipi, coperti, corsi]);

  const testo = cerca.trim().toLowerCase();
  const visibili = tipi.filter((t) =>
    (!gruppo || t.gruppo_id === gruppo) &&
    (!corsoFiltro || corsiDi[t.id].some((c) => c.id === corsoFiltro)) &&
    (!testo || t.nome.toLowerCase().includes(testo)))
    .sort((a, b) => (a.prezzo_web_cent || a.prezzo_cent || 0) - (b.prezzo_web_cent || b.prezzo_cent || 0));
  const tipo = tipi.find((t) => t.id === scelto);
  const prezzo = tipo ? (tipo.prezzo_web_cent || tipo.prezzo_cent || 0) : 0;
  const quota = persona?.quota ? quotaCent : 0;
  const orariCorso = orari.filter((o) => o.corso_id === f.corso && o.prenotabile !== false)
    .sort((a, b) => a.giorno_settimana - b.giorno_settimana || String(a.ora_inizio).localeCompare(String(b.ora_inizio)));
  const max = tipo?.lezioni_settimanali || 7;
  const nomeCorso = (id) => corsi.find((c) => c.id === id)?.nome || '';

  // ha già un abbonamento a questo corso: il nuovo parte il giorno dopo la fine di quello (come fa il database)
  const inCorso = attivi.filter((a) => a.allievo_id === chi && a.corso_id === f.corso && a.data_fine >= f.inizio)
    .sort((a, b) => b.data_fine.localeCompare(a.data_fine))[0];
  const inizioVero = inCorso ? giornoDopo(inCorso.data_fine) : f.inizio;
  const metaMese = aMese(tipo) && !inizioVero.endsWith('-01');   // dall'app no: l'importo lo fa la segreteria

  // data di fine calcolata dal database (mese solare, giorni…), così è quella vera
  useEffect(() => {
    if (!tipo || !inizioVero) { setFine(null); return; }
    supabaseBrowser().rpc('scadenza_abbonamento', { p_tipo: tipo.id, p_inizio: inizioVero }).then(({ data }) => setFine(data || null));
  }, [tipo, inizioVero]);

  function scegli(t) {
    if (scelto === t.id) { setScelto(null); return; }
    const lista = corsiDi[t.id];
    setScelto(t.id); setDescrizione(false); setTuttiCorsi(false); setErrore(''); setRichiesta(null);
    const aperti = lista.filter((c) => (c.iscrizioni_app || 'aperte') === 'aperte');
    setF({ corso: corsoFiltro && aperti.some((c) => c.id === corsoFiltro) ? corsoFiltro : aperti.length === 1 ? aperti[0].id : '', orari: [], inizio: aMese(t) ? primiDelMese()[0] : oggi(), ricorrente: false });
  }
  function alterna(id) {
    setF((v) => ({ ...v, orari: v.orari.includes(id) ? v.orari.filter((x) => x !== id) : v.orari.length >= max ? v.orari : [...v.orari, id] }));
  }
  function controlla() {
    if (!f.corso) { setErrore('Scegli il corso.'); return false; }
    if (tipo.modalita === 'orari_fissi' && f.orari.length === 0) { setErrore('Scegli i giorni in cui verrai.'); return false; }
    if (metaMese) { setErrore(ERRORI.inizio_meta_mese); return false; }
    setErrore(''); return true;
  }

  async function conCarta() {
    if (!controlla()) return;
    setInvio(true);
    const r = await fetch('/api/stripe/acquisto', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allievo_id: chi, tipo_abbonamento_id: tipo.id, corso_id: f.corso, orari: f.orari, data_inizio: f.inizio, ricorrente: f.ricorrente }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.url) { setInvio(false); setErrore(d.errore || 'Non riusciamo ad aprire il pagamento. Riprova.'); return; }
    window.location.href = d.url;
  }
  async function conBonifico() {
    if (!controlla()) return;
    setInvio(true);
    const { data, error } = await supabaseBrowser().rpc('richiedi_abbonamento', {
      p_allievo: chi, p_tipo: tipo.id, p_corso: f.corso, p_orari: f.orari, p_data_inizio: f.inizio });
    setInvio(false);
    if (error) { const k = Object.keys(ERRORI).find((x) => error.message?.includes(x)); setErrore(ERRORI[k] || 'Richiesta non inviata. Riprova.'); return; }
    setRichiesta(data);
  }
  const copia = (t) => { try { navigator.clipboard.writeText(t); } catch { /* niente */ } };

  if (tipi.length === 0) return <div className="area-casa"><h1>Acquista</h1><div className="vuoto">Al momento non ci sono abbonamenti acquistabili dall'app: scrivi alla segreteria.</div></div>;

  return (
    <div className="area-casa area-acquista">
      <div className="ac-testa"><h1>Acquista</h1>
        <p className="ac-nota" style={{ margin: '2px 0 0' }}>Scegli l'abbonamento: corso, giorni e data di inizio. Le lezioni ti compaiono da sole.</p>
      </div>
      {errore && <div className="errore" role="alert">{errore}</div>}

      {allievi.length > 1 && (
        <div className="ac-giorni" role="group" aria-label="Per chi">
          {allievi.map((a) => <button key={a.id} type="button" aria-pressed={chi === a.id} onClick={() => { setChi(a.id); setRichiesta(null); }}>Per {a.nome}</button>)}
        </div>
      )}

      <div className="aq-filtri">
        <input type="search" placeholder="Cerca abbonamento" value={cerca} onChange={(e) => setCerca(e.target.value)} aria-label="Cerca" />
        {corsoFiltro && <button type="button" className="aq-corso-filtro" onClick={() => setCorsoFiltro('')}>Per {nomeCorso(corsoFiltro)} ✕</button>}
      </div>
      {gruppi.length > 1 && (
        <div className="ac-giorni" role="group" aria-label="Gruppo">
          <button type="button" aria-pressed={!gruppo} onClick={() => setGruppo('')}>Tutti</button>
          {gruppi.map((g) => <button key={g.id} type="button" aria-pressed={gruppo === g.id} onClick={() => setGruppo(g.id)}>{g.nome}</button>)}
        </div>
      )}

      {visibili.length === 0 && <div className="vuoto">Nessun abbonamento con questi filtri.</div>}
      <ul className="aq-elenco">
        {visibili.map((t) => {
          const aperto = scelto === t.id;
          const lista = corsiDi[t.id];
          return (
            <li key={t.id} className={aperto ? 'aperto' : ''}>
              <button type="button" className="aq-voce" onClick={() => scegli(t)} aria-expanded={aperto}>
                <span className="aq-nome"><strong>{t.nome}</strong><span>{[durata(t), t.lezioni_settimanali && `${t.lezioni_settimanali} volt${t.lezioni_settimanali === 1 ? 'a' : 'e'} a settimana`].filter(Boolean).join(' · ')}</span></span>
                <span className="aq-prezzo">{euro(t.prezzo_web_cent || t.prezzo_cent)}</span>
              </button>

              {aperto && (
                <div className="aq-dettaglio">
                  {t.descrizione && (
                    <p className={`aq-descr${descrizione ? ' tutta' : ''}`} onClick={() => setDescrizione(!descrizione)}>{t.descrizione}</p>
                  )}

                  <span className="aq-etichetta">Il corso</span>
                  <div className="aq-chips">
                    {(tuttiCorsi ? lista : lista.slice(0, 12)).map((c) => (
                      <button key={c.id} type="button" aria-pressed={f.corso === c.id} disabled={c.iscrizioni_app && c.iscrizioni_app !== 'aperte'}
                              title={c.nota_iscrizioni || undefined} onClick={() => setF({ ...f, corso: c.id, orari: [] })}>
                        <span className="punto-colore" style={{ background: c.colore }} />{c.nome}
                        {c.iscrizioni_app === 'attesa' && <small> · in partenza</small>}
                        {c.iscrizioni_app === 'chiuse' && <small> · chiuso</small>}
                      </button>
                    ))}
                    {!tuttiCorsi && lista.length > 12 && <button type="button" onClick={() => setTuttiCorsi(true)}>+{lista.length - 12}</button>}
                  </div>

                  {t.modalita === 'orari_fissi' && f.corso && (
                    <>
                      <span className="aq-etichetta">I giorni{max < 7 ? ` (fino a ${max})` : ''}</span>
                      {orariCorso.length === 0 ? <p className="ac-nota">Nessun orario prenotabile per questo corso: scrivi alla segreteria.</p> : (
                        <div className="aq-chips">
                          {orariCorso.map((o) => (
                            <button key={o.id} type="button" aria-pressed={f.orari.includes(o.id)}
                                    disabled={pieni.includes(o.id) && !f.orari.includes(o.id)} onClick={() => alterna(o.id)}>
                              {GIORNI[o.giorno_settimana]} {String(o.ora_inizio).slice(0, 5)}{pieni.includes(o.id) && <small> · completo</small>}
                            </button>
                          ))}
                        </div>
                      )}
                      {orariCorso.some((o) => pieni.includes(o.id)) && (
                        <p className="ac-nota aq-coda">Il giorno che vuoi è al completo?{' '}
                          {orariCorso.filter((o) => pieni.includes(o.id)).map((o) => (
                            inCoda.includes(o.id)
                              ? <span key={o.id} className="tag tag-attenzione">in coda per {GIORNI[o.giorno_settimana]} {String(o.ora_inizio).slice(0, 5)}</span>
                              : <button key={o.id} type="button" className="link-btn" disabled={invio} onClick={() => inCodaPer(o)}>Mettimi in coda per {GIORNI[o.giorno_settimana]} {String(o.ora_inizio).slice(0, 5)}</button>
                          ))}
                        </p>
                      )}
                    </>
                  )}

                  {aMese(t) ? (
                    <label className="aq-inizio"><span className="aq-etichetta">Da</span>
                      <select value={f.inizio} onChange={(e) => setF({ ...f, inizio: e.target.value })}>
                        {primiDelMese().map((d) => <option key={d} value={d}>{nomeMese(d)}</option>)}
                      </select>
                      {fine && !inCorso && <span className="ac-nota">dal {dataBreve(inizioVero)} al {dataBreve(fine)}{f.ricorrente ? ', poi si rinnova il 1° di ogni mese' : ''}</span>}
                    </label>
                  ) : !aMese(t) ? (
                    <label className="aq-inizio"><span className="aq-etichetta">Inizia il</span>
                      <input type="date" value={f.inizio} min={oggi()} onChange={(e) => setF({ ...f, inizio: e.target.value })} />
                      {fine && <span className="ac-nota">{inCorso ? `dal ${dataBreve(inizioVero)} ` : ''}valido fino al {dataBreve(fine)}</span>}
                    </label>
                  ) : null}
                  {aMese(t) && !inCorso && !oggi().endsWith('-01') && (
                    <p className="ac-nota">Gli abbonamenti vanno a mese solare, dal 1° a fine mese. Vuoi iniziare subito? Passa dalla segreteria: ti fa l'importo per i giorni che restano.</p>
                  )}
                  {inCorso && !metaMese && (
                    <p className="ac-nota aq-avviso">Hai già un abbonamento a questo corso fino al {dataBreve(inCorso.data_fine)}: il nuovo va dal {dataBreve(inizioVero)}{fine ? ` al ${dataBreve(fine)}` : ''}{f.ricorrente ? ', poi si rinnova il 1° di ogni mese' : ''}. Per aggiungere un giorno da subito chiedi alla segreteria.</p>
                  )}
                  {metaMese && inCorso && (
                    <p className="ac-nota aq-avviso">Il tuo abbonamento a questo corso finisce il {dataBreve(inCorso.data_fine)}, a metà mese: per i giorni che restano passa dalla segreteria, che ti fa l'importo, oppure scegli il mese dopo.</p>
                  )}

                  <div className="aq-totale">
                    <span><span>{t.nome}</span><span>{euro(prezzo)}</span></span>
                    {quota > 0 && <span><span>Quota annuale con assicurazione</span><span>{euro(quota)}</span></span>}
                    <span className="aq-somma"><strong>Totale</strong><strong>{euro(prezzo + quota)}</strong></span>
                  </div>

                  {richiesta ? (
                    <div className="aq-bonifico">
                      <strong>Richiesta inviata ✓ Ora fai il bonifico:</strong>
                      {bonifico?.iban ? (
                        <>
                          <span className="aq-riga">Importo <b>{euro(richiesta.importo_cent)}</b></span>
                          {bonifico.intestatario && <span className="aq-riga">Intestato a <b>{bonifico.intestatario}</b></span>}
                          <span className="aq-riga">IBAN <b>{bonifico.iban}</b><button type="button" className="link-btn piccolo" onClick={() => copia(bonifico.iban.replace(/\s/g, ''))}>copia</button></span>
                          {bonifico.banca && <span className="aq-riga">Banca <b>{bonifico.banca}</b></span>}
                          <span className="aq-riga">Causale <b>{richiesta.causale}</b><button type="button" className="link-btn piccolo" onClick={() => copia(richiesta.causale)}>copia</button></span>
                        </>
                      ) : <span>La segreteria ti manda i dati per il bonifico.</span>}
                      <span className="ac-nota">Appena arriva, la segreteria attiva l'abbonamento e ti arriva la notifica. La richiesta la trovi in Io.</span>
                    </div>
                  ) : (
                    <div className="aq-paga">
                      {carta && (
                        <>
                          {rinnovo && t.rinnovo_automatico && (
                            <label className="spunta"><input type="checkbox" checked={f.ricorrente} onChange={(e) => setF({ ...f, ricorrente: e.target.checked })} />
                              <span>Rinnovo automatico con la stessa carta: il 1° di ogni mese paghi il mese nuovo (lo disdici quando vuoi)</span></label>
                          )}
                          <button className="btn btn-primario" disabled={invio || metaMese} onClick={conCarta}>{invio ? 'Un attimo…' : `Paga ${euro(prezzo + quota)} con carta`}</button>
                        </>
                      )}
                      <button className={`btn ${carta ? '' : 'btn-primario'}`} disabled={invio || metaMese} onClick={conBonifico}>{invio ? 'Un attimo…' : 'Paga con bonifico'}</button>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
