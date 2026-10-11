'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { scaricaCsv } from '@/lib/stati';
import { dataBreve } from '@/lib/formato';
import { TIPI_ASI, QUALIFICHE_ASI, impostazioniEnte, valoriPersona, fileEnte, scaricaFileEnte } from '@/lib/tessereEnte';
import { parteCognome, parteNome, normalizzaCF } from '@/lib/codiceFiscale';
import ImpostazioniEnte from './ImpostazioniEnte';
import PreferitoAsi from './PreferitoAsi';
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
const FILTRI = [['tutti', 'Tutti'], ['senza', 'Senza tessera'], ['da_inviare', 'Da mandare'], ['inviato', 'Mandati'], ['tesserato', 'Tesserati'], ['dati', 'Dati mancanti']];
const DA = { persona: 'scelto per lei', tessera: 'come la sua tessera', corso: 'dal corso', predefinito: 'predefinito' };

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
  const nomeEnte = ente.nome || 'ente';

  const mancano = (r) => [...(Array.isArray(r.mancano) ? r.mancano : []), ...(invertiti(r) ? ['nome e cognome invertiti?'] : [])];
  const testo = cerca.trim().toLowerCase();
  const passa = (r, k) => (k === 'tutti' ? true : k === 'senza' ? !r.stato : k === 'dati' ? mancano(r).length > 0 : r.stato === k);
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
    const n = prompt(`Numero di tessera di ${r.nome} ${r.cognome} (es. A 1234567)`, r.numero ? `${r.tipo_tessera || r.tipo_precedente || ''} ${r.numero}`.trim() : '');
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
    const girati = sceltiRighe.filter(invertiti);
    if (girati.length && !confirm(`${girati.length === 1 ? 'Una persona ha' : `${girati.length} persone hanno`} nome e cognome invertiti secondo il codice fiscale (${girati.slice(0, 4).map((r) => `${r.cognome} ${r.nome}`).join(', ')}${girati.length > 4 ? '…' : ''}). Nel file li metto giusti, ma sistemali anche nella scheda ("scambia" nella colonna Dati). Continuare?`)) return;
    const senzaCf = sceltiRighe.filter((r) => !r.codice_fiscale);
    if (senzaCf.length && !confirm(`${senzaCf.length} ${senzaCf.length === 1 ? 'persona non ha' : 'persone non hanno'} il codice fiscale (${senzaCf.slice(0, 4).map((r) => `${r.cognome} ${r.nome}`).join(', ')}${senzaCf.length > 4 ? '…' : ''}): il portale le scarterà. Scaricare lo stesso?`)) return;
    const giuste = sceltiRighe.map((r) => (invertiti(r) ? { ...r, nome: r.cognome, cognome: r.nome } : r));
    scaricaFileEnte(`tessere-${nomeEnte.toLowerCase()}-${stagione}-${sceltiRighe.length}.csv`, fileEnte(giuste, ente, stagione), ente.codifica);
    setAvviso(`File con ${sceltiRighe.length} ${sceltiRighe.length === 1 ? 'persona' : 'persone'} scaricato: caricalo sul portale (Tesserati → Caricamento tessere da file), poi "Segna mandati".`);
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
          <button className="link-btn piccolo" onClick={() => setApriEnte(!apriEnte)}>{apriEnte ? 'chiudi le impostazioni' : `Impostazioni ${ente.nome || 'ente'}${ente.affiliazione ? ` · ${ente.affiliazione}` : ''}`}</button>
        </span>
      </div>

      {apriEnte && <ImpostazioniEnte palestraId={palestra.id} ente={palestra.ente || {}} discipline={discipline} stagione={stagione} onChiudi={() => setApriEnte(false)} />}

      <details className="pannello asi-aiuto">
        <summary><b>Compila il portale {nomeEnte} da RMHouse</b> <span className="piccolo muto">· persona per persona, senza riscrivere i dati</span></summary>
        <PreferitoAsi portale={ente.portale} />
      </details>

      <div className="ts-filtri">
        <input type="search" placeholder="Cerca nome, corso, numero o codice fiscale" value={cerca} onChange={(e) => setCerca(e.target.value)} aria-label="Cerca" />
        {FILTRI.map(([k, t]) => (
          <button key={k} type="button" className="stato-pillola" aria-current={filtro === k ? 'true' : undefined} onClick={() => { setFiltro(k); setScelti([]); }}>
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
                      <Link prefetch={false} className="persona-nome" href={`/gestione/persone/${r.allievo_id}`}>{r.cognome} {r.nome}</Link>
                      <span className="ts-corsi">{r.corsi || '—'}</span>
                    </td>
                    <td>
                      <span className="in-riga">
                        {r.stato ? <span className={`tag ${STATI[r.stato][1]}`}>{STATI[r.stato][0]}</span> : <span className="tag tag-rosso">senza tessera</span>}
                        <button className="link-btn piccolo" onClick={() => numero(r)}>{r.numero ? `${r.tipo_tessera || r.tipo_precedente || ''} ${r.numero}`.trim() : 'scrivi il numero'}</button>
                      </span>
                      {(r.scadenza || (!r.stato && r.numero_precedente)) && (
                        <span className="ts-corsi">{r.scadenza ? `scade il ${dataBreve(r.scadenza)}` : `ultima: ${r.tessera_anagrafica}`}</span>
                      )}
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
      <p className="piccolo muto" style={{ marginTop: 12 }}>
        Come si fa: scegli le persone (es. filtro &quot;Senza tessera&quot; → spunta tutti) → <b>File per {nomeEnte}</b> → sul portale
        Tesserati → Caricamento tessere da file → poi qui <b>Segna mandati</b>, e quando arrivano i numeri <b>Segna tesserati</b>
        (o &quot;scrivi il numero&quot; persona per persona). Il file ha le colonne del modello ASI: si cambiano in Impostazioni.
      </p>
    </div>
  );
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
