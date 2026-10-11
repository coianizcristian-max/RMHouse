import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// L'immagine del timbro con la firma, solo per la segreteria (non è un file pubblico)
export async function GET() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Non autorizzato', { status: 401 });
  const { data: staff } = await supabase.from('staff').select('palestra_id, ruolo').eq('user_id', user.id).eq('attivo', true).maybeSingle();
  if (!staff || staff.ruolo === 'insegnante') return new Response('Non autorizzato', { status: 403 });
  const { data: f } = await supabase.from('palestra_file').select('tipo, dati').eq('palestra_id', staff.palestra_id).eq('chiave', 'timbro_firma').maybeSingle();
  if (!f) return new Response('Nessun timbro', { status: 404 });
  return new Response(Buffer.from(f.dati, 'base64'), { headers: { 'Content-Type': f.tipo || 'image/png', 'Cache-Control': 'private, no-store' } });
}
