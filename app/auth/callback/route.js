import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Ritorno dal link di accesso mandato per email
export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const dove = url.searchParams.get('next') || '/area';

  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(dove, url.origin));
  }
  return NextResponse.redirect(new URL('/area/accedi?errore=1', url.origin));
}
