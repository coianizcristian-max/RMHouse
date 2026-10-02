'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { pushSupportato, registrazione, iscriviPush } from '@/lib/push';

// Al primo ingresso nell'app chiediamo noi se attivare le notifiche, senza aspettare che la persona
// le cerchi in "Io". Il telefono mostra la sua richiesta di permesso solo dopo un tocco: per questo
// prima c'è il nostro foglio con "Sì, attiva".
// "Più tardi" rimanda di una settimana; dopo tre "più tardi" non lo chiediamo più (resta il pulsante in "Io").
const CHIAVE = 'rm-chiedi-notifiche';
const SETTIMANA = 7 * 24 * 3600 * 1000;
const leggi = () => { try { return JSON.parse(localStorage.getItem(CHIAVE) || '{}'); } catch { return {}; } };
const scrivi = (v) => { try { localStorage.setItem(CHIAVE, JSON.stringify(v)); } catch { /* niente */ } };

export default function ChiediNotifiche() {
  const path = usePathname();
  const [aperto, setAperto] = useState(false);
  const [fase, setFase] = useState('chiedi');   // chiedi | lavoro | fatto | bloccate

  useEffect(() => {
    if (!pushSupportato()) return;
    let finito = false; let timer;
    (async () => {
      try {
        const reg = await registrazione();
        const sub = await reg.pushManager.getSubscription();
        if (sub || finito) return;
        // permesso già dato (es. app reinstallata): ricolleghiamo il telefono senza chiedere nulla
        if (Notification.permission === 'granted') { await iscriviPush().catch(() => null); return; }
        if (Notification.permission === 'denied') return;
        const s = leggi();
        if ((s.no || 0) >= 3 || (s.dopo && Date.now() < s.dopo)) return;
        // aspettiamo che la pagina bianca col logo sia salita, poi un attimo
        const prova = () => {
          if (finito) return;
          if (document.querySelector('.benvenuto')) { timer = setTimeout(prova, 600); return; }
          timer = setTimeout(() => { if (!finito) setAperto(true); }, 1500);
        };
        prova();
      } catch { /* niente */ }
    })();
    return () => { finito = true; clearTimeout(timer); };
  }, []);

  function piuTardi() {
    const s = leggi();
    scrivi({ no: (s.no || 0) + 1, dopo: Date.now() + SETTIMANA });
    setAperto(false);
  }

  async function si() {
    setFase('lavoro');
    try {
      const permesso = await Notification.requestPermission();
      if (permesso !== 'granted') { setFase('bloccate'); scrivi({ no: 3 }); return; }
      await iscriviPush();
      setFase('fatto');
      setTimeout(() => setAperto(false), 1800);
    } catch { setFase('chiedi'); piuTardi(); }
  }

  if (!aperto || path.startsWith('/area/accedi') || path.startsWith('/area/pass')) return null;

  return (
    <div className="cn-sfondo" onClick={fase === 'chiedi' ? piuTardi : () => setAperto(false)}>
      <div className="cn-foglio" role="dialog" aria-label="Attiva le notifiche" onClick={(e) => e.stopPropagation()}>
        <span className="cn-icona" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
        </span>
        {fase === 'fatto' ? (
          <><strong>Fatto!</strong><p>Le notifiche sono attive su questo telefono. Puoi sceglierle o spegnerle quando vuoi da «Io».</p></>
        ) : fase === 'bloccate' ? (
          <><strong>Va bene, niente notifiche</strong><p>Se cambi idea le trovi in «Io» (prima vanno riabilitate nelle impostazioni del telefono).</p>
            <button type="button" className="btn btn-grande" onClick={() => setAperto(false)}>Chiudi</button></>
        ) : (
          <>
            <strong>Vuoi ricevere le notifiche?</strong>
            <p>Ti ricordiamo la lezione la sera prima, ti avvisiamo se viene annullata e quando abbonamento o certificato stanno per scadere.</p>
            <button type="button" className="btn btn-primario btn-grande" onClick={si} disabled={fase === 'lavoro'}>
              {fase === 'lavoro' ? 'Un attimo…' : 'Sì, attiva'}
            </button>
            <button type="button" className="link-btn" onClick={piuTardi}>Più tardi</button>
          </>
        )}
      </div>
    </div>
  );
}
