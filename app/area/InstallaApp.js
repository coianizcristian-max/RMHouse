'use client';
import { useEffect, useState } from 'react';

// "Metti l'app sul telefono" senza passare dagli store:
// Android/Chrome mostra il suo pulsante di installazione; su iPhone spieghiamo i due tocchi in Safari.
export default function InstallaApp({ compatto = false }) {
  const [evento, setEvento] = useState(null);
  const [ios, setIos] = useState(false);
  const [installata, setInstallata] = useState(true);
  const [aperto, setAperto] = useState(false);

  useEffect(() => {
    // il service worker rende l'app installabile (e serve già per le notifiche)
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => null);
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone;
    setInstallata(!!standalone);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const prendi = (e) => { e.preventDefault(); setEvento(e); };
    window.addEventListener('beforeinstallprompt', prendi);
    const fatto = () => setInstallata(true);
    window.addEventListener('appinstalled', fatto);
    return () => { window.removeEventListener('beforeinstallprompt', prendi); window.removeEventListener('appinstalled', fatto); };
  }, []);

  if (installata) return null;

  async function installa() {
    if (evento) { evento.prompt(); const r = await evento.userChoice; if (r?.outcome === 'accepted') setInstallata(true); setEvento(null); return; }
    setAperto(!aperto);
  }

  return (
    <div className={`installa-app${compatto ? ' compatto' : ''}`}>
      <img src="/icona-192.png" alt="" width="40" height="40" />
      <span className="ia-testo">
        <strong>Metti l'app sul telefono</strong>
        <span>Si apre con un tocco, come le altre app. Gratis, senza store.</span>
      </span>
      <button type="button" className="btn btn-piccolo btn-primario" onClick={installa}>{evento ? 'Installa' : 'Come si fa'}</button>
      {aperto && !evento && (
        <span className="ia-passi">
          {ios ? (
            <>In <strong>Safari</strong> tocca <strong>Condividi</strong> (il quadrato con la freccia in su), poi <strong>Aggiungi alla schermata Home</strong> e <strong>Aggiungi</strong>.</>
          ) : (
            <>Nel menù del browser (i tre puntini in alto a destra) tocca <strong>Installa app</strong> oppure <strong>Aggiungi a schermata Home</strong>.</>
          )}
        </span>
      )}
    </div>
  );
}
