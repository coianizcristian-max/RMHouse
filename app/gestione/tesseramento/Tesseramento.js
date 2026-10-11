'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { scaricaCsv } from '@/lib/stati';
import { dataBreve, oggiISO } from '@/lib/formato';
import { TIPI_ASI, QUALIFICHE_ASI, impostazioniEnte, valoriPersona, fileEnte, scaricaFileEnte, mancaNelFile } from '@/lib/tessereEnte';
import { parteCognome, parteNome, normalizzaCF } from '@/lib/codiceFiscale';
import ImpostazioniEnte from './ImpostazioniEnte';
import PreferitoAsi from './PreferitoAsi';
import ImportaScadenze from './ImportaScadenze';
import { useDaSistemare, motivoPagamento } from '@/lib/daSistemare';
import { testoPerAsi } from '@/lib/asiCompila';

// il codice fiscale dice che nome e cognome sono scritti al contrario (es. cognome "Alisa", nome "Burlea", CF BRLLSA…):
// sul portale dell'ente la persona verrebbe caricata sbagliata
export function invertiti(r) {
  const cf = normalizzaCF(r.codice_fiscale);
  if (cf.length !== 16 || !r.nome || !r.cognome) return false;
  const giusto = parteCognome(r.cognome) === cf.slice(0, 3) && parteNome(r.nome) === cf.slice(3, 6);
  return !giusto && parteCognome(r.nome) === cf.slice(0, 3) && parteNome(r.cognome) === cf.slice(3, 6);
}

const STATI = { da_inviare: ['da mandare all\'ente', 'tag-attenzione'], inviato: ['mandato, attende il numero', 'tag-neutro'], tesserato: ['tessera fatta', 'tag-ok'] };
const FILTRI = [['tutti', 'Tutti'], ['senza', 'Senza tessera', 'non ce l\'hanno o è scaduta'], ['scadenza', 'In scadenza', 'scade entro 30 giorni'],
  ['da_inviare', 'Da mandare'], ['inviato', 'Mandati'], ['tesserato', 'Tesserati'], ['dati', 'Dati mancanti']];
const DA = { persona: 'scelto per lei', tessera: 'come la tessera fatta', disciplina: 'dalla disciplina del corso', precedente: 'come l\'ultima tessera',
  corso: 'dal corso', predefinito: 'predefinito' };
// giorni da oggi a una data (negativi = passata)
const giorniA = (iso, oggi) => Math.round((Date.parse(iso) - Date.parse(oggi)) / 86400000);

export default function Tesseramento({ palestra, stagione, corrente, righe, discipline = [], conEnte = true, girati = [] }) {
  const router = useRouter();
  const ente = useMemo(() => impostazioniEnte(palestra.ente || {}), [palestra.ente]);
  const [apriEnte, setApriEnte] = useState(!palestra.ente?.nome);
  const [filtro, setFiltro] = useState('tutti');
  const [cerca, setCerca] = useState('');
  const [scelti, setScelti] = useState([]);
  const [aperta, setAperta] = useState(null);      // persona con i valori per l'ente aperti
  const [copiato, setCopiato] = useState(null);
  const [errore, setErrore] = useState('');
  const [avviso, setAvviso] = useState('');
  const [invio, setInvio] = useState(false);
  const [vediGirati, setVediGirati] = useState(false);
  const debiti = useDaSistemare();   // chi non ha pagato: nome in rosso
  // "Come funziona": aperto finché non lo chiudi (si ricorda su questo computer)
  const [come, setCome] = useState(true);
  useEffect(() => { try { if (localStorage.getItem('rm-ts-come') === '0') setCome(false); } catch { /* niente */ } }, []);
  const nomeEnte = ente.nome || 'ente';
  const oggi = oggiISO();
  const manca = mancaNelFile(palestra.ente || {});
  // tessera fatta ma scade entro 30 giorni: da rifare
  const inScadenza = (r) => r.stato === 'tesserato' && r.scadenza && giorniA(r.scadenza, oggi) <= 30;

  const mancano = (r) => [...(Array.isArray(r.mancano) ? r.mancano : []), ...(invertiti(r) ? ['nome e cognome invertiti?'] : [])];
  const testo = cerca.trim().toLowerCase();
  const passa = (r, k) => (k === 'tutti' ? true : k === 'senza' ? !r.stato : k === 'scadenza' ? inScadenza(r) : k === 'dati' ? mancano(r).length > 0 : r.stato === k);
  const visibili = useMemo(() => righe.filter((r) => passa(r, filtro) &&
    (!testo || `${r.cognome} ${r.nome} ${r.corsi || ''} ${r.numero || ''} ${r.codice_fiscale || ''}`.toLowerCase().includes(testo))), [righe, filtro, testo]); // eslint-disable-line react-hooks/exhaustive-deps
  const conta = (k) => righe.filter((r) => passa(r, k)).length;
  const spunta = (id) => setScelti((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  const tutti = visibili.length > 0 && visibili.every((r) => scelti.includes(r.allievo_id));
  const sceltiRighe = righe.filter((r) => scelti.includes(r.allievo_id));

  async function segna(stato) {
    let numeroDa = null;
    if (stato === 'tesserato') {
      const n = prompt('Numero della prima tessera (le altre seguono in ordine alfabetico). Lascia vuoto se i numeri li scrivi a mano.');
      if (n === null) return;
      if (n.trim()) { numeroDa = parseInt(n.replace(/\D/g, ''), 10); if (!Number.isFinite(numeroDa)) { setErrore('Numero non valido.'); return; } }
    }
    setInvio(true); setErrore(''); setAvviso('');
    const { error } = await supabaseBrowser().rpc('aggiorna_tesseramenti', {
      p_palestra: palestra.id, p_stagione: stagione, p_allievi: sceltiRighe.map((r) => r.allievo_id), p_stato: stato, p_numero_da: numeroDa,
    });
    setInvio(false);
    if (error) { setErrore('Operazione non riuscita.'); return; }
    setAvviso(`${sceltiRighe.length} ${stato === 'tesserato' ? 'segnati come tesserati' : stato === 'inviato' ? 'segnati come mandati' : 'aggiornati'} ✓`);
    setScelti([]); router.refresh();
  }

  async function numero(r) {
    const n = prompt(`Numero di tessera di ${r.nome} ${r.cognome} (es. A 1234567; con la scadenza: A 1234567 08/10/2027)`, r.numero ? `${r.tipo_tessera || r.tipo_precedente || ''} ${r.numero}`.trim() : '');
    if (n === null) return;
    setErrore('');
    const { error } = await supabaseBrowser().rpc('scrivi_numero_tessera', { p_palestra: palestra.id, p_stagione: stagione, p_allievo: r.allievo_id, p_testo: n });
    if (error) {
      // senza la query 157: come prima
      const db = supabaseBrowser();
      await db.rpc('aggiorna_tesseramenti', { p_palestra: palestra.id, p_stagione: stagione, p_allievi: [r.allievo_id], p_stato: n.trim() ? 'tesserato' : (r.stato || 'da_inviare'), p_numero_da: null });
      if (n.trim()) {
        await db.from('tesseramenti').update({ numero: n.trim() }).eq('allievo_id', r.allievo_id).eq('stagione', stagione);
        await db.from('allievi').update({ tessera: n.trim() }).eq('id', r.allievo_id);
      }
    }
    router.refresh();
  }

  async function scambia(r) {
    if (!confirm(`Il codice fiscale dice che il cognome è "${r.nome}" e il nome "${r.cognome}". Scambiarli nella scheda?`)) return;
    const { error } = await supabaseBrowser().from('allievi').update({ nome: r.cognome, cognome: r.nome }).eq('id', r.allievo_id);
    if (error) { setErrore('Non riuscito.'); return; }
    setAvviso(`Ora è ${r.nome} ${r.cognome} (cognome e nome) ✓`); router.refresh();
  }

  async function scambiaTutti() {
    if (!confirm(`Scambiare nome e cognome di ${girati.length} persone? Lo dice il loro codice fiscale (es. ${girati[0].cognome} ${girati[0].nome} → ${girati[0].nome} ${girati[0].cognome}).`)) return;
    setInvio(true); setErrore('');
    const { data, error } = await supabaseBrowser().rpc('scambia_nome_cognome', { p_palestra: palestra.id, p_allievi: girati.map((x) => x.id) });
    setInvio(false);
    if (error) { setErrore('Non riuscito.'); return; }
    setAvviso(`${data} schede sistemate: nome e cognome ora sono giusti ✓`); setVediGirati(false); router.refresh();
  }

  function fileEnteScelti() {
    if (manca.length) {
      setErrore(`Manca il ${manca.join(', ')}: senza, il portale scarta il file. Scrivilo nelle Impostazioni ${nomeEnte} (qui sotto), salva e riprova.`);
      setApriEnte(true); return;
    }
    // chi ha già la tessera valida (e non in scadenza) non va rimandato
    const valide = sceltiRighe.filter((r) => r.stato === 'tesserato' && !inScadenza(r));
    const daMandare = sceltiRighe.filter((r) => !valide.includes(r));
    if (!daMandare.length) { setErrore('Le persone scelte hanno già la tessera valida: niente da mandare.'); return; }
    const girati = daMandare.filter(invertiti);
    if (girati.length && !confirm(`${girati.length === 1 ? 'Una persona ha' : `${girati.length} persone hanno`} nome e cognome invertiti secondo il codice fiscale (${girati.slice(0, 4).map((r) => `${r.cognome} ${r.nome}`).join(', ')}${girati.length > 4 ? '…' : ''}). Nel file li metto giusti, ma sistemali anche nella scheda ("scambia" nella colonna Dati). Continuare?`)) return;
    const senzaCf = daMandare.filter((r) => !r.codice_fiscale);
    if (senzaCf.length && !confirm(`${senzaCf.length} ${senzaCf.length === 1 ? 'persona non ha' : 'persone non hanno'} il codice fiscale (${senzaCf.slice(0, 4).map((r) => `${r.cognome} ${r.nome}`).join(', ')}${senzaCf.length > 4 ? '…' : ''}): il portale le scarterà. Scaricare lo stesso?`)) return;
    // senza la disciplina per l'ente la colonna DISCIPLINA resta vuota
    const senzaDisc = ente.colonne.some((c) => c.campo === 'disciplina') ? daMandare.filter((r) => !valoriPersona(r, ente).disciplina) : [];
    if (senzaDisc.length) {
      const corsi = [...new Set(senzaDisc.map((r) => (r.corsi || '').split(', ')[0]).filter(Boolean))].slice(0, 4).join(', ');
      if (!confirm(`${senzaDisc.length === 1 ? 'Una persona non ha' : `${senzaDisc.length} persone non hanno`} la disciplina per ${nomeEnte}${corsi ? ` (corsi: ${corsi}…)` : ''}: nel file la colonna DISCIPLINA resterebbe vuota. Sceglila in Impostazioni ${nomeEnte} → Discipline, colonna "Per l'ente". Scaricare lo stesso?`)) { setApriEnte(true); return; }
    }
    const giuste = daMandare.map((r) => (invertiti(r) ? { ...r, nome: r.cognome, cognome: r.nome } : r));
    setErrore('');
    scaricaFileEnte(`tessere-${nomeEnte.toLowerCase()}-${stagione}-${daMandare.length}.csv`, fileEnte(giuste, ente, stagione), ente.codifica);
    setAvviso(`File con ${daMandare.length} ${daMandare.length === 1 ? 'persona' : 'persone'} scaricato${valide.length ? ` (tolte ${valide.length} che hanno già la tessera valida)` : ''}: caricalo sul portale (Tesserati → Caricamento tessere da file), poi "Segna mandati".`);
  }

  function elencoCompleto() {
    scaricaCsv(`tesseramento-${stagione}-${nomeEnte.toLowerCase()}.csv`,
      ['Cognome', 'Nome', 'Sesso', 'Data di nascita', 'Luogo di nascita', 'Codice fiscale', 'Indirizzo', 'CAP', 'Città', 'Provincia',
        'Email', 'Telefono', 'Corsi', 'Tipo tessera', 'Qualifica', 'Disciplina', 'Numero tessera', 'Scadenza certificato'],
      sceltiRighe.map((r) => {
        const v = valoriPersona(r, ente);
        return [r.cognome, r.nome, r.sesso || '', r.data_nascita ? dataBreve(r.data_nascita) : '', r.luogo_nascita || '',
          r.codice_fiscale || '', r.indirizzo || '', r.cap || '', r.citta || '', r.provincia || '', r.email || '', r.telefono || '',
          r.corsi || '', v.tipo, v.qualifica, v.disciplina, r.numero || '', r.certificato ? dataBreve(r.certificato) : ''];
      }));
  }

  // i dati per il preferito "Compila da RMHouse" sul portale ASI
  async function copiaPerAsi(r) {
    const giusto = invertiti(r) ? { ...r, nome: r.cognome, cognome: r.nome } : r;
    try { await navigator.clipboard.writeText(testoPerAsi(giusto, ente)); } catch { setErrore('Il browser non lascia copiare: riprova.'); return; }
    setCopiato(r.allievo_id); setTimeout(() => setCopiato(null), 2500);
    setAvviso(`Dati di ${giusto.cognome} ${giusto.nome} copiati: sul portale ASI premi «Compila da RMHouse».`);
  }


  return (
    <div className="tesseramento">
      <div className="intestazione">
        <div className="occhiello">Persone</div>
        <h1>Tesseramento {stagione}/{String(stagione + 1).slice(2)}</h1>
        <p>Chi frequenta nella stagione e la sua tessera {ente.nome || "dell'ente"}: scarica il file da caricare sul portale dell&apos;ente, poi segna i numeri.</p>
      </div>
      {errore && <div className="errore" role="alert">{errore}</div>}
      {avviso && <div className="avviso-ok" role="status">{avviso}</div>}
      {girati.length > 0 && (
        <div className="avviso ts-girati" role="status">
          <span>
            <b>{girati.length} {girati.length === 1 ? 'persona ha' : 'persone hanno'} nome e cognome al contrario</b> (in tutta la scuola, lo dice il codice fiscale):
            sul portale dell&apos;ente verrebbero caricate sbagliate. Es. {girati.slice(0, 2).map((x) => `"${x.cognome} ${x.nome}" è ${x.nome} ${x.cognome}`).join(', ')}.
          </span>
          <span className="in-riga">
            <button type="button" className="link-btn piccolo" onClick={() => setVediGirati(!vediGirati)}>{vediGirati ? 'nascondi' : 'vedi chi'}</button>
            <button type="button" className="btn btn-piccolo" disabled={invio} onClick={scambiaTutti}>Sistema tutti</button>
          </span>
          {vediGirati && (
            <ul className="ts-girati-elenco">
              {girati.map((x) => <li key={x.id}><Link prefetch={false} href={`/gestione/persone/${x.id}`}>{x.cognome} {x.nome}</Link> → {x.nome} {x.cognome}</li>)}
            </ul>
          )}
        </div>
      )}

      <div className="pannello-testa">
        <div className="pastiglie" style={{ margin: 0 }}>
          {[corrente - 1, corrente, corrente + 1].map((x) => (
            <Link prefetch={false} key={x} className="stato-pillola" aria-current={x === stagione ? 'true' : undefined} href={`/gestione/tesseramento?stagione=${x}`}>{x}/{String(x + 1).slice(2)}</Link>
          ))}
        </div>
        <span className="in-riga">
          {ente.portale && <a className="link-btn piccolo" href={ente.portale} target="_blank" rel="noreferrer">Apri il portale {nomeEnte} ↗</a>}
          <button type="button" className="btn btn-piccolo" aria-expanded={apriEnte} onClick={() => setApriEnte(!apriEnte)}>
            {apriEnte ? 'Chiudi le impostazioni' : `⚙ Impostazioni ${ente.nome || 'ente'}${ente.affiliazione ? ` · ${ente.affiliazione}` : ''}`}
          </button>
        </span>
      </div>

      {manca.length > 0 && !apriEnte && (
        <div className="avviso" role="status">
          Manca il <b>{manca.join(', ')}</b> (colonna CODICE AFFILIAZIONE del file): scrivilo nelle{' '}
          <button type="button" className="link-btn" onClick={() => setApriEnte(true)}>Impostazioni {nomeEnte}</button>.
        </div>
      )}

      <details className="pannello asi-aiuto" open={come}
               onToggle={(ev) => { const o = ev.currentTarget.open; setCome(o); try { localStorage.setItem('rm-ts-come', o ? '1' : '0'); } catch { /* niente */ } }}>
        <summary><b>Come funziona</b> <span className="piccolo muto">· 4 passi</span></summary>
        <ol className="asi-passi">
          <li><b>Chi tesserare:</b> filtro <i>Senza tessera</i> (non ce l&apos;hanno o è scaduta) o <i>In scadenza</i> → spunta → <b>File per {nomeEnte}</b>.
            Nel file: tipo (A/B secondo la disciplina), qualifica e disciplina dalle Impostazioni; <i>CODICE TESSERA</i> resta vuoto, il numero lo dà {nomeEnte}.</li>
          <li><b>Sul portale {nomeEnte}:</b> Tesserati → Caricamento tessere da file → carica il file. Poi qui <b>Segna mandati</b>.</li>
          <li><b>Quando le tessere sono fatte:</b> <b>Segna tesserati</b> (se i numeri sono in fila scrivi il primo), oppure <i>scrivi il numero</i> sulla persona.</li>
          <li><b>La tessera vale un anno:</b> chi scade entro 30 giorni è in <i>In scadenza</i>, chi è scaduto torna in <i>Senza tessera</i>.
            Le scadenze delle tessere già fatte: <i>Importa le scadenze</i> qui sotto.</li>
        </ol>
        <p className="piccolo muto" style={{ margin: '6px 0 0' }}>I valori predefiniti (tipo per disciplina, qualifica, disciplina {nomeEnte}, codice di affiliazione) si cambiano in <b>Impostazioni {nomeEnte}</b>, in alto a destra; per una persona sola, tocca i suoi valori nella colonna &quot;Per {nomeEnte}&quot;.</p>
      </details>

      {apriEnte && <ImpostazioniEnte palestraId={palestra.id} ente={palestra.ente || {}} discipline={discipline} stagione={stagione} onChiudi={() => setApriEnte(false)} />}

      <details className="pannello asi-aiuto">
        <summary><b>Importa le scadenze</b> <span className="piccolo muto">· dal vostro Excel delle iscrizioni (es. &quot;A 1413763 08/10/2026&quot;)</span></summary>
        <ImportaScadenze palestraId={palestra.id} />
      </details>

      <details className="pannello asi-aiuto">
        <summary><b>Compila il portale {nomeEnte} da RMHouse</b> <span className="piccolo muto">· persona per persona, senza riscrivere i dati</span></summary>
        <PreferitoAsi portale={ente.portale} />
      </details>

      <div className="ts-filtri">
        <input type="search" placeholder="Cerca nome, corso, numero o codice fiscale" value={cerca} onChange={(e) => setCerca(e.target.value)} aria-label="Cerca" />
        {FILTRI.map(([k, t, aiuto]) => (
          <button key={k} type="button" className="stato-pillola" title={aiuto} aria-current={filtro === k ? 'true' : undefined} onClick={() => { setFiltro(k); setScelti([]); }}>
            {t} <span className="conta">{conta(k)}</span>
          </button>
        ))}
      </div>

      {scelti.length > 0 && (
        <div className="barra-selezione">
          <strong>{scelti.length} scelti</strong>
          <button className="btn btn-piccolo btn-primario" onClick={fileEnteScelti}>File per {nomeEnte}</button>
          <button className="btn btn-piccolo" onClick={elencoCompleto}>Elenco completo</button>
          <button className="btn btn-piccolo" disabled={invio} onClick={() => segna('inviato')}>Segna mandati</button>
          <button className="btn btn-piccolo" disabled={invio} onClick={() => segna('tesserato')}>Segna tesserati</button>
          <button className="link-btn piccolo" onClick={() => setScelti([])}>annulla</button>
        </div>
      )}

      {visibili.length === 0 ? <div className="vuoto">Nessuno in questo elenco.</div> : (
        <div className="tabella-scorre">
          <table className="tabella-persone ts-tabella">
            <thead>
              <tr>
                <th><label className="spunta" style={{ margin: 0 }}><input type="checkbox" checked={tutti} aria-label="Tutti"
                  onChange={() => setScelti(tutti ? [] : visibili.map((r) => r.allievo_id))} /><span /></label></th>
                <th>Persona</th><th>Tessera</th>{conEnte && <th>Per {nomeEnte}</th>}<th className="col-desktop">Dati</th>
              </tr>
            </thead>
            <tbody>
              {visibili.map((r) => {
                const v = valoriPersona(r, ente);
                return [
                  <tr key={r.allievo_id}>
                    <td><label className="spunta" style={{ margin: 0 }}><input type="checkbox" checked={scelti.includes(r.allievo_id)} onChange={() => spunta(r.allievo_id)} aria-label={`${r.nome} ${r.cognome}`} /><span /></label></td>
                    <td>
                      <Link prefetch={false} className={`persona-nome${debiti.has(r.allievo_id) ? ' nome-rosso' : ''}`} href={`/gestione/persone/${r.allievo_id}`}
                            title={motivoPagamento(debiti.get(r.allievo_id)) || undefined}>{r.cognome} {r.nome}</Link>
                      <span className="ts-corsi">{r.corsi || '—'}</span>
                    </td>
                    <td>
                      <span className="in-riga">
                        {r.stato ? <span className={`tag ${STATI[r.stato][1]}`}>{STATI[r.stato][0]}</span>
                          : <span className="tag tag-rosso">{r.scaduta_il ? 'tessera scaduta' : 'senza tessera'}</span>}
                        <button className="link-btn piccolo" onClick={() => numero(r)}>{r.numero ? `${r.tipo_tessera || r.tipo_precedente || ''} ${r.numero}`.trim() : 'scrivi il numero'}</button>
                      </span>
                      <Scadenza r={r} oggi={oggi} />
                    </td>
                    {conEnte && (
                      <td className="ts-ente">
                        <button type="button" className="ts-valori" aria-expanded={aperta === r.allievo_id} onClick={() => setAperta(aperta === r.allievo_id ? null : r.allievo_id)}
                                title={`Tipo ${v.tipo || '—'} (${DA[v.da.tipo]}) · ${v.qualifica || '—'} (${DA[v.da.qualifica]}) · ${v.disciplina || '—'} (${DA[v.da.disciplina]})`}>
                          <b>{v.tipo || '—'}</b> · {v.qualifica || '—'} · <span className={v.disciplina ? '' : 'ts-manca'}>{v.disciplina || 'disciplina?'}</span>
                          {(r.o_tipo || r.o_qualifica || r.o_disciplina) && <span className="ts-suo" aria-label="valori scelti per questa persona">●</span>}
                        </button>
                        <button type="button" className="link-btn piccolo" onClick={() => copiaPerAsi(r)} title={`Copia i dati per compilare il portale ${nomeEnte} con «Compila da RMHouse»`}>
                          {copiato === r.allievo_id ? 'copiato ✓' : `Copia per ${nomeEnte}`}
                        </button>
                      </td>
                    )}
                    <td className="col-desktop piccolo">
                      {invertiti(r) && <><span style={{ color: 'var(--rosso-scuro)' }}>nome e cognome invertiti?</span> <button type="button" className="link-btn piccolo" onClick={() => scambia(r)}>scambia</button><br /></>}
                      {(Array.isArray(r.mancano) ? r.mancano : []).length ? <span style={{ color: 'var(--attenzione)' }}>manca: {r.mancano.join(', ')}</span> : !invertiti(r) && <span className="muto">completi</span>}
                    </td>
                  </tr>,
                  aperta === r.allievo_id && (
                    <tr key={`${r.allievo_id}-e`} className="ts-riga-ente">
                      <td colSpan={5}><ValoriPersona r={r} ente={ente} onFatto={() => { setAperta(null); router.refresh(); }} /></td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// sotto lo stato della tessera: quando scade, quando è scaduta, o che la scadenza non si sa
function Scadenza({ r, oggi }) {
  if (r.scadenza) {
    const g = giorniA(r.scadenza, oggi);
    return <span className={`ts-corsi${g <= 30 ? ' ts-scade' : ''}`}>scade il {dataBreve(r.scadenza)}{g <= 30 ? ` · ${g <= 0 ? 'oggi' : g === 1 ? 'domani' : `fra ${g} giorni`}` : ''}</span>;
  }
  if (r.scaduta_il) {
    return <span className="ts-corsi ts-scade">{`${r.tipo_precedente || ''} ${r.numero_precedente || ''}`.trim()} scaduta il {dataBreve(r.scaduta_il)}</span>;
  }
  if (r.scadenza_sconosciuta) return <span className="ts-corsi">scadenza non nota · importa le scadenze</span>;
  if (!r.stato && r.numero_precedente) return <span className="ts-corsi">ultima: {`${r.tipo_precedente || ''} ${r.numero_precedente}`.trim()}</span>;
  return null;
}

// tipo, qualifica e disciplina solo per questa persona ("predefinito" = come tutti gli altri)
function ValoriPersona({ r, ente, onFatto }) {
  const [f, setF] = useState({ tipo: r.o_tipo || '', qualifica: r.o_qualifica || '', disciplina: r.o_disciplina || '' });
  const [errore, setErrore] = useState('');
  const base = valoriPersona({ ...r, o_tipo: null, o_qualifica: null, o_disciplina: null }, ente);
  async function salva(e) {
    e.preventDefault();
    const { error } = await supabaseBrowser().from('allievi')
      .update({ tessera_tipo: f.tipo || null, tessera_qualifica: f.qualifica || null, tessera_disciplina: f.disciplina || null }).eq('id', r.allievo_id);
    if (error) { setErrore(error.message?.includes('tessera_') ? 'Manca la query 157 in Supabase.' : 'Non salvato.'); return; }
    onFatto();
  }
  const scelta = (k, etichetta, opzioni) => (
    <div className="campo"><label htmlFor={`ts-${k}-${r.allievo_id}`}>{etichetta}</label>
      <select id={`ts-${k}-${r.allievo_id}`} value={f[k]} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))}>
        <option value="">predefinito{base[k] ? ` (${base[k]})` : ''}</option>
        {opzioni.map((t) => <option key={t} value={t}>{t}</option>)}
      </select></div>
  );
  return (
    <form className="ts-persona" onSubmit={salva}>
      <span className="piccolo"><b>Solo per {r.nome}</b></span>
      {scelta('tipo', 'Tipo tessera', TIPI_ASI)}
      {scelta('qualifica', 'Qualifica', QUALIFICHE_ASI)}
      {scelta('disciplina', 'Disciplina', ente.discipline_ente)}
      <button className="btn btn-piccolo btn-primario">Salva</button>
      {errore && <span className="piccolo" style={{ color: 'var(--rosso-scuro)' }}>{errore}</span>}
    </form>
  );
}
