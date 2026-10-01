// Cosa possono leggere i motori di ricerca: il sito pubblico sì, gestionale e area clienti no
export default function robots() {
  const base = process.env.NEXT_PUBLIC_SITO_URL || '';
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/gestione', '/area', '/api', '/login', '/auth', '/ingresso', '/certificato', '/sondaggio', '/disiscriviti', '/pagato'] }],
    ...(base ? { sitemap: `${base}/sitemap.xml` } : {}),
  };
}
