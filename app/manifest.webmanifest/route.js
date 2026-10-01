// L'app dei CLIENTI: si installa dall'area clienti (icona rossa su bianco).
// È una rotta (e non il file speciale manifest.js) così il gestionale può indicare il suo.
export const dynamic = 'force-static';

export function GET() {
  const manifest = {
    id: '/area',
    name: 'Ritmo Metropolitano',
    short_name: 'Ritmo Metropolitano',
    description: 'Le tue lezioni, i recuperi, il pass e il certificato, sempre a portata di mano.',
    start_url: '/area',
    scope: '/area',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    lang: 'it',
    icons: [
      { src: '/icona-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icona-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icona-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Il mio pass', url: '/area/pass', icons: [{ src: '/icona-192.png', sizes: '192x192' }] },
      { name: 'Orario', url: '/area/orario', icons: [{ src: '/icona-192.png', sizes: '192x192' }] },
      { name: 'Prenota', url: '/area/recuperi', icons: [{ src: '/icona-192.png', sizes: '192x192' }] },
    ],
  };
  return new Response(JSON.stringify(manifest), { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=3600' } });
}
