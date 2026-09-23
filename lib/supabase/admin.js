import 'server-only';
import { createClient } from '@supabase/supabase-js';

// Client con la service role: SOLO nelle API lato server (sito pubblico, cron).
// Scavalca le regole RLS, quindi ogni route deve validare i dati da sé.
export function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
