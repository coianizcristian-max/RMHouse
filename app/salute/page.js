import { avvioProcesso } from '@/lib/staff';

export const dynamic = 'force-dynamic';

// Pagina vuota per tenere "sveglio" il server delle pagine: la chiama il database ogni 4 minuti (query 145)
// insieme a /api/salute. Non legge nulla di riservato. Serve solo a evitare l'avvio a freddo alla prima apertura.
export default function Salute() {
  return <main style={{ fontFamily: 'system-ui', padding: 20 }}>ok · {new Date().toISOString()} · acceso da {Math.round((Date.now() - avvioProcesso) / 1000)} s</main>;
}
