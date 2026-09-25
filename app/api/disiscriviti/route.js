import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const body = await request.json().catch(() => null);
  const token = body?.token;
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) return NextResponse.json({ errore: 'Link non valido.' }, { status: 400 });
  const { data, error } = await supabaseAdmin().rpc('disiscrivi', { p_token: token });
  if (error || !data) return NextResponse.json({ errore: 'Link non valido.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
