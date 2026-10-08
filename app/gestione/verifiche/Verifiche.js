'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { comeCsv } from '@/lib/stati';
import { creaZipCompresso } from '@/lib/zip';
import { FILE_VERIFICHE, messaggioClaude, testoLeggimi } from '@/lib/verifiche';

const dataIt = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const meseDopo = (iso) => { const [a, m] = iso.split('-').map(Number); return new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 10); };
const fineMese = (iso) => { const d = new Date(`${meseDopo(iso)}T00:00:00Z`); d.setUTCDate(0); return d.toISOString().slice(0, 10); };
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
// i file grandi (presenze, lezioni, ingressi, modifiche) si chiedono un mese alla volta
function aMesi(dal, al) {
  const pezzi = [];
  for (let d = dal; d <= al; d = meseDopo(d.slice(0, 7) + '-01')) pezzi.push([d, fineMese(d) < al ? fineMese(d) : al]);
  return pezzi;
}
// stesso risultato sul server e nel browser (toLocaleString cambia tra Node e Chrome: errore di idratazione)
const migliaia = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const giorniFa = (iso) => Math.round((Date.now() - new Date(iso).getTime()) / 86400000);

export default function Verifiche({ palestraId, scuola, oggi, periodi, fatte, prossimo, chi }) {
  const router = useRouter();
  const [scelto, setScelto] = useState(periodi[0]?.k || 'stagione');
  const iniziale = periodi.find((x) => x.k === scelto) || periodi[0];
  const [dal, setDal] = useState(iniziale.dal);
  const [al, setAl] = useState(iniziale.al);
  const [banca, setBanca] = useState(true);
  const [precedente, setPrecedente] = useState(fatte.length > 0);
  const [lavoro, setLavoro] = useState('');
  const [avanz, setAvanz] = useState(0);
  const [righe, setRighe] = useState(null);
  const [errore, setErrore] = useState('');
  const [copiato, setCopiato] = useState(false);
  const [fatto, setFatto] = useState('');
  const [leggi, setLeggi] = useState(false);

  const messaggio = useMemo(() => messaggioClaude({ dal, al, oggi, scuola, banca, precedente }), [dal, al, oggi, scuola, banca, precedente]);
  const ultima = fatte[0];
  const vecchia = !ultima || giorniFa(ultima.creato_at) > 200;

  function scegli(x) { setScelto(x.k); setDal(x.dal); setAl(x.al); setRighe(null); setFatto(''); }

  async function scarica() {
    setErrore(''); setFatto(''); setRighe(null);
    if (!dal || !al || dal > al) { setErrore('Controlla le date: "dal" deve venire prima di "al".'); return; }
    const db = supabaseBrowser();
    const mesi = aMesi(dal, al);
    const passi = FILE_VERIFICHE.reduce((t, f) => t + (f.mensile ? mesi.length : 1), 0);
    let n = 0;
    const conta = {};
    const file = [];
    try {
      for (const f of FILE_VERIFICHE) {
        let dati = [];
        const pezzi = f.mensile ? mesi : [[dal, al]];
        for (const [d1, d2] of pezzi) {
          setLavoro(f.mensile ? `${f.titolo}: ${MESI[Number(d1.slice(5, 7)) - 1]} ${d1.slice(0, 4)}` : `${f.titolo}…`);
          const { data, error } = await db.rpc('verifiche_file', { p_palestra: palestraId, p_file: f.k, p_dal: d1, p_al: d2 });
          if (error) throw error;
          dati = dati.concat(data || []);
          n += 1; setAvanz(Math.round((n / passi) * 100));
        }
        conta[f.k] = dati.length;
        const intest = dati.length ? Object.keys(dati[0]) : ['nessuna riga nel periodo'];
        file.push({ nome: `${f.k}.csv`, contenuto: comeCsv(intest, dati.map((r) => intest.map((h) => r[h]))) });
      }
      setLavoro('Preparo lo ZIP…');
      file.unshift({ nome: 'LEGGIMI.txt', contenuto: testoLeggimi({ dal, al, oggi, chi, scuola, righe: conta, messaggio }) });
      const zip = await creaZipCompresso(file);
      const url = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }));
      const a = document.createElement('a');
      a.href = url; a.download = `verifiche-${dal}_${al}.zip`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setRighe(conta);
      setFatto(`Scaricato verifiche-${dal}_${al}.zip (${(zip.length / 1048576).toLocaleString('it-IT', { maximumFractionDigits: 1 })} MB). Ora il passo 3.`);
      await db.rpc('registra_verifiche_export', { p_palestra: palestraId, p_dal: dal, p_al: al, p_file: conta });
      router.refresh();
    } catch (e) {
      console.error(e);
      const m = e?.message || '';
      setErrore(m.includes('non_autorizzato') ? 'Serve un accesso da amministrazione o segreteria.'
        : m.includes('verifiche_file') || m.includes('schema cache') || m.includes('does not exist') ? 'Manca la query 151 in Supabase: lanciala e riprova.'
        : 'Non riuscito: riprova tra poco. Se si ripete, scegli un periodo più corto.');
    }
    setLavoro(''); setAvanz(0);
  }

  async function copia() {
    try { await navigator.clipboard.writeText(messaggio); setCopiato(true); setTimeout(() => setCopiato(false), 2500); }
    catch { document.getElementById('vf-messaggio')?.select(); }
  }

  return (
    <div className="vf">
      <div className={`vf-stato ${vecchia ? 'vf-stato-da-fare' : ''}`}>
        {ultima ? (
          <>Ultima verifica scaricata il <strong>{dataIt(ultima.creato_at)}</strong>{ultima.chi ? ` da ${ultima.chi}` : ''},
            periodo {dataIt(ultima.dal)} – {dataIt(ultima.al)}.{vecchia ? ' È ora di farne un\'altra.' : ''}</>
        ) : <>Non è ancora stata fatta nessuna verifica. Consigliato: <strong>a fine gennaio</strong> (da settembre a gennaio) e <strong>a fine luglio</strong> (tutta la stagione).</>}
        {prossimo && <> Promemoria della prossima: <strong>{dataIt(prossimo)}</strong> nella home.</>}
      </div>

      <section className="pannello">
        <h2>Come si fa</h2>
        <ol className="vf-passi">
          <li>
            <div className="vf-titolo">Scegli il periodo</div>
            <div className="pastiglie vf-periodi">
              {periodi.map((x) => (
                <button key={x.k} type="button" className="stato-pillola" aria-pressed={scelto === x.k && x.dal === dal && x.al === al}
                        onClick={() => scegli(x)}>{x.testo}</button>
              ))}
            </div>
            <div className="vf-date">
              <label>Dal <input type="date" value={dal} max={oggi} onChange={(e) => { setDal(e.target.value); setScelto(''); }} /></label>
              <label>Al <input type="date" value={al} onChange={(e) => { setAl(e.target.value); setScelto(''); }} /></label>
            </div>
            <p className="piccolo muto">Di solito: la stagione fino a oggi, oppure &quot;Dall&apos;ultima verifica&quot; per ripartire da dove ci si era fermati.</p>
          </li>
          <li>
            <div className="vf-titolo">Scarica il pacchetto</div>
            <button type="button" className="btn btn-primario" onClick={scarica} disabled={!!lavoro}>
              {lavoro ? 'Preparo…' : `Scarica il pacchetto (${dataIt(dal)} – ${dataIt(al)})`}</button>
            {lavoro && (
              <div className="vf-avanz" role="status">
                <div className="vf-barra"><span style={{ width: `${avanz}%` }} /></div>
                <span className="piccolo muto">{lavoro} {avanz}%</span>
              </div>
            )}
            {fatto && <div className="avviso-ok" role="status" style={{ marginTop: 10 }}>{fatto}</div>}
            {errore && <div className="errore" role="alert">{errore}</div>}
            <p className="piccolo muto">Esce un file <b>verifiche-…zip</b> (di solito pochi MB): non aprirlo e non modificarlo. Ci vuole meno di un minuto.</p>
          </li>
          <li>
            <div className="vf-titolo">Scarica l&apos;estratto conto della banca dello stesso periodo <span className="tag tag-neutro">consigliato</span></div>
            <p>Dall&apos;home banking: movimenti del conto dal {dataIt(dal)} al {dataIt(al)}, in <b>Excel o CSV</b> (meglio del PDF).
              Se la scuola ha più conti, scaricali tutti. Serve per controllare i contanti versati e i bonifici.</p>
          </li>
          <li>
            <div className="vf-titolo">Apri Claude e allega i file</div>
            <p>Vai su <b>claude.ai</b>, apri il progetto <b>«RMHOUSE TRACKING»</b> (così conosce già RMHouse) e inizia una <b>nuova chat</b>.
              Allega (graffetta) lo ZIP, l&apos;estratto conto e, se ce l&apos;hai, il file Excel della verifica precedente.</p>
          </li>
          <li>
            <div className="vf-titolo">Copia il messaggio e incollalo nella chat</div>
            <div className="vf-spunte">
              <label className="spunta"><input type="checkbox" checked={banca} onChange={(e) => setBanca(e.target.checked)} /> Allego anche l&apos;estratto conto</label>
              <label className="spunta"><input type="checkbox" checked={precedente} onChange={(e) => setPrecedente(e.target.checked)} /> Allego anche l&apos;Excel della verifica precedente</label>
            </div>
            <button type="button" className="btn" onClick={copia}>{copiato ? 'Copiato ✓ ora incollalo nella chat' : 'Copia il messaggio per Claude'}</button>
            <details className="vf-messaggio" onToggle={(e) => setLeggi(e.currentTarget.open)}>
              <summary>Leggi il messaggio</summary>
              {leggi && <textarea id="vf-messaggio" readOnly value={messaggio} rows={18} onFocus={(e) => e.target.select()} />}
            </details>
          </li>
          <li>
            <div className="vf-titolo">Quando Claude risponde</div>
            <p>Ti dà un riepilogo con il semaforo, l&apos;elenco delle cose da sistemare (con nome, importo e dove si sistema in RMHouse)
              e un <b>file Excel</b>: scaricalo, dallo alla segreteria e <b>conservalo</b> per la prossima verifica.
              Poi <b>cancella lo ZIP e l&apos;estratto conto</b> dal computer.</p>
          </li>
        </ol>
      </section>

      <section className="pannello">
        <h2>Cosa c&apos;è nel pacchetto</h2>
        <p className="piccolo muto" style={{ marginTop: 0 }}>Ogni file è un CSV (si apre anche con Excel). Dentro c&apos;è anche LEGGIMI.txt con la spiegazione di ogni colonna e lo stesso messaggio per Claude.</p>
        <ul className="vf-file">
          {FILE_VERIFICHE.map((f) => (
            <li key={f.k}>
              <strong>{f.titolo}</strong> <span className="piccolo muto">{f.k}.csv{righe ? ` · ${righe[f.k] ?? 0} righe` : ''}</span>
              <div className="piccolo">{f.cosa}</div>
            </li>
          ))}
        </ul>
      </section>

      <section className="pannello">
        <h2>Riservatezza</h2>
        <p style={{ margin: 0 }}>Nel pacchetto ci sono nomi, date di nascita e codici fiscali dei clienti (non email, telefoni e indirizzi).
          Dallo solo a Claude o alla persona che fa le verifiche per la scuola, non mandarlo per email e cancellalo quando hai finito.</p>
      </section>

      {fatte.length > 0 && (
        <section className="pannello">
          <h2>Verifiche scaricate</h2>
          <div className="tabella-scorre">
            <table className="tabella">
              <thead><tr><th>Quando</th><th>Chi</th><th>Periodo</th><th style={{ textAlign: 'right' }}>Righe</th></tr></thead>
              <tbody>
                {fatte.map((x) => (
                  <tr key={x.id}>
                    <td>{dataIt(x.creato_at)}</td><td>{x.chi || '—'}</td><td>{dataIt(x.dal)} – {dataIt(x.al)}</td>
                    <td style={{ textAlign: 'right' }}>{migliaia(Object.values(x.file || {}).reduce((t, v) => t + (Number(v) || 0), 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
