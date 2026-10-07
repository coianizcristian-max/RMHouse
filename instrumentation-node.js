import { Agent, setGlobalDispatcher } from 'undici';

// 1) Le connessioni verso Supabase restano aperte fra una richiesta e l'altra (prima si chiudevano dopo 4 secondi:
//    ogni pagina riapriva una connessione cifrata per ogni richiesta, 30–50 ms l'una, in fila su un processore solo).
try {
  setGlobalDispatcher(new Agent({
    keepAliveTimeout: 60_000,          // tienile aperte un minuto anche se il server non dice quanto
    keepAliveMaxTimeout: 10 * 60_000,
    connections: 32,
    connect: { timeout: 10_000 },
  }));
} catch (e) {
  console.warn('connessioni persistenti non impostate:', e?.message);
}

// 2) Si apre subito una connessione verso Supabase (chiavi pubbliche dell'accesso: è la prima cosa che ogni pagina
//    chiede), così la prima pagina la trova già pronta.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (url && /^https:/.test(url)) {
  fetch(`${url}/auth/v1/.well-known/jwks.json`, { cache: 'no-store' }).then((r) => r.arrayBuffer()).catch(() => null);
}
