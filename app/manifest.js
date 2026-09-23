export default function manifest() {
  return {
    name: 'Ritmo Metropolitano',
    short_name: 'Ritmo Metropolitano',
    description: 'Corsi, iscrizioni e presenze di Ritmo Metropolitano',
    start_url: '/gestione',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    lang: 'it',
    icons: [
      { src: '/icona-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icona-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
