'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { dataBreve } from '@/lib/formato';
import CaricaCertificato from '../../../CaricaCertificato';

const GIORNI = ['', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];

// Dopo il pagamento con carta: aspetta la conferma (pochi secondi) e mostra l'iscrizione,
// la ricevuta da scaricare e cosa manca (certificato, moduli)
export default function Fatto({ sessione: sessioneIniziale, acquistoSatispay = '' }) {
  const [sessione, setSessione] = useState(sessioneIniziale);
  const [satispay, setSatispay] = useState(acquistoSatispay ? 'controllo' : '');   // controllo | annullato | ok
  const [e, setE] = useState(null);
  const [giri, setGiri] = useState(0);
  const [cert, setCert] = useState(false);

  // ritorno da Satispay: si chiede subito al server com'è andata (completa l'iscrizione se è pagato)
  useEffect(() => {
    if (!acquistoSatispay) return undefined;
    let vivo = true; let n = 0;
    const controlla = async () => {
      const r = await fetch(`/api/satispay/verifica?a=${encodeURIComponent(acquistoSatispay)}`);
      const d = await r.json().catch(() => ({}));
      if (!vivo) return;
      n += 1;
      if (d.stato === 'annullato') { setSatispay('annullato'); return; }
      if (d.stato === 'completato' || d.stato === 'errore') { setSatispay('ok'); setSessione(d.sessione); return; }
      if (n < 45) setTimeout(controlla, 2000); else { setSatispay('ok'); setSessione(d.sessione || ''); }
    };
    controlla();
    return () => { vivo = false; };
  }, [acquistoSatispay]);

  useEffect(() => {
    if (!sessione) return undefined;
    let vivo = true;
    let n = 0;
    const leggi = async () => {
      const { data } = await supabaseBrowser().rpc('esito_acquisto', { p_session: sessione });
      if (!vivo) return;
      setE(data || null); setGiri(++n);
      // la ricevuta arriva un attimo dopo l'iscrizione: si aspetta anche quella (al massimo ~40 secondi)
      if (n < 20 && (!data || data.stato === 'in_attesa' || (data.stato === 'completato' && !data.ricevuta))) setTimeout(leggi, 2000);
    };
    leggi();
    return () => { vivo = false; };
  }, [sessione]);

  const attesa = !e || e.stato === 'in_attesa';
  const ok = e?.stato === 'completato';

  if (satispay === 'controllo') return (
    <div className="area-casa isc isc-fatto">
      <div className="isc-attesa" role="status">
        <span className="isc-rotella" aria-hidden="true" />
        <h1>Controllo il pagamento Satispay</h1>
        <p>Se non l&apos;hai ancora confermato, fallo ora sull&apos;app Satispay: questa pagina si aggiorna da sola.</p>
      </div>
    </div>
  );
  if (satispay === 'annullato') return (
    <div className="area-casa isc isc-fatto">
      <div className="isc-attesa">
        <h1>Pagamento non completato</h1>
        <p>Su Satispay il pagamento è stato annullato o è scaduto: non ti abbiamo addebitato nulla.</p>
        <Link href="/area/iscriviti" className="btn btn-primario btn-pieno">Riprova</Link>
      </div>
    </div>
  );

  return (
    <div className="area-casa isc isc-fatto">
      {attesa && giri < 20 && (
        <div className="isc-attesa" role="status">
          <span className="isc-rotella" aria-hidden="true" />
          <h1>Pagamento ricevuto</h1>
          <p>Stiamo preparando la tua iscrizione: un attimo…</p>
        </div>
      )}
      {attesa && giri >= 20 && (
        <div className="isc-attesa">
          <h1>Pagamento ricevuto</h1>
          <p>La conferma ci sta mettendo più del solito: tra qualche minuto trovi l&apos;abbonamento in &quot;Io&quot; e le lezioni in &quot;Lezioni&quot;. Se non compare, scrivi alla segreteria.</p>
          <Link href="/area" className="btn btn-primario btn-pieno">Vai alle lezioni</Link>
        </div>
      )}
      {e && e.stato !== 'in_attesa' && !ok && (
        <div className="isc-attesa">
          <h1>Pagamento ricevuto</h1>
          <p>L&apos;iscrizione la completa la segreteria a mano (ti avvisiamo appena è fatta). Non devi pagare di nuovo.</p>
          <Link href="/area" className="btn btn-primario btn-pieno">Vai alle lezioni</Link>
        </div>
      )}
      {ok && (
        <>
          <div className="isc-ok">
            <span className="isc-spunta" aria-hidden="true">✓</span>
            <h1>Iscrizione fatta{e.persona ? ` per ${e.persona}` : ''}!</h1>
            <p><strong>{e.corso}</strong> · {e.abbonamento}</p>
            {e.giorni?.length > 0 && <p>Ogni {e.giorni.map((g) => `${GIORNI[g.giorno]} alle ${g.ora}`).join(' e ')}</p>}
            {e.dal && <p className="muto">dal {dataBreve(e.dal)} al {dataBreve(e.al)}{e.ricorrente ? ' · poi si rinnova da solo' : ''}</p>}
          </div>
          <ol className="isc-poi">
            <li className="fatto"><strong>Lezioni prenotate</strong><span>Le trovi già in &quot;Lezioni&quot;: se un giorno non puoi venire, tocca &quot;Non vengo&quot; e ti resta il recupero.</span></li>
            <li className={e.ricevuta ? 'fatto' : ''}>
              <strong>Ricevuta</strong>
              {e.ricevuta
                ? <span>Te l&apos;abbiamo mandata per email. <a href={`/ricevuta/${e.ricevuta}`} target="_blank" rel="noreferrer">Aprila o scaricala</a>.</span>
                : <span>La stiamo preparando: la trovi poi in &quot;Pagamenti e ricevute&quot;.</span>}
            </li>
            <li className={e.certificato_ok || cert ? 'fatto' : ''}>
              <strong>Certificato medico</strong>
              {e.certificato_ok ? <span>È a posto.</span> : cert ? <span>Caricato: la segreteria lo controlla.</span> : (
                <>
                  <span>Serve per fare lezione: caricalo ora (foto o PDF) o portalo in segreteria.</span>
                  <CaricaCertificato token={e.allievo_token} nome={e.persona} onFatto={() => setCert(true)} />
                </>
              )}
            </li>
            <li><strong>Moduli</strong><span>Se c&apos;è qualcosa da firmare lo trovi in <Link href="/area/moduli">Moduli e documenti</Link>.</span></li>
          </ol>
          <Link href="/area" className="btn btn-primario btn-pieno btn-grande">Vai alle mie lezioni</Link>
        </>
      )}
    </div>
  );
}
