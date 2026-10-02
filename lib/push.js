'use client';
import { supabaseBrowser } from '@/lib/supabase/browser';

// Iscrizione del telefono alle notifiche (stessa logica per l'invito al primo ingresso e per "Io").
const base64ToUint8 = (base64) => {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const b = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from([...atob(b)].map((c) => c.charCodeAt(0)));
};

export const pushSupportato = () => typeof window !== 'undefined' && !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export async function registrazione(scope = '/area/') {
  return (await navigator.serviceWorker.getRegistration(scope))
    || (await navigator.serviceWorker.register('/sw.js', { scope }));
}

// collega il telefono (il permesso deve già essere "granted")
export async function iscriviPush(scope = '/area/') {
  const reg = await registrazione(scope);
  if (!reg.active) await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64ToUint8(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
  });
  const j = sub.toJSON();
  const { error } = await supabaseBrowser().rpc('registra_push', {
    p_endpoint: sub.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth,
    p_dispositivo: navigator.userAgent.slice(0, 120),
  });
  if (error) throw error;
  try { window.dispatchEvent(new Event('rm-push-attive')); } catch { /* niente */ }
  return sub;
}
