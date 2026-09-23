export default function manifest() {
  return {
    name: 'Ritmo Metropolitano',
    short_name: 'Ritmo Metropolitano',
    description: 'Le tue lezioni, i recuperi e il certificato, sempre a portata di mano.',
    start_url: '/area',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#f40000',
    lang: 'it',
    icons: [
      { src: '/icona-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icona-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icona-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
