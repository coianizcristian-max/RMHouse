// L'app dello STAFF: un'installazione a parte, con icona nera "Gestione",
// che si apre direttamente nel gestionale (e ha le sue notifiche).
export const dynamic = 'force-static';

export function GET() {
  const manifest = {
    id: '/gestione',
    name: 'RM Gestione',
    short_name: 'RM Gestione',
    description: 'Il gestionale di Ritmo Metropolitano: lezioni, appelli, persone, incassi.',
    start_url: '/gestione',
    scope: '/gestione',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0c0c0c',
    theme_color: '#0c0c0c',
    lang: 'it',
    icons: [
      { src: '/icona-gestione-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icona-gestione-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icona-gestione-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Agenda del giorno', url: '/gestione/oggi', icons: [{ src: '/icona-gestione-192.png', sizes: '192x192' }] },
      { name: 'Ingressi', url: '/gestione/ingresso', icons: [{ src: '/icona-gestione-192.png', sizes: '192x192' }] },
      { name: 'Nuovo cliente', url: '/gestione/persone/nuova', icons: [{ src: '/icona-gestione-192.png', sizes: '192x192' }] },
      { name: 'Persone', url: '/gestione/persone', icons: [{ src: '/icona-gestione-192.png', sizes: '192x192' }] },
    ],
  };
  return new Response(JSON.stringify(manifest), { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=3600' } });
}
