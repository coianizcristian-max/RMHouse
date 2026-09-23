// Service worker di RMHouse: riceve le notifiche e apre l'area al tocco
self.addEventListener('push', (evento) => {
  let dati = { titolo: 'Ritmo Metropolitano', testo: '', url: '/area' };
  try { dati = { ...dati, ...evento.data.json() }; } catch { dati.testo = evento.data?.text() || ''; }

  evento.waitUntil(
    self.registration.showNotification(dati.titolo, {
      body: dati.testo,
      icon: '/icona-192.png',
      badge: '/icona-192.png',
      data: { url: dati.url || '/area' },
      tag: dati.tag || undefined,
    })
  );
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const dove = evento.notification.data?.url || '/area';
  evento.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((finestre) => {
      for (const f of finestre) {
        if (f.url.includes(dove) && 'focus' in f) return f.focus();
      }
      return clients.openWindow(dove);
    })
  );
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));
