'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { euro, dataBreve } from '@/lib/formato';
import LinkPagamento from '../LinkPagamento';

const CAUSALI = [
  ['quota_iscrizione', 'Quota annuale'], ['abbonamento', 'Abbonamento'], ['prova', 'Lezione di prova'],
  ['evento', 'Evento o stage'], ['spazio', 'Affitto sala'], ['materiale', 'Materiale'], ['altro', 'Altro'],
];
const METODI = [['contanti', 'Contanti'], ['bonifico', 'Bonifico'], ['pos', 'POS'], ['online', 'Online'], ['assegno', 'Assegno'], ['altro', 'Altro']];
const NOME = (k) => (CAUSALI.find(([v]) => v === k) || [null, k])[1];

export default function Incassi({ palestraId, righe, totali, dal, al, stato, online = false }) {
  const router = useRouter();
  const [apri, setApri] = useState(false);
  const [f, setF] = useState({ importo: '', causale: 'quota_iscrizione', metodo: 'contanti', descrizione: '', cerca: '', account_id: '', allievo_id: '' });
  const [trovati, setTrovati] = useState([]);
  const [errore, setErrore] = useState('');
  const [periodo, setPeriodo] = useState({ dal, al });
  const [invio, setInvio] = useState(false);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function cerca(testo) {
    setF({ ...f, cerca: testo, account_id: '', allievo_id: '' });
    if (testo.trim().length < 2) { setTrovati([]); return; }
    const { data } = await supabaseBrowser().from('v_persone')
      .select('id, nome, cognome, account_id, titolare_nome, titolare_cognome')
      .eq('palestra_id', palestraId).ilike('ricerca', `%${testo.trim().toLowerCase()}%`).limit(8);
    setTrovati(data || []);
  }

  async function registra(e) {
    e.preventDefault();
    const importo = parseFloat((f.importo || '').replace(',', '.'));
    if (!Number.isFinite(importo) || importo <= 0) { setErrore("Scrivi l'importo."); return; }
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().rpc('registra_incasso', {
      p: {
        palestra_id: palestraId, account_id: f.account_id || null, allievo_id: f.allievo_id || null,
        causale: f.causale, metodo: f.metodo, importo_cent: Math.round(importo * 100),
        descrizione: f.descrizione || NOME(f.causale), incassato: true,
      },
    });
    setInvio(false);
    if (error) { setErrore('Registrazione non riuscita.'); return; }
    setApri(false); setF({ ...f, importo: '', descrizione: '', cerca: '', account_id: '', allievo_id: '' });
    setTrovati([]); router.refresh();
  }

  async function incassa(r) {
    const metodo = prompt('Come è stato pagato? contanti, bonifico, pos, online, assegno, altro', 'contanti');
    if (!metodo) return;
    const { error } = await supabaseBrowser().rpc('segna_pagato', { p_pagamento: r.id, p_metodo: metodo.trim().toLowerCase() });
    if (error) { setErrore('Metodo non valido o operazione non riuscita.'); return; }
    router.refresh();
  }

  async function annulla(r) {
    const motivo = prompt('Motivo dell\'annullamento:');
    if (motivo === null) return;
    await supabaseBrowser().rpc('annulla_pagamento', { p_pagamento: r.id, p_motivo: motivo || null });
    router.refresh();
  }

  const perMetodo = Object.entries(totali.per_metodo || {});

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Conti</div>
        <h1>Incassi</h1>
        <p>Quello che entra: quote, abbonamenti, prove, affitti. E cosa resta da incassare.</p>
      </div>

      {errore && <div className="errore" role="alert">{errore}</div>}

      <div className="griglia">
        <div className="tessera tessera-rossa">
          <div className="etichetta">Incassato nel periodo</div>
          <div className="cifra">{euro(totali.incassato_cent || 0)}</div>
          <div className="sotto">{dataBreve(dal)} – {dataBreve(al)}</div>
        </div>
        <Link className="tessera" href="/gestione/incassi?stato=attesa">
          <div className="etichetta">Da incassare</div>
          <div className="cifra">{euro(totali.da_incassare_cent || 0)}</div>
          <div className="sotto">vedi l'elenco</div>
        </Link>
        {perMetodo.map(([m, tot]) => (
          <div key={m} className="tessera">
            <div className="etichetta">{(METODI.find(([v]) => v === m) || [null, m])[1]}</div>
            <div className="cifra">{euro(tot)}</div>
          </div>
        ))}
      </div>

      <div className="filtri" style={{ marginTop: 14 }}>
        <Link href="/gestione/incassi" aria-current={stato !== 'attesa' ? 'true' : undefined}>Ultimi 30 giorni</Link>
        <Link href="/gestione/incassi?stato=attesa" aria-current={stato === 'attesa' ? 'true' : undefined}>Da incassare</Link>
      </div>

      <div className="scheda" style={{ marginTop: 14 }}>
        <strong style={{ color: 'var(--nero)' }}>Esportazione per il commercialista</strong>
        <p className="piccolo muto" style={{ marginTop: 4 }}>
          Una riga per incasso con data, causale, importo, metodo, cliente e codice fiscale, più il totale in fondo.
        </p>
        <div className="riga-2">
          <div className="campo"><label htmlFor="ed">Dal</label>
            <input id="ed" type="date" value={periodo.dal} onChange={(e) => setPeriodo({ ...periodo, dal: e.target.value })} /></div>
          <div className="campo"><label htmlFor="ea">Al</label>
            <input id="ea" type="date" value={periodo.al} onChange={(e) => setPeriodo({ ...periodo, al: e.target.value })} /></div>
        </div>
        <div className="azioni-riga">
          <a className="btn" href={`/api/incassi/csv?dal=${periodo.dal}&al=${periodo.al}`}>Scarica il CSV</a>
          <a className="link-btn piccolo" href={`/gestione/incassi?dal=${periodo.dal}&al=${periodo.al}`}>Mostra questo periodo</a>
        </div>
      </div>

      {apri ? (
        <form onSubmit={registra} style={{ marginTop: 16 }}>
          <h3>Registra un incasso</h3>
          <div className="campo">
            <label htmlFor="im">Importo (€)</label>
            <input id="im" inputMode="decimal" value={f.importo} onChange={set('importo')} autoFocus />
          </div>
          <div className="campo">
            <label htmlFor="ca">Per cosa</label>
            <select id="ca" value={f.causale} onChange={set('causale')}>
              {CAUSALI.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="me">Come</label>
            <select id="me" value={f.metodo} onChange={set('metodo')}>
              {METODI.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="de">Descrizione</label>
            <input id="de" value={f.descrizione} onChange={set('descrizione')} placeholder={NOME(f.causale)} />
          </div>
          <div className="campo">
            <label htmlFor="pe">Da chi (facoltativo)</label>
            <input id="pe" value={f.cerca} onChange={(e) => cerca(e.target.value)} placeholder="Cognome o nome" />
            {f.account_id && <span className="piccolo">Collegato a {f.cerca}</span>}
            {trovati.length > 0 && !f.account_id && (
              <ul className="elenco">
                {trovati.map((p) => (
                  <li key={p.id} className="persona">
                    <span>{p.cognome} {p.nome}<span className="piccolo muto" style={{ display: 'block' }}>paga {p.titolare_nome} {p.titolare_cognome}</span></span>
                    <button type="button" className="link-btn piccolo"
                            onClick={() => { setF({ ...f, account_id: p.account_id, allievo_id: p.id, cerca: `${p.cognome} ${p.nome}` }); setTrovati([]); }}>
                      scegli
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="azioni">
            <button className="btn btn-primario" disabled={invio}>Registra</button>
            <button type="button" className="btn" onClick={() => setApri(false)}>Annulla</button>
          </div>
        </form>
      ) : (
        <button className="btn btn-primario" style={{ marginTop: 14 }} onClick={() => setApri(true)}>Registra un incasso</button>
      )}

      {righe.length === 0 && <div className="vuoto" style={{ marginTop: 18 }}>Niente in questo periodo.</div>}

      <ul className="elenco" style={{ marginTop: 18 }}>
        {righe.map((r) => (
          <li key={r.id} className="persona">
            <span>
              <strong style={{ color: 'var(--nero)' }}>{euro(r.importo_cent)}</strong> · {r.descrizione}
              <span className="piccolo muto" style={{ display: 'block' }}>
                {NOME(r.causale)}
                {r.titolare_nome ? ` · ${r.titolare_nome} ${r.titolare_cognome || ''}` : ''}
                {r.pagato_at ? ` · incassato il ${dataBreve(r.pagato_at)}` : ` · creato il ${dataBreve(r.created_at)}`}
                {r.metodo ? ` · ${r.metodo}` : ''}
              </span>
            </span>
            <span style={{ display: 'grid', gap: 4, justifyItems: 'end' }}>
              {r.stato === 'pagato' && <span className="tag tag-ok">incassato</span>}
              {r.stato === 'in_attesa' && (
                <>
                  <span className="tag tag-attenzione">da incassare</span>
                  <button className="link-btn piccolo" onClick={() => incassa(r)}>segna incassato</button>
                  {online && <LinkPagamento pagamentoId={r.id} telefono={r.telefono} nome={r.titolare_nome} />}
                </>
              )}
              {r.stato === 'annullato' && <span className="tag tag-neutro">annullato</span>}
              {r.stato !== 'annullato' && <button className="link-btn piccolo" onClick={() => annulla(r)}>annulla</button>}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
