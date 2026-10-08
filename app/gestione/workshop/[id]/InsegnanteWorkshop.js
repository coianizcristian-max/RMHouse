'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { euro, dataBreve } from '@/lib/formato';

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const centDa = (t) => {
  const s = String(t ?? '').trim().replace(/[€\s]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  const n = Number(s);
  return s !== '' && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN;
};
const oggiRoma = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });

// L'insegnante del workshop e il suo compenso.
// • Della scuola: il compenso va da solo nel cedolino del mese in cui il workshop finisce (query 150).
// • Esterno/a: il riepilogo da allegare alla sua ricevuta o fattura e il pagamento, che finisce nei Costi.
export default function InsegnanteWorkshop({ workshop: w, conti, fine, cedolino, nomeStaff }) {
  const router = useRouter();
  const [f, setF] = useState({ importo: ((conti.compenso || 0) / 100).toString().replace('.', ','), data: oggiRoma(), metodo: 'bonifico', documento: '' });
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState('');
  const finito = fine && new Date(fine).getTime() <= Date.now();
  const d = fine ? new Date(fine) : null;
  const mese = d ? `${MESI[Number(d.toLocaleDateString('it-IT', { month: 'numeric', timeZone: 'Europe/Rome' })) - 1]} ${d.toLocaleDateString('it-IT', { year: 'numeric', timeZone: 'Europe/Rome' })}` : '';
  const anno = d ? Number(d.toLocaleDateString('it-IT', { year: 'numeric', timeZone: 'Europe/Rome' })) : null;
  const meseN = d ? Number(d.toLocaleDateString('it-IT', { month: 'numeric', timeZone: 'Europe/Rome' })) : null;
  const come = w.compenso_tipo === 'fisso' ? 'fisso'
    : w.compenso_tipo === 'percentuale' ? `${Number(w.compenso_percentuale || 0).toLocaleString('it-IT')}% di ${euro(conti.incassato)} incassati (senza le quote annuali)` : null;

  async function paga(e) {
    e.preventDefault();
    const imp = centDa(f.importo);
    if (!Number.isFinite(imp) || imp <= 0) { setErrore('Scrivi l\'importo pagato (es. 150 oppure 150,50).'); return; }
    setInvio(true); setErrore('');
    const { error } = await supabaseBrowser().rpc('paga_compenso_workshop', {
      p_workshop: w.id, p_data: f.data || null, p_metodo: f.metodo, p_documento: f.documento || null, p_importo_cent: imp,
    });
    setInvio(false);
    if (error) {
      setErrore(error.message?.includes('gia_pagato') ? 'Risulta già pagato.' : error.message?.includes('insegnante_della_scuola')
        ? 'È un insegnante della scuola: il compenso va nel suo cedolino.' : 'Non registrato: riprova.');
      return;
    }
    router.refresh();
  }
  async function annulla() {
    if (!confirm('Togliere il pagamento registrato? Si toglie anche la spesa dai Costi.')) return;
    const { error } = await supabaseBrowser().rpc('annulla_compenso_workshop', { p_workshop: w.id });
    if (error) { setErrore('Non riuscito: riprova.'); return; }
    router.refresh();
  }

  return (
    <div className="wsi">
      <section className="pannello">
        <h2 style={{ marginTop: 0 }}>{w.insegnante || 'Insegnante non indicato'}
          <span className={`tag ${w.insegnante_id ? 'tag-ok' : 'tag-neutro'}`} style={{ marginLeft: 8, verticalAlign: 'middle' }}>
            {w.insegnante_id ? 'della scuola' : 'esterno/a'}</span></h2>
        {!w.compenso_tipo ? (
          <p className="muto">Nessun compenso indicato: si mette in Modifica → Insegnante e conti.</p>
        ) : (
          <div className="wsi-conto">
            <span className="etichetta">Compenso</span>
            <strong>{euro(w.compenso_pagato_cent ?? conti.compenso)}</strong>
            <span className="piccolo muto">{come}{conti.daIncassare > 0 && w.compenso_tipo === 'percentuale'
              ? ` · se si incassano anche i ${euro(conti.daIncassare)} che mancano, cresce` : ''}</span>
          </div>
        )}
        <p className="azioni" style={{ marginTop: 10 }}>
          <a className="btn btn-piccolo" href={`/gestione/workshop/${w.id}/riepilogo`} target="_blank" rel="noreferrer">
            Riepilogo per l&apos;insegnante (stampa o PDF) ↗</a>
        </p>
        <p className="piccolo muto" style={{ margin: 0 }}>Nel riepilogo i partecipanti hanno solo il nome e l&apos;iniziale del cognome.</p>
      </section>

      {w.insegnante_id ? (
        <section className="pannello">
          <h3 style={{ marginTop: 0 }}>Nel cedolino</h3>
          {!w.compenso_tipo ? <p className="muto">Senza compenso non va nel cedolino.</p>
            : !finito ? <p>Il compenso entra nel cedolino di <strong>{mese}</strong> di {nomeStaff || w.insegnante} quando il workshop è finito
                e si calcolano i compensi di quel mese.</p>
            : cedolino ? (
              <p>È nel cedolino di <strong>{mese}</strong> di {nomeStaff || w.insegnante} ({cedolino.stato === 'pagato' ? 'pagato' : cedolino.stato === 'approvato' ? 'approvato' : 'in bozza'},
                totale {euro(cedolino.totale_cent)}). <Link prefetch={false} href={`/gestione/compensi/${cedolino.id}`}>Apri il cedolino</Link>
                {cedolino.stato === 'bozza' && <span className="piccolo muto"> · se cambiano gli incassi, ricalcola i compensi di {mese}.</span>}</p>
            ) : (
              <p>Va nel cedolino di <strong>{mese}</strong> di {nomeStaff || w.insegnante}: calcola i compensi di quel mese.{' '}
                <Link prefetch={false} href={`/gestione/compensi?anno=${anno}&mese=${meseN}`}>Vai ai compensi</Link></p>
            )}
        </section>
      ) : (
        <section className="pannello">
          <h3 style={{ marginTop: 0 }}>Pagamento all&apos;insegnante</h3>
          {w.compenso_pagato_at ? (
            <p>
              Pagato il <strong>{dataBreve(w.compenso_pagato_at)}</strong>: {euro(w.compenso_pagato_cent)}{w.compenso_metodo ? ` con ${w.compenso_metodo}` : ''}
              {w.compenso_documento ? ` · ${w.compenso_documento}` : ''}. È nei <Link prefetch={false} href="/gestione/costi">Costi</Link> (compensi).{' '}
              <button type="button" className="link-btn piccolo" onClick={annulla}>togli</button>
            </p>
          ) : (
            <form onSubmit={paga} className="wsi-paga">
              <p className="piccolo muto" style={{ marginTop: 0 }}>
                L&apos;insegnante ti dà la sua ricevuta (prestazione occasionale) o fattura: allega il riepilogo e registra qui il pagamento.
                Finisce nei Costi come compenso.
              </p>
              <div className="wsi-campi">
                <div className="campo"><label htmlFor="wsi-imp">Importo €</label>
                  <input id="wsi-imp" inputMode="decimal" value={f.importo} onChange={(e) => setF({ ...f, importo: e.target.value })} /></div>
                <div className="campo"><label htmlFor="wsi-data">Pagato il</label>
                  <input id="wsi-data" type="date" value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /></div>
                <div className="campo"><label htmlFor="wsi-met">Come</label>
                  <select id="wsi-met" value={f.metodo} onChange={(e) => setF({ ...f, metodo: e.target.value })}>
                    <option value="bonifico">Bonifico</option><option value="contanti">Contanti</option><option value="altro">Altro</option>
                  </select></div>
                <div className="campo wsi-doc"><label htmlFor="wsi-doc">Documento dell&apos;insegnante</label>
                  <input id="wsi-doc" value={f.documento} onChange={(e) => setF({ ...f, documento: e.target.value })}
                         placeholder="es. Ricevuta prestazione occasionale n. 3 / Fattura n. 12 del 20/10" /></div>
              </div>
              {errore && <div className="errore" role="alert">{errore}</div>}
              <button className="btn btn-primario" disabled={invio}>{invio ? 'Registro…' : 'Registra il pagamento'}</button>
            </form>
          )}
          {errore && w.compenso_pagato_at && <div className="errore" role="alert">{errore}</div>}
        </section>
      )}
    </div>
  );
}
