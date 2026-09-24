'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { euro, dataBreve } from '@/lib/formato';

export default function Ricevute({ righe, mancanti, riepilogo, dal, al }) {
  const router = useRouter();
  const [scelti, setScelti] = useState([]);
  const [periodo, setPeriodo] = useState({ dal, al });
  const [errore, setErrore] = useState('');
  const [avviso, setAvviso] = useState('');
  const [invio, setInvio] = useState(false);

  const spunta = (id) => setScelti((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));

  async function emetti(ids) {
    if (ids.length === 0) return;
    if (!confirm(`Emettere ${ids.length} ricevute? La numerazione è progressiva e non si può riusare.`)) return;
    setInvio(true); setErrore(''); setAvviso('');
    const { data, error } = await supabaseBrowser().rpc('emetti_ricevute_blocco', { p_pagamenti: ids });
    setInvio(false);
    if (error) { setErrore('Emissione non riuscita.'); return; }
    setAvviso(`Emesse ${data.emesse} ricevute${(data.saltate || []).length ? `, ${data.saltate.length} saltate` : ''}.`);
    setScelti([]); router.refresh();
  }

  async function annulla(r) {
    const motivo = prompt(`Perché annulli la ricevuta n. ${r.numero}? Il numero resta occupato.`);
    if (!motivo) return;
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().rpc('annulla_ricevuta', { p_id: r.id, p_motivo: motivo });
    setInvio(false);
    if (error) { setErrore('Annullamento non riuscito.'); return; }
    router.refresh();
  }

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Conti</div>
        <h1>Ricevute</h1>
        <p>Ricevute non fiscali con IVA a zero per quote e abbonamenti. Le fatture restano al commercialista.</p>
      </div>

      {errore && <div className="errore" role="alert">{errore}</div>}
      {avviso && <div className="errore" style={{ background: 'var(--ok-tenue)', color: 'var(--ok)' }}>{avviso}</div>}

      <div className="griglia" style={{ marginBottom: 14 }}>
        <div className="tessera tessera-rossa">
          <div className="etichetta">Emesse nel periodo</div>
          <div className="cifra">{riepilogo.quante ?? 0}</div>
          <div className="sotto">
            {riepilogo.dal_numero ? `dalla n. ${riepilogo.dal_numero} alla n. ${riepilogo.al_numero}` : '—'}
          </div>
        </div>
        <div className="tessera">
          <div className="etichetta">Totale</div>
          <div className="cifra">{euro(riepilogo.totale_cent || 0)}</div>
          <div className="sotto">{riepilogo.annullate ?? 0} annullate</div>
        </div>
        <div className="tessera tessera-nera">
          <div className="etichetta">Incassi senza ricevuta</div>
          <div className="cifra">{mancanti.length}</div>
          <div className="sotto">nel periodo scelto</div>
        </div>
      </div>

      <div className="scheda" style={{ marginBottom: 16 }}>
        <div className="riga-2">
          <div className="campo"><label htmlFor="d1">Dal</label>
            <input id="d1" type="date" value={periodo.dal} onChange={(e) => setPeriodo({ ...periodo, dal: e.target.value })} /></div>
          <div className="campo"><label htmlFor="d2">Al</label>
            <input id="d2" type="date" value={periodo.al} onChange={(e) => setPeriodo({ ...periodo, al: e.target.value })} /></div>
        </div>
        <div className="azioni-riga">
          <Link className="btn" href={`/gestione/ricevute?dal=${periodo.dal}&al=${periodo.al}`}>Mostra il periodo</Link>
          <a className="link-btn" href={`/api/incassi/csv?dal=${periodo.dal}&al=${periodo.al}`}>CSV per il commercialista</a>
        </div>
      </div>

      {mancanti.length > 0 && (
        <>
          <h2 className="sezione">Da emettere</h2>
          <div className="azioni-riga" style={{ marginBottom: 10 }}>
            <button className="btn" onClick={() => setScelti(scelti.length === mancanti.length ? [] : mancanti.map((m) => m.pagamento_id))}>
              {scelti.length === mancanti.length ? 'Togli la spunta a tutti' : 'Spunta tutti'}
            </button>
            <button className="btn btn-primario" disabled={invio || scelti.length === 0} onClick={() => emetti(scelti)}>
              Emetti {scelti.length} ricevute
            </button>
          </div>
          <ul className="elenco">
            {mancanti.map((m) => (
              <li key={m.pagamento_id} className="persona">
                <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <label className="spunta" style={{ margin: 0 }}>
                    <input type="checkbox" checked={scelti.includes(m.pagamento_id)}
                           onChange={() => spunta(m.pagamento_id)} aria-label={`Ricevuta per ${m.descrizione}`} />
                    <span />
                  </label>
                  <span>
                    {m.descrizione}
                    <span className="piccolo muto" style={{ display: 'block' }}>
                      {dataBreve(m.data)} · {m.cliente} · {m.metodo || 'metodo non indicato'}
                    </span>
                  </span>
                </span>
                <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <strong>{euro(m.importo_cent)}</strong>
                  <button className="link-btn piccolo" disabled={invio} onClick={() => emetti([m.pagamento_id])}>emetti</button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className="sezione">Emesse</h2>
      {righe.length === 0 && <div className="vuoto">Nessuna ricevuta in questo periodo.</div>}

      <ul className="elenco">
        {righe.map((r) => (
          <li key={r.id} className="persona">
            <span>
              <strong style={{ color: 'var(--nero)' }}>n. {r.numero}/{r.anno}</strong> · {r.intestatario}
              <span className="piccolo muto" style={{ display: 'block' }}>
                {dataBreve(r.data)} · {r.descrizione} · {r.metodo || 'metodo non indicato'}
                {r.annullata && ` · ANNULLATA: ${r.motivo_annullo}`}
              </span>
            </span>
            <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <strong style={{ textDecoration: r.annullata ? 'line-through' : 'none' }}>{euro(r.importo_cent)}</strong>
              <Link className="link-btn piccolo" href={`/gestione/ricevute/${r.id}`} target="_blank">stampa</Link>
              {!r.annullata && (
                <button className="link-btn piccolo pericolo" disabled={invio} onClick={() => annulla(r)}>annulla</button>
              )}
            </span>
          </li>
        ))}
      </ul>

      <p className="piccolo muto" style={{ marginTop: 18 }}>
        Sono documenti non fiscali, con IVA a zero: la numerazione riparte da 1 ogni anno ed è senza buchi, e una
        ricevuta annullata tiene comunque il suo numero. La dicitura stampata in fondo si cambia in
        Struttura → Sede e contatti.
      </p>
    </>
  );
}
