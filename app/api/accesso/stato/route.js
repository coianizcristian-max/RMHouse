import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// Primo passo dell'accesso: a che punto è questa email?
// sconosciuta (non è fra i clienti) · da_attivare (deve crearsi la password) · attiva (ha già la password)
export async function POST(request) {
  const b = await request.json().catch(() => ({}));
  const email = String(b.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ errore: 'Controlla l\'indirizzo email.' }, { status: 400 });
  const db = supabaseAdmin();
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'ip';
  const { data: tentativi } = await db.rpc('conta_tentativo', { p_chiave: `stato:${ip}` });
  if ((tentativi || 0) > 30) return NextResponse.json({ errore: 'Troppi tentativi: riprova tra un\'ora.' }, { status: 429 });
  const { data, error } = await db.rpc('stato_accesso', { p_email: email });
  if (error) return NextResponse.json({ errore: 'Riprova tra poco.' }, { status: 500 });
  return NextResponse.json({ stato: data?.stato || 'sconosciuta', verifica: data?.verifica || null, nome: data?.nome || null, genere: data?.genere || null });
}
