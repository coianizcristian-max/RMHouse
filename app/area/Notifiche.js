'use client';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';

// Attivazione delle notifiche sul telefono.
// Su iPhone funzionano solo se il sito è stato aggiunto alla schermata iniziale.
const base64ToUint8 = (base64) => {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const b = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

const TIPI = [
  ['lezioni', 'Lezioni', 'la sera prima: "Domani hai…", e se una lezione viene annullata'],
  ['scadenze', 'Scadenze', 'abbonamento, certificato medico, recuperi da usare'],
  ['scuola', 'Novità della scuola', 'avvisi, eventi, corsi che partono'],
];

export default function Notifiche({ preferenze = null }) {
  const [stato, setStato] = useState('controllo');   // controllo | spente | attive | non_supportate | ios_da_installare
  const [errore, setErrore] = useState('');
  const [pref, setPref] = useState(preferenze || {});
  async function cambia(k, v) {
    const nuove = { ...pref, [k]: v }; setPref(nuove);
    await supabaseBrowser().rpc('imposta_notifiche_cliente', { p: nuove });
  }

  useEffect(() => {
    const chiave = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!chiave) { setStato('non_supportate'); return; }

    const supportate = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    const iosSenzaInstallazione =
      /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.navigator.standalone;

    if (iosSenzaInstallazione && !supportate) { setStato('ios_da_installare'); return; }
    if (!supportate) { setStato('non_supportate'); return; }

    navigator.serviceWorker.register('/sw.js', { scope: '/area/' })
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setStato(sub ? 'attive' : 'spente'))
      .catch(() => setStato('non_supportate'));
  }, []);

  async function attiva() {
    setErrore('');
    const permesso = await Notification.requestPermission();
    if (permesso !== 'granted') { setErrore('Le notifiche sono state bloccate dal telefono.'); return; }

    try {
      const reg = (await navigator.serviceWorker.getRegistration('/area/')) || (await navigator.serviceWorker.ready);
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToUint8(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
      });
      const j = sub.toJSON();
      const { error } = await supabaseBrowser().rpc('registra_push', {
        p_endpoint: sub.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth,
        p_dispositivo: navigator.userAgent.slice(0, 120),
      });
      if (error) throw error;
      setStato('attive');
    } catch (e) {
      setErrore('Non è stato possibile attivarle. Riprova più tardi.');
    }
  }

  async function spegni() {
    try {
      const reg = (await navigator.serviceWorker.getRegistration('/area/')) || (await navigator.serviceWorker.ready);
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await supabaseBrowser().rpc('cancella_push', { p_endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setStato('spente');
    } catch { setErrore('Non è stato possibile spegnerle.'); }
  }

  if (stato === 'controllo' || stato === 'non_supportate') return null;

  return (
    <div className="scheda" style={{ marginBottom: 18 }}>
      <strong style={{ color: 'var(--nero)' }}>Notifiche sul telefono</strong>

      {stato === 'ios_da_installare' && (
        <p className="piccolo muto" style={{ marginTop: 4, marginBottom: 0 }}>
          Su iPhone servono due passaggi: tocca il tasto Condividi in basso, poi "Aggiungi alla schermata Home".
          Riapri il sito da lì e qui comparirà il pulsante per attivarle.
        </p>
      )}

      {stato === 'spente' && (
        <>
          <p className="piccolo muto" style={{ marginTop: 4 }}>
            La sera prima ti ricordiamo la lezione, ti avvisiamo se viene annullata, quando l'abbonamento o il
            certificato stanno per scadere e quando la segreteria risponde a una tua richiesta.
          </p>
          <button className="btn btn-primario" onClick={attiva}>Attiva le notifiche</button>
        </>
      )}

      {stato === 'attive' && (
        <>
          <p className="piccolo muto" style={{ marginTop: 4 }}>
            Attive su questo telefono. Scegli quali ricevere:
          </p>
          {preferenze !== null && TIPI.map(([k, t, d]) => (
            <label key={k} className="spunta"><input type="checkbox" checked={pref[k] !== false} onChange={(e) => cambia(k, e.target.checked)} />
              <span><strong>{t}</strong> <span className="piccolo muto">· {d}</span></span></label>
          ))}
          <button className="link-btn" onClick={spegni}>Spegni le notifiche su questo telefono</button>
        </>
      )}

      {errore && <p className="piccolo" style={{ color: 'var(--rosso-scuro)' }}>{errore}</p>}
    </div>
  );
}
