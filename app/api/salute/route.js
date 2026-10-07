import { NextResponse } from 'next/server';
import { dimenticaGuscio, dimenticaStaff } from '@/lib/staff';

export const dynamic = 'force-dynamic';

// Risposta minima: la chiama ogni 5 minuti il database (pg_cron, query 135) per tenere il sito "sveglio"
// su Vercel, così la prima pagina della giornata non paga l'avvio a freddo. Non legge nulla.
// Con ?dimentica=guscio svuota la memoria del menù (funzioni attive, profili): la chiamano le Impostazioni dopo un salvataggio.
export async function GET(request) {
  const cosa = new URL(request.url).searchParams.get('dimentica');
  if (cosa === 'guscio') dimenticaGuscio();
  if (cosa === 'staff') { dimenticaStaff(); dimenticaGuscio(); }
  return NextResponse.json({ ok: true, ora: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
}
