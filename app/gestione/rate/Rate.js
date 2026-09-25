'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { euro, dataBreve, oggiISO } from '@/lib/formato';
import LinkPagamento from '../LinkPagamento';

const METODI = [['contanti', 'Contanti'], ['pos', 'POS'], ['bonifico', 'Bonifico'], ['online', 'Online'], ['assegno', 'Assegno']];
const quando = (g) => (g < 0 ? `scaduta da ${-g} giorni` : g === 0 ? 'scade oggi' : `tra ${g} giorni`);

export default function Rate({ palestraId, rate, vista, conti, online = false }) {
  const router = useRouter();
  const [apri, setApri] = useState(false);
  const [f, setF] = useState({ cerca: '', allievo_id: '', nome: '', descrizione: '', totale: '', rate: '3', prima: oggiISO(), ogni: '1' });
  const [trovati, setTrovati] = useState([]);
  const [metodo, setMetodo] = useState('contanti');
  const [ricevuta, setRicevuta] = useState(true);
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function cerca(testo) {
    setF({ ...f, cerca: testo, allievo_id: '', nome: '' });
    if (testo.trim().length < 2) { setTrovati([]); return; }
    const { data } = await supabaseBrowser().from('v_persone').select('id, nome, cognome, titolare_nome, titolare_cognome')
      .eq('palestra_id', palestraId).ilike('ricerca', `%${testo.trim().toLowerCase()}%`).limit(8);
    setTrovati(data || []);
  }

  async function crea(e) {
    e.preventDefault();
    const totale = parseFloat(String(f.totale).replace(',', '.'));
    if (!f.allievo_id) { setErrore('Scegli la persona.'); return; }
    if (!Number.isFinite(totale) || totale <= 0) { setErrore('Scrivi il totale.'); return; }
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().rpc('crea_piano_rate', { p: {
      palestra_id: palestraId, allievo_id: f.allievo_id, descrizione: f.descrizione || 'Abbonamento a rate',
      totale_cent: Math.round(totale * 100), rate: parseInt(f.rate, 10), prima_scadenza: f.prima, ogni_mesi: parseInt(f.ogni, 10),
    } });
    setInvio(false);
    if (error) { setErrore('Piano non creato. Controlla i dati.'); return; }
    setApri(false); setF({ ...f, cerca: '', allievo_id: '', nome: '', descrizione: '', totale: '' });
    router.refresh();
  }

  async function incassa(r) {
    setInvio(true); setErrore('');
    const db = supabaseBrowser();
    const { data: pag, error } = await db.rpc('incassa_rata', { p_rata: r.id, p_metodo: metodo });
    if (!error && ricevuta) await db.rpc('emetti_ricevuta', { p_pagamento: pag });
    setInvio(false);
    if (error) { setErrore('Incasso non riuscito.'); return; }
    router.refresh();
  }

  async function annullaPiano(r) {
    if (!confirm(`Annullare le rate ancora da pagare di "${r.descrizione}"? Quelle già pagate restano.`)) return;
    const { error } = await supabaseBrowser().from('rate').update({ stato: 'annullata' }).eq('piano', r.piano).eq('stato', 'da_pagare');
    if (error) { setErrore('Operazione non riuscita.'); return; }
    router.refresh();
  }

  const quota = (() => {
    const t = parseFloat(String(f.totale).replace(',', '.')), n = parseInt(f.rate, 10);
    return Number.isFinite(t) && n > 0 ? t / n : null;
  })();

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Conti</div>
        <h1>Rate</h1>
        <p>Un importo diviso in più scadenze. Le rate scadute compaiono anche nella pagina iniziale e nelle Scadenze.</p>
      </div>

      {errore && <div className="errore" role="alert">{errore}</div>}

      <div className="kpi" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        <div className="tessera"><div className="etichetta">Da pagare</div><div className="cifra">{conti.da_pagare}</div>
          <div className="sotto">valgono {euro(conti.valore_da_pagare)}</div></div>
        <div className={`tessera${conti.scadute ? ' tessera-rossa' : ''}`}><div className="etichetta">Scadute</div><div className="cifra">{conti.scadute}</div>
          <div className="sotto">{euro(conti.valore_scadute)} da recuperare</div></div>
      </div>

      <div className="pannello-testa">
        <div className="pastiglie" style={{ margin: 0 }}>
          {[['da_pagare', 'Da pagare'], ['scadute', 'Scadute'], ['pagate', 'Pagate'], ['tutte', 'Tutte']].map(([k, t]) => (
            <Link key={k} className="stato-pillola" aria-current={vista === k ? 'true' : undefined} href={`/gestione/rate?vista=${k}`}>{t}</Link>
          ))}
        </div>
        {!apri && <button className="btn btn-piccolo btn-primario" onClick={() => setApri(true)}>Nuovo piano di rate</button>}
      </div>

      {apri && (
        <form className="pannello" onSubmit={crea} style={{ marginBottom: 14 }}>
          <h2>Nuovo piano di rate</h2>
          <div className="campo">
            <label htmlFor="chi">Per chi</label>
            <input id="chi" value={f.nome || f.cerca} onChange={(e) => cerca(e.target.value)} placeholder="Cerca per nome" autoComplete="off" />
            {trovati.length > 0 && !f.allievo_id && (
              <div className="pastiglie" style={{ marginTop: 6 }}>
                {trovati.map((t) => (
                  <button type="button" key={t.id} style={{ paddingLeft: 12 }}
                          onClick={() => { setF({ ...f, allievo_id: t.id, nome: `${t.cognome} ${t.nome}` }); setTrovati([]); }}>
                    {t.cognome} {t.nome}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="campo"><label htmlFor="desc">Per cosa</label>
            <input id="desc" value={f.descrizione} onChange={set('descrizione')} placeholder="Es. POLE ANNUALE 2 volte" /></div>
          <div className="griglia-soglie">
            <div className="campo"><label htmlFor="tot">Totale (€)</label><input id="tot" inputMode="decimal" value={f.totale} onChange={set('totale')} /></div>
            <div className="campo"><label htmlFor="n">Quante rate</label><input id="n" type="number" min="2" max="12" value={f.rate} onChange={set('rate')} /></div>
            <div className="campo"><label htmlFor="pr">Prima scadenza</label><input id="pr" type="date" value={f.prima} onChange={set('prima')} /></div>
            <div className="campo"><label htmlFor="og">Ogni quanti mesi</label><input id="og" type="number" min="1" max="6" value={f.ogni} onChange={set('ogni')} /></div>
          </div>
          {quota && <p className="piccolo muto">{f.rate} rate da circa {euro(Math.round(quota * 100))}; l'ultima arrotonda.</p>}
          <div className="azioni">
            <button className="btn btn-primario" disabled={invio}>{invio ? 'Creo…' : 'Crea le rate'}</button>
            <button type="button" className="btn" onClick={() => setApri(false)}>Annulla</button>
          </div>
        </form>
      )}

      {rate.length > 0 && vista !== 'pagate' && (
        <div className="elenco-testa">
          <span className="piccolo muto">Incasso con</span>
          <select value={metodo} onChange={(e) => setMetodo(e.target.value)} style={{ width: 'auto', minHeight: 36 }}>
            {METODI.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <label className="spunta" style={{ margin: 0 }}>
            <input type="checkbox" checked={ricevuta} onChange={(e) => setRicevuta(e.target.checked)} />
            <span>emetti subito la ricevuta</span>
          </label>
        </div>
      )}

      {rate.length === 0 && <div className="vuoto">Nessuna rata in questo elenco.</div>}
      {rate.length > 0 && (
        <div className="tabella-scorre">
          <table className="tabella-persone">
            <thead><tr><th>Persona</th><th>Rata</th><th>Scadenza</th><th>Importo</th><th aria-label="Azioni" /></tr></thead>
            <tbody>
              {rate.map((r) => (
                <tr key={r.id} className={r.stato !== 'da_pagare' ? 'gestita' : undefined}>
                  <td>
                    {r.allievo_id
                      ? <Link className="persona-nome" href={`/gestione/persone/${r.allievo_id}`}>{r.allievo_cognome} {r.allievo_nome}</Link>
                      : <span className="persona-nome">{r.titolare_nome} {r.titolare_cognome}</span>}
                    {r.telefono && <div className="piccolo muto">{r.telefono}</div>}
                  </td>
                  <td className="piccolo">{r.descrizione}<div className="muto">rata {r.numero} di {r.di}</div></td>
                  <td className="piccolo">
                    {dataBreve(r.scadenza)}
                    {r.stato === 'da_pagare' && <div className={r.scaduta ? 'scaduta' : r.giorni <= 7 ? 'vicina' : 'muto'}>{quando(r.giorni)}</div>}
                    {r.stato === 'pagata' && <div className="muto">pagata</div>}
                  </td>
                  <td><strong>{euro(r.importo_cent)}</strong></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {r.stato === 'da_pagare' && (
                      <>
                        <button className="btn btn-piccolo btn-primario" disabled={invio} onClick={() => incassa(r)}>Incassa</button>{' '}
                        <button className="link-btn piccolo" onClick={() => annullaPiano(r)}>annulla piano</button>
                        {online && <> <LinkPagamento rataId={r.id} telefono={r.telefono} nome={r.allievo_nome} /></>}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
