/** @type {import('next').NextConfig} */

// Indirizzo del database (Supabase): serve per le immagini e per i dati in tempo reale
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://*.supabase.co';
const supabaseWs = supabase.replace(/^http/, 'ws');

// Regole di sicurezza del browser (Content Security Policy):
// il sito carica script, stili e font solo da sé stesso, e parla solo con Supabase.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabase} https://*.supabase.co`,
  "font-src 'self'",
  `connect-src 'self' ${supabase} ${supabaseWs} https://*.supabase.co wss://*.supabase.co`,
  "media-src 'self' blob: https://*.supabase.co",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
  'upgrade-insecure-requests',
].join('; ');

const sicurezza = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // fotocamera solo per il sito stesso (lettore dei pass all'ingresso), niente microfono né posizione
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const nextConfig = {
  poweredByHeader: false,
  // le pagine appena visitate restano nel browser per 30 secondi: tornare indietro (es. Sportello → Riepilogo → Sportello)
  // è immediato invece di aspettare di nuovo il server. Dopo ogni modifica (router.refresh) si ricaricano comunque.
  experimental: { staleTimes: { dynamic: 30 } },
  async headers() {
    return [
      { source: '/:path*', headers: sicurezza },
      // gestionale, area clienti e API non vanno nei motori di ricerca
      { source: '/gestione/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
      { source: '/area/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
      { source: '/api/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
      // font e loghi: si scaricano una volta e restano nel telefono
      { source: '/font/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    ];
  },
};
export default nextConfig;
