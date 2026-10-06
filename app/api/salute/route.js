import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Risposta minima: la chiama ogni 5 minuti il database (pg_cron, query 135) per tenere il sito "sveglio"
// su Vercel, così la prima pagina della giornata non paga l'avvio a freddo. Non legge nulla.
export async function GET() {
  return NextResponse.json({ ok: true, ora: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
}
