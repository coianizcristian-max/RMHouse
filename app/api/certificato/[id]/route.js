import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// Apre il documento di un certificato con un link che vale 5 minuti.
// Si crea solo quando qualcuno lo apre davvero (prima: un link per ogni riga a ogni caricamento della pagina).
export async function GET(_request, { params }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Non valido.', { status: 400 });
  const server = await supabaseServer();
  const { data: { user } } = await server.auth.getUser();
  if (!user) return new Response('Non autorizzato.', { status: 401 });
  // dato sanitario: gli insegnanti non lo aprono; la segreteria sì, il cliente solo i suoi (regole del database)
  const { data: staff } = await server.from('staff').select('ruolo').eq('user_id', user.id).eq('attivo', true).limit(1).maybeSingle();
  if (staff?.ruolo === 'insegnante') return new Response('Non autorizzato.', { status: 403 });
  const { data: c } = await server.from('certificati').select('file_path').eq('id', id).maybeSingle();
  if (!c) return new Response('Non trovato.', { status: 404 });
  const { data } = await supabaseAdmin().storage.from('certificati').createSignedUrl(c.file_path, 300);
  if (!data?.signedUrl) return new Response('Documento non disponibile.', { status: 404 });
  return NextResponse.redirect(data.signedUrl, { headers: { 'Cache-Control': 'no-store' } });
}
