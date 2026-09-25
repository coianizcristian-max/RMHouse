'use client';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';

const base64ToUint8 = (base64) => {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const b = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from([...atob(b)].map((c) => c.charCodeAt(0)));
};

const TIPI = [
  ['prova', 'Nuova prova prenotata', 'Chi, quale corso e quando. Gli insegnanti la ricevono solo per le proprie lezioni.', ['admin', 'segreteria', 'insegnante']],
  ['affitto', 'Nuova richiesta di affitto', 'Una richiesta di sala o festa arrivata dal sito, da confermare.', ['admin', 'segreteria']],
  ['certificato', 'Certificato da approvare', 'Un cliente ha caricato il certificato.', ['admin', 'segreteria']],
  ['pagamento', 'Pagamento online ricevuto', 'Quando qualcuno paga con carta (se i pagamenti online sono attivi).', ['admin', 'segreteria']],
  ['lezione', 'Le mie lezioni', 'Una tua lezione è stata annullata, o te ne è stata assegnata una.', ['admin', 'segreteria', 'insegnante']],
];

export default function MieNotifiche({ ruolo, preferenze }) {
  const [stato, setStato] = useState('controllo');   // controllo | spente | attive | non_supportate | ios_da_installare
  const [pref, setPref] = useState(preferenze);
  const [avviso, setAvviso] = useState('');
  const [errore, setErrore] = useState('');

  useEffect(() => {
    const chiave = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const supportate = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.navigator.standalone;
    if (!chiave) { setStato('non_supportate'); return; }
    if (ios && !supportate) { setStato('ios_da_installare'); return; }
    if (!supportate) { setStato('non_supportate'); return; }
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setStato(sub ? 'attive' : 'spente'))
      .catch(() => setStato('non_supportate'));
  }, []);

  async function attiva() {
    setErrore(''); setAvviso('');
    const permesso = await Notification.requestPermission();
    if (permesso !== 'granted') { setErrore('Le notifiche sono bloccate: sbloccale dalle impostazioni del browser per questo sito.'); return; }
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToUint8(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) });
      const j = sub.toJSON();
      const { error } = await supabaseBrowser().rpc('registra_push_staff', {
        p_endpoint: sub.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_dispositivo: navigator.userAgent.slice(0, 120),
      });
      if (error) throw error;
      setStato('attive'); setAvviso('Notifiche attive su questo dispositivo.');
    } catch {
      setErrore('Non è stato possibile attivarle. Riprova più tardi.');
    }
  }

  async function spegni() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) { await supabaseBrowser().rpc('cancella_push', { p_endpoint: sub.endpoint }); await sub.unsubscribe(); }
      setStato('spente'); setAvviso('Notifiche spente su questo dispositivo.');
    } catch { setErrore('Non è stato possibile spegnerle.'); }
  }

  async function prova() {
    setErrore(''); setAvviso('');
    const { error } = await supabaseBrowser().rpc('prova_push_staff');
    setAvviso(error ? '' : 'Notifica di prova in partenza: arriva entro 5 minuti.');
    if (error) setErrore('Invio di prova non riuscito.');
  }

  async function cambia(k) {
    const nuovo = { ...pref, [k]: pref[k] === false };
    setPref(nuovo);
    await supabaseBrowser().rpc('imposta_mie_notifiche', { p: nuovo });
  }

  const miei = TIPI.filter(([, , , ruoli]) => ruoli.includes(ruolo));

  return (
    <>
      <div className="intestazione">
        <div className="occhiello">Oggi</div>
        <h1>Le mie notifiche</h1>
        <p>Avvisi sul telefono (o sul computer) quando succede qualcosa che ti riguarda. Si attivano su ogni dispositivo che usi.</p>
      </div>
      {errore && <div className="errore" role="alert">{errore}</div>}
      {avviso && <div className="errore" role="status" style={{ background: 'var(--ok-tenue)', color: 'var(--ok)' }}>{avviso}</div>}

      <section className="pannello" style={{ maxWidth: 760 }}>
        <h2>Su questo dispositivo</h2>
        {stato === 'controllo' && <p className="muto">Controllo…</p>}
        {stato === 'non_supportate' && <p>Questo browser non riceve notifiche, oppure mancano le chiavi del sito (vedi Impostazioni → Integrazioni).</p>}
        {stato === 'ios_da_installare' && (
          <p>Su iPhone le notifiche arrivano solo se il sito è sulla schermata iniziale: in Safari tocca <b>Condividi</b> → <b>Aggiungi alla schermata Home</b>, apri RMHouse da lì ed entra in questa pagina.</p>
        )}
        {stato === 'spente' && (
          <div className="azioni"><button className="btn btn-primario" onClick={attiva}>Attiva le notifiche</button></div>
        )}
        {stato === 'attive' && (
          <div className="azioni">
            <span className="tag tag-ok">attive</span>
            <button className="btn btn-piccolo" onClick={prova}>Mandami una prova</button>
            <button className="link-btn piccolo" onClick={spegni}>spegni su questo dispositivo</button>
          </div>
        )}
      </section>

      <section className="pannello" style={{ maxWidth: 760 }}>
        <h2>Cosa ricevere</h2>
        <div className="interruttori">
          {miei.map(([k, nome, descr]) => (
            <label key={k} className="interruttore">
              <span className="int-testo"><strong>{nome}</strong><span className="piccolo muto">{descr}</span></span>
              <input type="checkbox" role="switch" checked={pref[k] !== false} onChange={() => cambia(k)} />
            </label>
          ))}
        </div>
        <p className="piccolo muto" style={{ marginTop: 8 }}>Le scelte valgono per tutti i tuoi dispositivi.</p>
      </section>
    </>
  );
}
