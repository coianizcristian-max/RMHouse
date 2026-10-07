import { NextResponse } from 'next/server';
import { staffCorrente } from '@/lib/staff';

export const dynamic = 'force-dynamic';

// Misure dal server (Vercel) verso il database: quanto costa UNA richiesta semplice, le funzioni delle pagine
// più usate, e da quanto è acceso questo processo (avvio a freddo o no). Le legge Impostazioni → Velocità.
const avvio = Date.now();
let servite = 0;
const mediana = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
async function misura(n, fn) {
  const tempi = [];
  for (let i = 0; i < n; i++) { const t = performance.now(); await fn(); tempi.push(Math.round(performance.now() - t)); }
  return { mediana: mediana(tempi), tempi };
}

export async function GET() {
  servite += 1;
  const t0 = performance.now();
  const { supabase, staff } = await staffCorrente();
  if (!staff || staff.ruolo === 'insegnante') return NextResponse.json({ errore: 'non_autorizzato' }, { status: 403 });
  const tStaff = Math.round(performance.now() - t0);
  const p = staff.palestra_id;
  // una persona qualunque per la scheda
  const { data: uno } = await supabase.from('iscrizioni').select('allievo_id').eq('palestra_id', p).eq('stato', 'attiva').limit(1).maybeSingle();

  const semplice = await misura(4, () => supabase.from('palestre').select('id').eq('id', p).maybeSingle());
  const parallele = await misura(2, () => Promise.all(Array.from({ length: 8 }, () => supabase.from('palestre').select('id').eq('id', p).maybeSingle())));
  const home = await misura(2, () => supabase.rpc('home_dati', { p_palestra: p }));
  const sportello = await misura(2, () => supabase.rpc('sportello_dati', { p_palestra: p }));
  const scheda = uno ? await misura(2, () => supabase.rpc('scheda_persona', { p_allievo: uno.allievo_id })) : null;
  const persone = await misura(2, () => supabase.from('v_stato_clienti').select('id, nome, cognome, stato').eq('palestra_id', p).order('cognome').limit(60));

  return NextResponse.json({
    quando: new Date().toISOString(),
    server: {
      regione: process.env.VERCEL_REGION || 'locale', acceso_da_s: Math.round((Date.now() - avvio) / 1000), richieste_servite: servite,
      node: process.version, memoria_mb: Math.round(process.memoryUsage().rss / 1048576),
    },
    database: { host: (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/^https?:\/\//, '') },
    misure: { staff_ms: tStaff, semplice, parallele8: parallele, home, sportello, scheda, persone },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
