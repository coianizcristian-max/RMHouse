'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { leggiCsv, leggiData, indovina } from '@/lib/csv';
import { euro, dataBreve } from '@/lib/formato';
import SceltaFile from '../SceltaFile';

// impronta semplice: serve solo a non importare due volte la stessa riga
const impronta = (conto, data, importo, testo) => {
  const s = `${conto}|${data}|${importo}|${(testo || '').slice(0, 60)}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
  return `${data}-${importo}-${Math.abs(h).toString(36)}`;
};

const soldi = (v) => {
  if (v == null || v === '') return null;
  // 1.234,56 oppure 1,234.56 oppure -45,00
  let s = String(v).replace(/[^\d,.\-]/g, '');
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.')
    ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else s = s.replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

export default function Banca({ palestraId, movimenti, conti, differenze, flusso, dal, al, vista }) {
  const router = useRouter();
  const [conto, setConto] = useState(conti[0]?.id || '');
  const [anteprima, setAnteprima] = useState(null);
  const [mappa, setMappa] = useState({});
  const [errore, setErrore] = useState('');
  const [avviso, setAvviso] = useState('');
  const [invio, setInvio] = useState(false);
  const [aperto, setAperto] = useState(null);
  const [proposte, setProposte] = useState([]);

  function leggiFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const lettore = new FileReader();
    lettore.onload = () => {
      const { intestazioni, righe } = leggiCsv(String(lettore.result));
      if (!righe.length) { setErrore('Il file sembra vuoto.'); return; }
      setAnteprima({ intestazioni, righe });
      setMappa({
        data: indovina(intestazioni, ['data', 'data contabile', 'data operazione', 'data valuta']),
        importo: indovina(intestazioni, ['importo', 'importo (eur)', 'amount']),
        entrate: indovina(intestazioni, ['entrate', 'accrediti', 'avere']),
        uscite: indovina(intestazioni, ['uscite', 'addebiti', 'dare']),
        descrizione: indovina(intestazioni, ['descrizione', 'causale', 'dettagli', 'operazione']),
      });
      setErrore('');
    };
    lettore.readAsText(file, 'utf-8');
  }

  const righeLette = () => (anteprima?.righe || []).map((r) => {
    const data = leggiData(r[mappa.data]);
    let importo = soldi(r[mappa.importo]);
    if (importo == null) {
      const e = soldi(r[mappa.entrate]) || 0;
      const u = soldi(r[mappa.uscite]) || 0;
      importo = e - Math.abs(u);
    }
    const descrizione = (r[mappa.descrizione] || '').slice(0, 300);
    return { data, importo, descrizione };
  }).filter((r) => r.data && r.importo != null && r.importo !== 0);

  async function importa() {
    const righe = righeLette();
    if (!conto) { setErrore('Scegli il conto.'); return; }
    if (!righe.length) { setErrore('Nessuna riga leggibile: controlla le colonne scelte.'); return; }

    setInvio(true); setErrore(''); setAvviso('');
    const dati = righe.map((r) => ({
      palestra_id: palestraId, conto_id: conto, data: r.data, importo_cent: r.importo,
      descrizione: r.descrizione, impronta: impronta(conto, r.data, r.importo, r.descrizione),
    }));

    // le righe già presenti vengono ignorate grazie all'impronta
    const { error, count } = await supabaseBrowser().from('movimenti_banca')
      .upsert(dati, { onConflict: 'palestra_id,impronta', ignoreDuplicates: true, count: 'exact' });
    setInvio(false);
    if (error) { setErrore('Importazione non riuscita.'); return; }
    setAvviso(`Importate ${count ?? dati.length} righe (le ripetute sono state saltate).`);
    setAnteprima(null); router.refresh();
  }

  async function automatica() {
    setInvio(true); setErrore(''); setAvviso('');
    const { data, error } = await supabaseBrowser().rpc('riconcilia_automatica', { p_palestra: palestraId, p_dal: dal });
    setInvio(false);
    if (error) { setErrore('Operazione non riuscita.'); return; }
    setAvviso(`Abbinati in automatico ${data.abbinati} movimenti.`);
    router.refresh();
  }

  async function apri(m) {
    if (aperto === m.id) { setAperto(null); return; }
    setAperto(m.id); setProposte([]);
    // in entrata si cercano gli incassi, in uscita le spese e le fatture
    const funzione = m.importo_cent > 0 ? 'proposte_movimento' : 'proposte_uscita';
    const { data } = await supabaseBrowser().rpc(funzione, { p_movimento: m.id });
    setProposte((data || []).map((p) => ({ ...p, uscita: m.importo_cent < 0 })));
  }

  async function abbina(m, p) {
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().rpc('abbina_movimento', {
      p_movimento: m.id,
      p_pagamento: p.uscita ? null : p.pagamento_id,
      p_spesa: p.uscita ? p.spesa_id : null,
      p_compenso: null,
    });
    setInvio(false);
    if (error) { setErrore('Abbinamento non riuscito.'); return; }
    setAperto(null); router.refresh();
  }

  async function ignora(m) {
    const nota = prompt('Perché lo ignori? (commissioni, giroconto, spesa personale…)');
    if (nota === null) return;
    await supabaseBrowser().rpc('ignora_movimento', { p_movimento: m.id, p_nota: nota || null });
    router.refresh();
  }

  const senzaIncasso = differenze.movimenti_senza_incasso || [];
  const senzaMovimento = differenze.incassi_senza_movimento || [];

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Conti</div>
        <h1>Banca e cassa</h1>
        <p>Carichi l'estratto conto e il gestionale lo incrocia con gli incassi registrati.</p>
      </div>

      {errore && <div className="errore" role="alert">{errore}</div>}
      {avviso && <div className="errore" style={{ background: 'var(--ok-tenue)', color: 'var(--ok)' }}>{avviso}</div>}

      <div className="griglia" style={{ marginBottom: 14 }}>
        <div className="tessera tessera-rossa">
          <div className="etichetta">Entrate nel periodo</div>
          <div className="cifra">{euro(flusso.entrate_cent || 0)}</div>
          <div className="sotto">{dataBreve(dal)} – {dataBreve(al)}</div>
        </div>
        <div className="tessera">
          <div className="etichetta">Uscite</div>
          <div className="cifra">{euro(flusso.uscite_cent || 0)}</div>
          <div className="sotto">spese e compensi pagati</div>
        </div>
        <div className="tessera tessera-nera">
          <div className="etichetta">Saldo di periodo</div>
          <div className="cifra">{euro(flusso.saldo_cent || 0)}</div>
          <div className="sotto">{euro(differenze.contanti_non_versati_cent || 0)} contanti non versati</div>
        </div>
      </div>

      <div className="scheda" style={{ marginBottom: 16 }}>
        <strong style={{ color: 'var(--nero)' }}>Carica l'estratto conto</strong>
        <p className="piccolo muto" style={{ marginTop: 4 }}>
          Scarica il CSV dal tuo home banking e caricalo qui: le righe già importate vengono riconosciute e saltate.
        </p>
        <div className="riga-2">
          <div className="campo">
            <label htmlFor="co">Conto</label>
            <select id="co" value={conto} onChange={(e) => setConto(e.target.value)}>
              {conti.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="fi">File CSV</label>
            <SceltaFile id="fi" accept=".csv,text/csv" onChange={leggiFile}
                        titolo="Scegli l'estratto conto" aiuto="Tocca o trascina qui il file CSV del tuo home banking" />
          </div>
        </div>

        {anteprima && (
          <>
            <h3>Abbina le colonne</h3>
            <div className="riga-2">
              {[['data', 'Data'], ['importo', 'Importo (unica colonna)'], ['entrate', 'Entrate'], ['uscite', 'Uscite'], ['descrizione', 'Descrizione']].map(([k, l]) => (
                <div className="campo" key={k}>
                  <label htmlFor={`m-${k}`}>{l}</label>
                  <select id={`m-${k}`} value={mappa[k] || ''} onChange={(e) => setMappa({ ...mappa, [k]: e.target.value })}>
                    <option value="">— nessuna —</option>
                    {anteprima.intestazioni.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <p className="piccolo muto">
              Se la banca usa una sola colonna con segno, scegli "Importo" e lascia vuote entrate e uscite.
            </p>
            <ul className="elenco">
              {righeLette().slice(0, 5).map((r, i) => (
                <li key={i} className="persona">
                  <span>{dataBreve(r.data)} · {r.descrizione.slice(0, 60)}</span>
                  <strong style={{ color: r.importo > 0 ? 'var(--ok)' : 'var(--rosso-scuro)' }}>{euro(r.importo)}</strong>
                </li>
              ))}
            </ul>
            <div className="azioni-riga">
              <button className="btn btn-primario" disabled={invio} onClick={importa}>
                Importa {righeLette().length} movimenti
              </button>
              <button className="link-btn" onClick={() => setAnteprima(null)}>Annulla</button>
            </div>
          </>
        )}
      </div>

      <div className="azioni-riga" style={{ marginBottom: 12 }}>
        <button className="btn" disabled={invio} onClick={automatica}>Abbina in automatico</button>
        <Link className="link-btn" href="/gestione/incassi">Vai agli incassi</Link>
      </div>

      <div className="filtri">
        {[['da_verificare', 'Da verificare'], ['abbinato', 'Abbinati'], ['ignorato', 'Ignorati'], ['tutti', 'Tutti']].map(([k, l]) => (
          <Link key={k} href={`/gestione/banca?vista=${k}&dal=${dal}&al=${al}`}
                aria-current={vista === k ? 'true' : undefined}>{l}</Link>
        ))}
      </div>

      {movimenti.length === 0 && <div className="vuoto">Nessun movimento in questo elenco.</div>}

      <ul className="elenco">
        {movimenti.map((m) => (
          <li key={m.id} style={{ padding: '12px 4px' }}>
            <div className="persona" style={{ padding: 0, alignItems: 'start' }}>
              <div>
                <strong style={{ color: 'var(--nero)' }}>{dataBreve(m.data)}</strong> · {m.descrizione}
                {m.note && <div className="piccolo muto">nota: {m.note}</div>}
              </div>
              <div style={{ display: 'grid', gap: 4, justifyItems: 'end' }}>
                <strong style={{ color: m.importo_cent > 0 ? 'var(--ok)' : 'var(--rosso-scuro)' }}>{euro(m.importo_cent)}</strong>
                {m.stato === 'abbinato' && <span className="tag tag-ok">abbinato</span>}
                {m.stato === 'ignorato' && <span className="tag tag-neutro">ignorato</span>}
              </div>
            </div>

            {m.stato === 'da_verificare' && (
              <div className="azioni-riga">
                <button className="link-btn piccolo" onClick={() => apri(m)}>
                  {aperto === m.id ? 'Chiudi' : (m.importo_cent > 0 ? 'Cerca l\'incasso' : 'Cerca la spesa')}
                </button>
                <button className="link-btn piccolo pericolo" onClick={() => ignora(m)}>Ignora</button>
              </div>
            )}

            {aperto === m.id && (
              <ul className="elenco" style={{ marginTop: 8 }}>
                {proposte.length === 0 && (
                  <li className="persona">
                    <span className="muto piccolo">
                      Niente di somigliante: se è un'entrata registrala in Incassi, se è un'uscita carica la
                      fattura in Fatture oppure scrivila in Costi.
                    </span>
                  </li>
                )}
                {proposte.map((p) => (
                  <li key={p.pagamento_id || p.spesa_id} className="persona">
                    <span>
                      {p.descrizione}
                      <span className="piccolo muto" style={{ display: 'block' }}>
                        {p.cliente || p.fornitore || '—'} · {dataBreve(p.data)}
                        {p.metodo ? ` · ${p.metodo}` : ''} · affinità {p.punteggio}%
                      </span>
                    </span>
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <strong>{euro(p.importo_cent)}</strong>
                      <button className="link-btn piccolo" disabled={invio} onClick={() => abbina(m, p)}>abbina</button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      <h2 className="sezione">Quello che non torna</h2>
      <div className="griglia-2">
        <div className="scheda">
          <strong style={{ color: 'var(--nero)' }}>Arrivati in banca senza ricevuta</strong>
          <p className="piccolo muto" style={{ marginTop: 2 }}>{senzaIncasso.length} movimenti: probabilmente incassi da registrare.</p>
          <ul className="elenco">
            {senzaIncasso.slice(0, 6).map((m) => (
              <li key={m.id} className="persona">
                <span>{dataBreve(m.data)} · {(m.descrizione || '').slice(0, 40)}</span>
                <strong>{euro(m.importo_cent)}</strong>
              </li>
            ))}
          </ul>
        </div>
        <div className="scheda">
          <strong style={{ color: 'var(--nero)' }}>Registrati ma non arrivati</strong>
          <p className="piccolo muto" style={{ marginTop: 2 }}>{senzaMovimento.length} incassi con bonifico o POS senza movimento corrispondente.</p>
          <ul className="elenco">
            {senzaMovimento.slice(0, 6).map((p) => (
              <li key={p.id} className="persona">
                <span>{dataBreve(p.data)} · {(p.descrizione || '').slice(0, 40)}<span className="piccolo muto" style={{ display: 'block' }}>{p.metodo}</span></span>
                <strong>{euro(p.importo_cent)}</strong>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="piccolo muto" style={{ marginTop: 16 }}>
        Il POS accredita il totale della giornata al netto delle commissioni: se l'importo non coincide di pochi
        centesimi, abbina lo stesso e registra la differenza come spesa di categoria "altro". I contanti compaiono
        in banca solo quando li versi, come unico movimento cumulativo.
      </p>
    </>
  );
}
