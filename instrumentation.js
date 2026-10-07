// Parte una volta per ogni processo del server (Vercel: a ogni "avvio a freddo"), prima della prima pagina.
// Il lavoro vero sta in instrumentation-node.js: l'if con NEXT_RUNTIME è quello che Next si aspetta per
// caricarlo solo nel server Node (non nel middleware "edge").
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation-node');
  }
}
