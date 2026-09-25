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

  async function notaCredito(r) {
    const totale = (r.importo_cent + r.iva_cent) / 100;
    const importo = prompt(`Rimborso sulla ricevuta n. ${r.numero}/${r.anno}: quanto (€)? Massimo ${totale.toFixed(2).replace('.', ',')}`,
      totale.toFixed(2).replace('.', ','));
    if (!importo) return;
    const motivo = prompt('Motivo del rimborso (va stampato sulla nota di credito):');
    if (!motivo) return;
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().rpc('emetti_nota_credito', {
      p_ricevuta: r.id, p_importo_cent: Math.round(parseFloat(importo.replace(',', '.')) * 100), p_motivo: motivo,
    });
    setInvio(false);
    if (error) {
      setErrore(error.message?.includes('importo_non_valido')
        ? 'Importo non valido: non può superare quanto resta della ricevuta.' : 'Nota di credito non emessa.');
      return;
    }
    setAvviso('Nota di credito emessa.'); router.refresh();
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
        <h1>Ricevute e note di credito</h1>
        <p>Ricevute per quote e abbonamenti; i rimborsi si fanno con una nota di credito legata alla ricevuta.
          Aliquote e numerazioni si decidono in Per il commercialista.</p>
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
          <div className="etichetta">Totale netto</div>
          <div className="cifra">{euro(riepilogo.totale_cent || 0)}</div>
          <div className="sotto">{riepilogo.note_credito ?? 0} note di credito ({euro(riepilogo.rimborsi_cent || 0)}) · {riepilogo.annullate ?? 0} annullate</div>
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
              {r.tipo_documento === 'nota_credito' && <span className="tag tag-attenzione">nota di credito</span>}{' '}
              <strong style={{ color: 'var(--nero)' }}>{r.numerazioni?.codice ? `${r.numerazioni.codice} ` : ''}n. {r.numero}/{r.anno}</strong> · {r.intestatario}
              <span className="piccolo muto" style={{ display: 'block' }}>
                {dataBreve(r.data)} · {r.descrizione} · {r.metodo || 'metodo non indicato'}
                {r.annullata && ` · ANNULLATA: ${r.motivo_annullo}`}
              </span>
            </span>
            <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <strong style={{ textDecoration: r.annullata ? 'line-through' : 'none' }}>
                {r.tipo_documento === 'nota_credito' ? '−' : ''}{euro(r.importo_cent + r.iva_cent)}
              </strong>
              <Link className="link-btn piccolo" href={`/gestione/ricevute/${r.id}`} target="_blank">stampa</Link>
              {!r.annullata && r.tipo_documento !== 'nota_credito' && (
                <button className="link-btn piccolo" disabled={invio} onClick={() => notaCredito(r)}>rimborso</button>
              )}
              {!r.annullata && (
                <button className="link-btn piccolo pericolo" disabled={invio} onClick={() => annulla(r)}>annulla</button>
              )}
            </span>
          </li>
        ))}
      </ul>

      <p className="piccolo muto" style={{ marginTop: 18 }}>
        Ricevute e note di credito hanno numerazioni separate: ripartono da 1 ogni anno, senza buchi, e un documento
        annullato tiene comunque il suo numero. "Annulla" è per un documento sbagliato; "rimborso" emette una nota di
        credito quando restituisci dei soldi. La dicitura stampata in fondo si cambia in Struttura → Sede e contatti.
      </p>
    </>
  );
}
