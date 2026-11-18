import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f-]{36}$/i;

// Pagina pubblica della biglietteria: ?s=spettacolo → i gruppi; ?s=…&g=gruppo → gli allievi del gruppo (nome e iniziale)
export async function GET(request) {
  const u = new URL(request.url);
  const s = u.searchParams.get('s') || '';
  const g = u.searchParams.get('g');
  if (!UUID.test(s)) return NextResponse.json([]);
  const db = supabaseAdmin();
  const { data, error } = g == null
    ? await db.rpc('biglietteria_gruppi', { p_spettacolo: s })
    : await db.rpc('biglietteria_elenco', { p_spettacolo: s, p_gruppo: g.slice(0, 80) });
  if (error) return NextResponse.json([], { status: 500 });
  return NextResponse.json(data || [], { headers: { 'Cache-Control': 'no-store' } });
}
