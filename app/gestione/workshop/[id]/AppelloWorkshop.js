'use client';
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { euro } from '@/lib/formato';
import { giornoOra } from '@/lib/workshop';

// L'appello di un workshop, un momento (giorno) alla volta: ci sono solo le persone iscritte a quel momento
// (con un'opzione che lo comprende). Si tocca il nome per segnarlo presente (di nuovo per toglierlo).
// Accanto: chi deve ancora pagare, il certificato scaduto (se serve), gli esterni.
const oggiRoma = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
const giornoDi = (iso) => (iso ? new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }) : '');

// il momento da aprire: quello chiesto, se no quello di oggi (il primo non ancora finito), se no il prossimo, se no l'ultimo
function momentoGiusto(momenti, chiesto) {
  if (chiesto && momenti.some((m) => m.id === chiesto)) return chiesto;
  const oggi = oggiRoma(); const adesso = Date.now();
  const diOggi = momenti.filter((m) => giornoDi(m.inizio) === oggi);
  const inCorso = diOggi.find((m) => new Date(m.fine || m.inizio).getTime() + 30 * 60000 >= adesso);
  if (inCorso || diOggi.length) return (inCorso || diOggi[diOggi.length - 1]).id;
  const prossimo = momenti.find((m) => new Date(m.inizio).getTime() > adesso);
  return (prossimo || momenti[momenti.length - 1])?.id || null;
}

export default function AppelloWorkshop({ workshop: w, momenti, opzioni, iscrizioni, momentoIniziale, onIncassa }) {
  const router = useRouter();
  const [momento, setMomento] = useState(() => momentoGiusto(momenti, momentoIniziale));
  // presenze segnate qui (si vede subito, il database si aggiorna dietro)
  const [segnate, setSegnate] = useState(() => Object.fromEntries(iscrizioni.map((i) => [i.id, i.presenze || []])));
  const [lavoro, setLavoro] = useState('');
  const [errore, setErrore] = useState('');
  const [soloDaSegnare, setSoloDaSegnare] = useState(false);
  // le altre schede (iscritti, numeri in alto) si aggiornano poco dopo l'ultimo tocco, non a ogni tocco
  const timer = useRef(null);
  const aggiornaDopo = () => { clearTimeout(timer.current); timer.current = setTimeout(() => router.refresh(), 1200); };

  const m = momenti.find((x) => x.id === momento);
  const giorno = m ? giornoDi(m.inizio) : '';
  const opzioniDelMomento = new Set(opzioni.filter((o) => (o.momenti || []).includes(momento)).map((o) => o.id));
  const persone = useMemo(() => iscrizioni
    .filter((i) => i.stato === 'iscritto' && opzioniDelMomento.has(i.opzione_id))
    .sort((a, b) => `${a.allievi?.cognome} ${a.allievi?.nome}`.localeCompare(`${b.allievi?.cognome} ${b.allievi?.nome}`, 'it')),
  [iscrizioni, momento]); // eslint-disable-line react-hooks/exhaustive-deps
  const presente = (i) => (segnate[i.id] || []).includes(momento);
  const quanti = persone.filter(presente).length;
  const visibili = soloDaSegnare ? persone.filter((i) => !presente(i)) : persone;

  async function cambia(i, valore) {
    setErrore('');
    const prima = segnate[i.id] || [];
    setSegnate((s) => ({ ...s, [i.id]: valore ? [...new Set([...prima, momento])] : prima.filter((x) => x !== momento) }));
    const { error } = await supabaseBrowser().rpc('presenza_workshop', { p_iscrizione: i.id, p_momento: momento, p_presente: valore });
    if (error) {
      setSegnate((s) => ({ ...s, [i.id]: prima }));
      setErrore('Non salvato: controlla la connessione e riprova.');
      return;
    }
    aggiornaDopo();
  }
  async function tutti() {
    const mancano = persone.filter((i) => !presente(i));
    if (!mancano.length || !confirm(`Segnare presenti tutti i ${mancano.length} che mancano?`)) return;
    setLavoro('Segno tutti…');
    for (const i of mancano) await cambia(i, true);   // uno alla volta: pochi, e se uno non va gli altri restano
    setLavoro('');
  }

  if (!momenti.length) return <div className="vuoto">Il workshop non ha ancora momenti.</div>;
  const cert = (i) => !w.certificato_richiesto || (i.allievi?.certificato_scadenza && i.allievi.certificato_scadenza >= giorno);
  const daPagare = (i) => i.pagamenti && i.pagamenti.stato !== 'pagato';

  return (
    <section className="wsa" aria-label="Appello del workshop">
      {momenti.length > 1 && (
        <div className="segmenti wsa-momenti" role="group" aria-label="Quale giorno">
          {momenti.map((x) => (
            <button key={x.id} type="button" aria-pressed={x.id === momento} onClick={() => setMomento(x.id)}>
              {x.titolo} · {new Date(x.inizio).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Rome' })}
            </button>
          ))}
        </div>
      )}
      {m && (
        <div className="wsa-testa">
          <div>
            <strong>{m.titolo} · {giornoOra(m.inizio, m.fine).replace(/^\w/, (c) => c.toUpperCase())}</strong>
            <span className="piccolo muto">{[m.sale?.nome, `${persone.length} ${persone.length === 1 ? 'iscritto' : 'iscritti'}`].filter(Boolean).join(' · ')}</span>
          </div>
          <div className="wsa-conto" aria-live="polite"><strong>{quanti}</strong><span>/ {persone.length} presenti</span></div>
        </div>
      )}
      <div className="wsa-azioni">
        <label className="spunta"><input type="checkbox" checked={soloDaSegnare} onChange={(e) => setSoloDaSegnare(e.target.checked)} /><span>Solo chi manca</span></label>
        {persone.length > quanti && <button type="button" className="link-btn piccolo" disabled={!!lavoro} onClick={tutti}>Tutti presenti</button>}
        {lavoro && <span className="piccolo" role="status">{lavoro}</span>}
      </div>
      {errore && <div className="errore" role="alert">{errore}</div>}
      {persone.length === 0 ? (
        <div className="vuoto">Nessuno iscritto a questo momento.</div>
      ) : (
        <ul className="wsa-elenco">
          {visibili.map((i) => {
            const si = presente(i);
            const o = opzioni.find((x) => x.id === i.opzione_id);
            return (
              <li key={i.id} className={si ? 'presente' : ''}>
                <button type="button" className="wsa-persona" aria-pressed={si} onClick={() => cambia(i, !si)}>
                  <span className="wsa-spunta" aria-hidden="true">{si ? '✓' : ''}</span>
                  <span className="wsa-nome">
                    <strong>{i.allievi?.cognome} {i.allievi?.nome}</strong>
                    <span className="piccolo muto">{[opzioni.length > 1 && o?.nome, i.esterno && 'esterno/a'].filter(Boolean).join(' · ')}</span>
                  </span>
                </button>
                <span className="wsa-tag">
                  {daPagare(i) && (
                    <button type="button" className="tag tag-attenzione wsa-paga" onClick={() => onIncassa?.(i)} title="Vai a incassare">
                      da pagare {euro((i.prezzo_cent || 0) + (i.quota_cent || 0))}
                    </button>
                  )}
                  {!cert(i) && <span className="tag tag-rosso">manca il certificato</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
