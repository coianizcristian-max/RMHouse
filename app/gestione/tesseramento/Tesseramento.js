'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { scaricaCsv } from '@/lib/stati';
import { dataBreve } from '@/lib/formato';

const STATI = { da_inviare: ['da mandare all\'ente', 'tag-attenzione'], inviato: ['mandato, attende il numero', 'tag-neutro'], tesserato: ['tesserato', 'tag-ok'] };
const FILTRI = [['tutti', 'Tutti'], ['senza', 'Senza tessera'], ['da_inviare', 'Da mandare'], ['inviato', 'Mandati'], ['tesserato', 'Tesserati'], ['dati', 'Dati mancanti']];

export default function Tesseramento({ palestra, stagione, corrente, righe }) {
  const router = useRouter();
  const [ente, setEnte] = useState({ nome: '', affiliazione: '', quota_comprende_tessera: false, ...(palestra.ente || {}) });
  const [apriEnte, setApriEnte] = useState(!palestra.ente?.nome);
  const [filtro, setFiltro] = useState('tutti');
  const [scelti, setScelti] = useState([]);
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);

  const visibili = useMemo(() => righe.filter((r) =>
    filtro === 'tutti' ? true : filtro === 'senza' ? !r.stato : filtro === 'dati' ? r.mancano?.length > 0 : r.stato === filtro), [righe, filtro]);
  const conta = (k) => righe.filter((r) => (k === 'tutti' ? true : k === 'senza' ? !r.stato : k === 'dati' ? r.mancano?.length > 0 : r.stato === k)).length;
  const spunta = (id) => setScelti((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  const tutti = visibili.length > 0 && visibili.every((r) => scelti.includes(r.allievo_id));

  async function salvaEnte(e) {
    e.preventDefault();
    const { error } = await supabaseBrowser().from('palestre').update({ ente }).eq('id', palestra.id);
    if (error) { setErrore('Salvataggio non riuscito.'); return; }
    setApriEnte(false); router.refresh();
  }

  async function segna(stato) {
    let numeroDa = null;
    if (stato === 'tesserato') {
      const n = prompt('Numero della prima tessera (le altre seguono in ordine alfabetico). Lascia vuoto se i numeri li scrivi a mano.');
      if (n === null) return;
      if (n.trim()) { numeroDa = parseInt(n, 10); if (!Number.isFinite(numeroDa)) { setErrore('Numero non valido.'); return; } }
    }
    setInvio(true); setErrore('');
    const ordinati = righe.filter((r) => scelti.includes(r.allievo_id)).map((r) => r.allievo_id);
    const { error } = await supabaseBrowser().rpc('aggiorna_tesseramenti', {
      p_palestra: palestra.id, p_stagione: stagione, p_allievi: ordinati, p_stato: stato, p_numero_da: numeroDa,
    });
    setInvio(false);
    if (error) { setErrore('Operazione non riuscita.'); return; }
    setScelti([]); router.refresh();
  }

  async function numero(r) {
    const n = prompt(`Numero di tessera di ${r.nome} ${r.cognome}`, r.numero || '');
    if (n === null) return;
    const db = supabaseBrowser();
    await db.rpc('aggiorna_tesseramenti', { p_palestra: palestra.id, p_stagione: stagione, p_allievi: [r.allievo_id], p_stato: n.trim() ? 'tesserato' : (r.stato || 'da_inviare'), p_numero_da: null });
    if (n.trim()) {
      await db.from('tesseramenti').update({ numero: n.trim() }).eq('allievo_id', r.allievo_id).eq('stagione', stagione);
      await db.from('allievi').update({ tessera: n.trim() }).eq('id', r.allievo_id);
    }
    router.refresh();
  }

  function esporta() {
    const elenco = righe.filter((r) => scelti.includes(r.allievo_id));
    scaricaCsv(`tesseramento-${stagione}-${(ente.nome || 'ente').toLowerCase()}.csv`,
      ['Cognome', 'Nome', 'Sesso', 'Data di nascita', 'Luogo di nascita', 'Codice fiscale', 'Indirizzo', 'CAP', 'Città', 'Provincia',
        'Email', 'Telefono', 'Disciplina', 'Numero tessera'],
      elenco.map((r) => [r.cognome, r.nome, r.sesso || '', r.data_nascita ? dataBreve(r.data_nascita) : '', r.luogo_nascita || '',
        r.codice_fiscale || '', r.indirizzo || '', r.cap || '', r.citta || '', r.provincia || '', r.email || '', r.telefono || '',
        r.corsi || '', r.numero || '']));
  }

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Persone</div>
        <h1>Tesseramento {stagione}/{String(stagione + 1).slice(2)}</h1>
        <p>Chi frequenta nella stagione e la sua tessera {ente.nome ? `${ente.nome}` : "dell'ente"}: esporta l'elenco da caricare sul portale dell'ente, poi segna i numeri.</p>
      </div>
      {errore && <div className="errore" role="alert">{errore}</div>}

      <div className="pannello-testa">
        <div className="pastiglie" style={{ margin: 0 }}>
          {[corrente - 1, corrente, corrente + 1].map((x) => (
            <Link key={x} className="stato-pillola" aria-current={x === stagione ? 'true' : undefined} href={`/gestione/tesseramento?stagione=${x}`}>{x}/{String(x + 1).slice(2)}</Link>
          ))}
        </div>
        <button className="link-btn piccolo" onClick={() => setApriEnte(!apriEnte)}>{apriEnte ? 'chiudi' : `Ente: ${ente.nome || 'da impostare'}`}</button>
      </div>

      {apriEnte && (
        <form className="pannello" onSubmit={salvaEnte} style={{ marginBottom: 14 }}>
          <div className="griglia-soglie">
            <div className="campo"><label htmlFor="en">Ente di promozione sportiva</label>
              <input id="en" value={ente.nome} onChange={(e) => setEnte({ ...ente, nome: e.target.value })} placeholder="Es. CSEN, UISP, ASI, AICS…" /></div>
            <div className="campo"><label htmlFor="af">Codice di affiliazione</label>
              <input id="af" value={ente.affiliazione} onChange={(e) => setEnte({ ...ente, affiliazione: e.target.value })} /></div>
          </div>
          <label className="spunta"><input type="checkbox" checked={!!ente.quota_comprende_tessera} onChange={(e) => setEnte({ ...ente, quota_comprende_tessera: e.target.checked })} />
            <span>La quota annuale comprende la tessera: chi paga la quota finisce da solo fra i "da mandare"</span></label>
          <button className="btn btn-primario">Salva</button>
        </form>
      )}

      <div className="pastiglie">
        {FILTRI.map(([k, t]) => (
          <button key={k} type="button" className="stato-pillola" aria-current={filtro === k ? 'true' : undefined} onClick={() => { setFiltro(k); setScelti([]); }}>
            {t} <span className="conta">{conta(k)}</span>
          </button>
        ))}
      </div>

      {scelti.length > 0 && (
        <div className="barra-selezione">
          <strong>{scelti.length} scelti</strong>
          <button className="btn btn-piccolo" onClick={esporta}>Esporta per l'ente</button>
          <button className="btn btn-piccolo" disabled={invio} onClick={() => segna('inviato')}>Segna mandati</button>
          <button className="btn btn-piccolo" disabled={invio} onClick={() => segna('tesserato')}>Segna tesserati</button>
          <button className="link-btn piccolo" onClick={() => setScelti([])}>annulla</button>
        </div>
      )}

      {visibili.length === 0 ? <div className="vuoto">Nessuno in questo elenco.</div> : (
        <div className="tabella-scorre">
          <table className="tabella-persone">
            <thead>
              <tr>
                <th><label className="spunta" style={{ margin: 0 }}><input type="checkbox" checked={tutti} aria-label="Tutti"
                  onChange={() => setScelti(tutti ? [] : visibili.map((r) => r.allievo_id))} /><span /></label></th>
                <th>Persona</th><th>Tessera</th><th className="col-desktop">Dati per l'ente</th>
              </tr>
            </thead>
            <tbody>
              {visibili.map((r) => (
                <tr key={r.allievo_id}>
                  <td><label className="spunta" style={{ margin: 0 }}><input type="checkbox" checked={scelti.includes(r.allievo_id)} onChange={() => spunta(r.allievo_id)} aria-label={r.nome} /><span /></label></td>
                  <td>
                    <Link className="persona-nome" href={`/gestione/persone/${r.allievo_id}`}>{r.cognome} {r.nome}</Link>
                    <div className="piccolo muto">{r.corsi || '—'}</div>
                  </td>
                  <td>
                    {r.stato ? <span className={`tag ${STATI[r.stato][1]}`}>{STATI[r.stato][0]}</span> : <span className="tag tag-rosso">senza tessera</span>}
                    <div className="piccolo">
                      <button className="link-btn piccolo" onClick={() => numero(r)}>{r.numero ? `n. ${r.numero}` : 'scrivi il numero'}</button>
                    </div>
                  </td>
                  <td className="col-desktop piccolo">
                    {r.mancano?.length ? <span style={{ color: 'var(--attenzione)' }}>manca: {r.mancano.join(', ')}</span> : <span className="muto">completi</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="piccolo muto" style={{ marginTop: 12 }}>
        Il file esportato ha le colonne che chiedono di solito gli enti (anagrafica, codice fiscale, indirizzo, disciplina).
        Se il portale del vostro ente vuole un ordine diverso, mandami un loro modello e lo adatto.
      </p>
    </>
  );
}
