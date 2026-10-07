'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { dataBreve, euro } from '@/lib/formato';
import AssegnaGiorni from '../../AssegnaGiorni';
import AzioniIscrizione from './AzioniIscrizione';
import CampoCerca from '../../CampoCerca';

const GIORNI = ['', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
// mese solare: scade a fine mese (non a ingressi né a giorni)
const aMese = (t) => !!t && t.scadenza_fine_mese !== false && t.modalita !== 'ingressi' && (!t.durata_giorni || t.durata_giorni >= 28);
const fineMese = (d) => { const [y, m] = d.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
// la stagione finisce con il mese di chiusura (luglio): tutto scade lì, niente passa alla stagione dopo
const fineStagione = (d, meseFine) => { const [y, m] = d.split('-').map(Number); const anno = m > meseFine ? y + 1 : y; return new Date(Date.UTC(anno, meseFine, 0)).toISOString().slice(0, 10); };
const centDa = (s) => Math.round(parseFloat(String(s || '').replace(',', '.')) * 100);
const ERRORI = {
  orario_non_attivo: 'Uno dei giorni scelti è stato sospeso: scegli un altro giorno.',
  iscrizione_gia_attiva: 'Questa persona è già iscritta a questo corso nel periodo indicato.',
  orario_non_del_corso: "Uno degli orari scelti non appartiene al corso.",
  allievo_non_trovato: 'Persona non trovata.',
};

export default function Iscrizioni({ allievoId, crediti = [], riepilogo = {}, iscrizioni, corsi, tipi, orari, quotaCent, sconti = {}, famigliaIscritta = 0, apriSubito = false, meseFineStagione = 7, meseInizioAnnuale = 10 }) {
  const router = useRouter();
  const [apri, setApri] = useState(apriSubito);
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const [azione, setAzione] = useState(null);   // { id, modo }
  const [tuttiTipi, setTuttiTipi] = useState(false);   // scelto un corso: solo gli abbonamenti che lo coprono
  const [f, setF] = useState({
    corso_id: '', tipo_abbonamento_id: '', data_inizio: new Date().toISOString().slice(0, 10),
    orari: [], sconto: '', importo: '', quota: false, note: '',
  });
  const [rimaste, setRimaste] = useState(null);   // { mese, rimaste } lezioni per chi parte a metà mese

  // il pulsante "Nuova iscrizione" in cima alla scheda apre direttamente il modulo
  useEffect(() => {
    const apriDaLink = () => {
      if (window.location.hash !== '#nuova-iscrizione' && !apriSubito) return;
      setApri(true);
      setTimeout(() => document.getElementById('modulo-iscrizione')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    };
    apriDaLink();
    window.addEventListener('hashchange', apriDaLink);
    return () => window.removeEventListener('hashchange', apriDaLink);
  }, []);

  // Sconto da proporre secondo le regole della scuola: più corsi della stessa persona o più persone della famiglia
  const corsiAttivi = iscrizioni.filter((i) => i.stato === 'attiva').length;
  const proposta = (() => {
    const regole = [
      [corsiAttivi >= 2 && sconti.piu_corsi_3, 'dal terzo corso'],
      [corsiAttivi === 1 && sconti.piu_corsi_2, 'secondo corso'],
      [famigliaIscritta >= 2 && sconti.famiglia_3, 'dal terzo della famiglia'],
      [famigliaIscritta === 1 && sconti.famiglia_2, 'secondo della famiglia'],
    ].filter(([pct]) => pct > 0);
    return regole.length ? { pct: regole[0][0], perche: regole[0][1] } : null;
  })();

  const orariCorso = orari.filter((o) => o.corso_id === f.corso_id);
  const tipo = tipi.find((t) => t.id === f.tipo_abbonamento_id);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  // parte a metà mese: l'importo lo decide la segreteria (proposta in base alle lezioni che restano).
  // Conta solo se nel primo mese si perdono davvero delle lezioni: chi parte il 2 del mese con la prima lezione il 3 paga il mese intero.
  const dopoIlPrimo = aMese(tipo) && /^\d{4}-\d{2}-\d{2}$/.test(f.data_inizio) && !f.data_inizio.endsWith('-01');
  useEffect(() => {
    if (!dopoIlPrimo) { setRimaste(null); return; }
    if (f.orari.length) {
      supabaseBrowser().rpc('lezioni_rimaste_mese', { p_orari: f.orari, p_dal: f.data_inizio }).then(({ data }) => setRimaste(data || null));
    } else {
      const fm = fineMese(f.data_inizio); const tot = Number(fm.slice(8, 10));
      setRimaste({ mese: tot, rimaste: tot - Number(f.data_inizio.slice(8, 10)) + 1, giorni: true });
    }
  }, [dopoIlPrimo, f.data_inizio, f.orari.join(',')]);
  const metaMese = dopoIlPrimo && !!rimaste && rimaste.mese > 0 && rimaste.rimaste < rimaste.mese;
  // abbonamento di più mesi (trimestrale…): si scala solo la parte del primo mese
  const mesiAbb = Math.max(1, tipo?.durata_mesi || 1);
  const prezzoMese = tipo ? Math.round(tipo.prezzo_cent / mesiAbb) : 0;
  const proposto = metaMese && tipo ? Math.round(((tipo.prezzo_cent - prezzoMese) + (prezzoMese * rimaste.rimaste) / rimaste.mese) / 100) * 100 : null;
  // annuale: va dall'inizio dell'anno sportivo (es. ottobre) alla fine della stagione; se parte dopo, si scala l'importo dei mesi persi
  const annuale = !!tipo && tipo.modalita !== 'ingressi' && (tipo.durata_mesi || 0) >= 9 && /^\d{4}-\d{2}-\d{2}$/.test(f.data_inizio);
  const fineStag = annuale ? fineStagione(f.data_inizio, meseFineStagione) : null;
  // mesi dell'anno sportivo (da ottobre) già passati quando parte: ognuno vale un decimo (ottobre→luglio = 10 mesi)
  const mesiAnno = ((meseFineStagione - meseInizioAnnuale + 12) % 12) + 1;
  const mesiPersi = annuale ? (() => {
    const m = Number(f.data_inizio.slice(5, 7));
    if (meseInizioAnnuale <= meseFineStagione) return m > meseInizioAnnuale && m <= meseFineStagione ? m - meseInizioAnnuale : 0;
    if (m > meseInizioAnnuale) return m - meseInizioAnnuale;            // novembre, dicembre
    if (m <= meseFineStagione) return m + 12 - meseInizioAnnuale;       // gennaio → luglio
    return 0;
  })() : 0;
  const scontoAnnuale = mesiPersi > 0 ? Math.round((tipo.prezzo_cent / mesiAnno) * mesiPersi / 100) * 100 : 0;

  function toggleOrario(id) {
    setF((s) => ({ ...s, orari: s.orari.includes(id) ? s.orari.filter((x) => x !== id) : [...s.orari, id] }));
  }

  async function crea(e) {
    e.preventDefault();
    if (!f.corso_id || !f.tipo_abbonamento_id) { setErrore('Scegli il corso e il tipo di abbonamento.'); return; }
    if (tipo?.modalita === 'orari_fissi' && f.orari.length === 0) {
      setErrore('Scegli almeno un orario: è quello che fa comparire la persona in appello.'); return;
    }
    if (metaMese && !(centDa(f.importo) >= 0)) { setErrore('Parte a metà mese: scrivi l\'importo da far pagare fino a fine mese.'); return; }
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().rpc('crea_iscrizione', {
      p_allievo: allievoId,
      p_tipo_abbonamento: f.tipo_abbonamento_id,
      p_corso: f.corso_id,
      p_data_inizio: f.data_inizio,
      p_orari: f.orari,
      p_sconto_cent: metaMese ? Math.max((tipo?.prezzo_cent || 0) - centDa(f.importo), 0) : f.sconto ? centDa(f.sconto) : 0,
      p_quota: f.quota,
      p_note: f.note || (metaMese ? 'Parte a metà mese' : null),
    });
    setInvio(false);
    if (error) {
      const k = Object.keys(ERRORI).find((x) => error.message?.includes(x));
      setErrore(ERRORI[k] || 'Iscrizione non riuscita. Riprova.');
      return;
    }
    setApri(false); setF({ ...f, corso_id: '', tipo_abbonamento_id: '', orari: [], sconto: '', importo: '', quota: false, note: '' });
    router.refresh();
  }

  function apriAzione(id, modo) {
    setAzione((a) => (a?.id === id && a.modo === modo ? null : { id, modo }));
  }

  return (
    <div>
      {errore && <div className="errore" role="alert">{errore}</div>}

      {iscrizioni.length === 0 && !apri && <div className="vuoto">Nessuna iscrizione.</div>}
      {(() => {
        const o = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
        const inCorso = iscrizioni.filter((i) => (i.stato === 'attiva' || i.stato === 'sospesa') && (!i.data_fine || i.data_fine >= o));
        const finite = iscrizioni.filter((i) => !inCorso.includes(i));
        const riga = (i) => {
          const r = riepilogo[i.id] || {};
          const modo = i.tipi_abbonamento?.modalita;
          const viva = inCorso.includes(i);
          const esaurito = modo === 'ingressi' && r.ingressi_restanti === 0;
          const statoTag = !viva && i.stato === 'attiva' ? 'scaduto' : i.stato === 'attiva' ? 'attivo' : i.stato === 'scaduta' ? 'scaduto' : i.stato === 'sospesa' ? 'sospeso' : 'annullato';
          return (
          <li key={i.id} className={`persona isc-riga${viva ? '' : ' finita'}`} style={{ alignItems: 'start' }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="isc-testa">
                {r.codice && <span className="isc-codice">{r.codice}</span>}
                <span className="persona-nome">{i.corsi?.nome}</span>
                <span className={`tag ${statoTag === 'attivo' ? 'tag-ok' : statoTag === 'sospeso' ? 'tag-attenzione' : 'tag-neutro'}`}>{statoTag}</span>
                <span className="tag tag-neutro">{modo === 'ingressi' ? 'carnet' : modo === 'libero' ? 'accesso libero' : 'giorni fissi'}</span>
                {esaurito && <span className="tag tag-attenzione">esaurito</span>}
              </div>
              <div className="piccolo muto">
                {i.tipi_abbonamento?.nome} · dal {dataBreve(i.data_inizio)} al {dataBreve(i.data_fine)}
                {i.sconto_cent > 0 && ` · sconto ${euro(i.sconto_cent)}`}
                {i.note && <span style={{ display: 'block' }}>{i.note}</span>}
              </div>
              {/* i numeri a colpo d'occhio, come "Restanti / Futuri" di APP Palestre */}
              <div className="isc-numeri">
                {modo === 'ingressi' ? <>
                  <span><b>{r.ingressi_restanti ?? i.ingressi_residui ?? '—'}</b>{r.totali ? ` di ${r.totali}` : ''} ingressi restanti</span>
                  <span><b>{r.ingressi_prenotati || 0}</b> prenotati</span>
                  <span><b>{r.fatte || 0}</b> fatti</span>
                </> : modo === 'orari_fissi' ? <>
                  {viva && <span><b>{r.da_fare ?? '—'}</b>{r.totali ? ` di ${r.totali}` : ''} lezioni da fare</span>}
                  {!viva && r.totali > 0 && <span><b>{r.totali}</b> lezioni nel periodo</span>}
                  <span><b>{r.fatte || 0}</b> fatte</span>
                  {r.disdette > 0 && <span><b>{r.disdette}</b> disdette</span>}
                </> : <span><b>{r.fatte || 0}</b> presenze</span>}
                {(r.extra_disponibili > 0 || r.extra_usate > 0) && (
                  <span className="isc-num-ok"><b>{r.extra_disponibili || 0}</b> {r.extra_disponibili === 1 ? 'lezione in più' : 'lezioni in più'} da prenotare{r.extra_usate ? ` (${r.extra_usate} usate)` : ''}</span>
                )}
                {(r.recuperi_disponibili > 0 || r.recuperi_usati > 0) && (
                  <span><b>{r.recuperi_disponibili || 0}</b> recuperi{r.recuperi_usati ? ` (${r.recuperi_usati} fatti)` : ''}</span>
                )}
                {r.prenotate > 0 && modo !== 'ingressi' && <span><b>{r.prenotate}</b> {r.prenotate === 1 ? 'prenotata' : 'prenotate'} in arrivo</span>}
              </div>
              {i.stato === 'attiva' && viva && modo === 'orari_fissi' && (
                <div style={{ marginTop: 6 }}>
                  {(i.iscrizioni_orari || []).length === 0 && <span className="tag tag-attenzione">giorni da assegnare</span>}
                  <AssegnaGiorni
                    iscrizioneId={i.id}
                    orari={orari.filter((o) => o.corso_id === i.corsi?.id)}
                    scelti={(i.iscrizioni_orari || []).map((x) => x.orario_id)}
                    quanti={i.tipi_abbonamento?.lezioni_settimanali}
                    compatto={(i.iscrizioni_orari || []).length > 0}
                  />
                </div>
              )}
              <div className="azioni-riga">
                <button className="link-btn piccolo" aria-pressed={azione?.id === i.id && azione.modo === 'dettagli'} onClick={() => apriAzione(i.id, 'dettagli')}>Dettagli</button>
                {(i.stato === 'attiva' || i.stato === 'sospesa') && viva && <>
                  <button className="link-btn piccolo" aria-pressed={azione?.id === i.id && azione.modo === 'modifica'} onClick={() => apriAzione(i.id, 'modifica')}>Modifica</button>
                  <button className="link-btn piccolo" aria-pressed={azione?.id === i.id && azione.modo === 'sospendi'} onClick={() => apriAzione(i.id, 'sospendi')}>Sospendi</button>
                  <button className="link-btn piccolo" aria-pressed={azione?.id === i.id && azione.modo === 'annulla'} onClick={() => apriAzione(i.id, 'annulla')}>Annulla</button>
                </>}
                {i.stato !== 'annullata' && modo !== 'libero' && (viva || modo === 'orari_fissi') && (
                  <button className="link-btn piccolo" aria-pressed={azione?.id === i.id && azione.modo === 'lezioni'} onClick={() => apriAzione(i.id, 'lezioni')}
                          title="Aggiunge lezioni che il cliente prenota da solo dall'app">+ Lezioni</button>
                )}
                {!viva && i.stato !== 'annullata' && (
                  <button className="link-btn piccolo" aria-pressed={azione?.id === i.id && azione.modo === 'modifica'} onClick={() => apriAzione(i.id, 'modifica')}>Modifica</button>
                )}
                <button className="link-btn piccolo pericolo" aria-pressed={azione?.id === i.id && azione.modo === 'elimina'} onClick={() => apriAzione(i.id, 'elimina')}>Elimina</button>
              </div>
              {azione?.id === i.id && azione.modo === 'dettagli' && <Dettagli i={i} r={r} />}
              {azione?.id === i.id && azione.modo !== 'dettagli' && (
                <AzioniIscrizione key={azione.modo} iscrizione={i} tipi={tipi} modo={azione.modo} chiudi={() => setAzione(null)} />
              )}
            </div>
          </li>
          );
        };
        return <>
          {inCorso.length > 0 && <ul className="elenco">{inCorso.map(riga)}</ul>}
          {finite.length > 0 && (
            <details className="isc-finite" open={inCorso.length === 0 || undefined}>
              <summary>Abbonamenti terminati <span className="muto">({finite.length})</span></summary>
              <ul className="elenco">{finite.map(riga)}</ul>
            </details>
          )}
        </>;
      })()}

      {apri ? (
        <form onSubmit={crea} style={{ marginTop: 16, scrollMarginTop: 80 }} id="modulo-iscrizione">
          <div className="campo">
            <label htmlFor="corso">Corso</label>
            <CampoCerca id="corso" valore={f.corso_id} onChange={(v) => { setTuttiTipi(false); setF({ ...f, corso_id: v, orari: [] }); }}
                        placeholder="Scrivi il corso… (es. pole 1)"
                        opzioni={corsi.map((c) => ({ value: c.id, label: c.nome }))} />
          </div>
          <div className="campo">
            <label htmlFor="tipo">Abbonamento</label>
            {(() => {
              // prima quelli che valgono per il corso scelto, poi gli altri per famiglia
              const adatti = f.corso_id ? tipi.filter((t) => t.tipi_abbonamento_corsi?.some((x) => x.corso_id === f.corso_id)) : [];
              const altri = tipi.filter((t) => !adatti.includes(t));
              const voce = (t, gruppo) => ({ value: t.id, label: t.nome, extra: euro(t.prezzo_cent), gruppo });
              const famiglie = [...new Set(altri.map((t) => t.famiglia || 'Altri'))];
              const soloAdatti = adatti.length > 0 && !tuttiTipi && !altri.some((t) => t.id === f.tipo_abbonamento_id);
              const opzioni = [
                ...adatti.map((t) => voce(t, 'Valgono per questo corso')),
                ...(soloAdatti ? [] : famiglie.flatMap((fam) => altri.filter((t) => (t.famiglia || 'Altri') === fam).map((t) => voce(t, adatti.length ? `Altri · ${fam}` : fam)))),
              ];
              return <>
                <CampoCerca id="tipo" valore={f.tipo_abbonamento_id} onChange={(v) => setF({ ...f, tipo_abbonamento_id: v })}
                            placeholder="Scrivi l'abbonamento… (es. pole 2 trim)" opzioni={opzioni} />
                {f.corso_id && adatti.length > 0 && (
                  <button type="button" className="link-btn piccolo sp-altri-tipi" onClick={() => setTuttiTipi((x) => !x)}>
                    {soloAdatti ? `${adatti.length} per questo corso · vedi anche gli altri (${altri.length})` : 'solo quelli di questo corso'}
                  </button>
                )}
              </>;
            })()}
          </div>
          {f.corso_id && tipo?.modalita === 'orari_fissi' && (
            <fieldset style={{ border: 0, padding: 0, margin: '0 0 16px' }}>
              <legend style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>Giorni e orari</legend>
              {orariCorso.length === 0 && <p className="piccolo muto">Questo corso non ha ancora orari.</p>}
              {orariCorso.map((o) => (
                <label className="spunta" key={o.id}>
                  <input type="checkbox" checked={f.orari.includes(o.id)} onChange={() => toggleOrario(o.id)} />
                  <span>{GIORNI[o.giorno_settimana]} {String(o.ora_inizio).slice(0, 5)}{o.gruppo ? <span className="muto"> · {o.gruppo}</span> : null}</span>
                </label>
              ))}
            </fieldset>
          )}
          <div className="riga-2">
            <div className="campo">
              <label htmlFor="di">Inizio</label>
              <input id="di" type="date" value={f.data_inizio} onChange={set('data_inizio')} />
              <span className="piccolo muto">
                {annuale ? `Annuale: scade il ${dataBreve(fineStag)}, fine della stagione, da qualunque mese parta.`
                  : aMese(tipo) ? 'Mese solare: scade a fine mese.' : 'La scadenza si calcola da sola dalla durata dell\'abbonamento (mai oltre la fine della stagione).'}
                {annuale && mesiPersi > 0 && (
                  <> Parte {mesiPersi} {mesiPersi === 1 ? 'mese' : 'mesi'} dopo l&apos;inizio dell&apos;anno sportivo: a listino un mese vale {euro(Math.round(tipo.prezzo_cent / mesiAnno))}.
                    <button type="button" className="link-btn" onClick={() => setF({ ...f, sconto: (scontoAnnuale / 100).toFixed(2).replace('.', ',') })}>scala {euro(scontoAnnuale)}</button>
                  </>
                )}
              </span>
            </div>
            {metaMese ? (
            <div className="campo">
              <label htmlFor="imp">{mesiAbb > 1 ? 'Importo dell\'abbonamento (€)' : `Importo fino al ${dataBreve(fineMese(f.data_inizio))} (€)`}</label>
              <input id="imp" inputMode="decimal" value={f.importo} onChange={set('importo')} placeholder={proposto != null ? (proposto / 100).toFixed(2).replace('.', ',') : ''} />
              <span className="piccolo">
                Parte a metà mese: {mesiAbb > 1
                  ? `a listino ${euro(tipo.prezzo_cent)} per ${mesiAbb} mesi, il primo mese vale ${euro(prezzoMese)}.`
                  : `a listino ${euro(tipo.prezzo_cent)} è il mese intero.`}
                {rimaste && ` Restano ${rimaste.rimaste} ${rimaste.giorni ? 'giorni' : 'lezioni'} su ${rimaste.mese} del primo mese.`}
                {rimaste && rimaste.rimaste === 0 && ' Questo mese non ci sono più lezioni: falla partire dal 1° del mese prossimo.'}
                {proposto != null && (
                  <> <button type="button" className="link-btn" onClick={() => setF({ ...f, importo: (proposto / 100).toFixed(2).replace('.', ',') })}>
                    usa {euro(proposto)}
                  </button></>
                )}
              </span>
            </div>
            ) : (
            <div className="campo">
              <label htmlFor="sc">Sconto (€)</label>
              <input id="sc" inputMode="decimal" value={f.sconto} onChange={set('sconto')} />
              {proposta && tipo && (
                <span className="piccolo">
                  Proposto {proposta.pct}% ({proposta.perche}):{' '}
                  <button type="button" className="link-btn"
                          onClick={() => setF({ ...f, sconto: ((tipo.prezzo_cent * proposta.pct) / 10000).toFixed(2).replace('.', ',') })}>
                    applica {((tipo.prezzo_cent * proposta.pct) / 10000).toFixed(2).replace('.', ',')} €
                  </button>
                </span>
              )}
            </div>
            )}
          </div>
          <label className="spunta">
            <input type="checkbox" checked={f.quota} onChange={set('quota')} />
            <span>Incassa anche la quota annuale{quotaCent > 0 && ` (${euro(quotaCent)})`}</span>
          </label>
          <div className="campo"><label htmlFor="nt">Note</label><input id="nt" value={f.note} onChange={set('note')} /></div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primario" disabled={invio}>{invio ? 'Iscrivo…' : 'Crea iscrizione'}</button>
            <button type="button" className="btn" onClick={() => setApri(false)}>Annulla</button>
          </div>
        </form>
      ) : (
        <button className="btn btn-piccolo" style={{ marginTop: 10 }} onClick={() => setApri(true)}>+ Nuova iscrizione</button>
      )}
    </div>
  );
}

// Il dettaglio di un abbonamento (come "Modifica abbonamento" di APP Palestre): prezzo, validità, corsi compresi, numeri
function Dettagli({ i, r }) {
  const listino = r.prezzo_cent ?? i.tipi_abbonamento?.prezzo_cent ?? 0;
  const sconto = r.sconto_cent || 0;
  const durata = r.durata_giorni ? `${r.durata_giorni} giorni` : r.durata_mesi ? `${r.durata_mesi} ${r.durata_mesi === 1 ? 'mese' : 'mesi'}` : '—';
  const modo = r.modalita || i.tipi_abbonamento?.modalita;
  const voci = [
    ['Prezzo', sconto > 0 ? `${euro(listino - sconto)} (listino ${euro(listino)}, sconto ${euro(sconto)})` : euro(listino)],
    ['Validità', `${durata} · dal ${dataBreve(i.data_inizio)} al ${dataBreve(i.data_fine)}`],
    modo === 'orari_fissi' && ['Lezioni a settimana', r.lezioni_settimanali || '—'],
    modo === 'orari_fissi' && ['Lezioni nel periodo', r.totali != null ? `${r.totali} (fatte ${r.fatte || 0}, da fare ${r.da_fare || 0}${r.disdette ? `, disdette ${r.disdette}` : ''}${r.assenze ? `, assente ${r.assenze}` : ''})` : '—'],
    modo === 'ingressi' && ['Ingressi', `totali ${r.totali ?? '—'} · restanti ${r.ingressi_restanti ?? i.ingressi_residui ?? '—'} · prenotati ${r.ingressi_prenotati || 0} · fatti ${r.fatte || 0}`],
    ['Lezioni in più', `${r.extra_disponibili || 0} da prenotare · ${r.extra_usate || 0} usate`],
    ['Recuperi', `${r.recuperi_disponibili || 0} da usare · ${r.recuperi_usati || 0} fatti${r.recuperi_max != null ? ` · massimo ${r.recuperi_max}` : ''}`],
    (r.sospensioni || []).length > 0 && ['Sospensioni', r.sospensioni.map((x) => `${dataBreve(x.dal)}–${dataBreve(x.al)}${x.motivo ? ` (${x.motivo})` : ''}`).join(' · ')],
  ].filter(Boolean);
  return (
    <div className="azione-iscrizione isc-dettagli">
      <strong className="ai-titolo">{i.tipi_abbonamento?.nome}{r.codice ? <span className="isc-codice">{r.codice}</span> : null}</strong>
      <dl className="isc-dl">
        {voci.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
      <div className="isc-corsi-testa">Corsi compresi {(r.corsi || []).length > 0 && <span className="muto">({r.corsi.length})</span>}</div>
      {(r.corsi || []).length > 0
        ? <div className="isc-corsi">{r.corsi.map((c) => <span key={c} className="tag tag-neutro">{c}</span>)}</div>
        : <p className="piccolo muto">Nessun corso abbinato (Abbonamenti → Corsi coperti).</p>}
    </div>
  );
}
