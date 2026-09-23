import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Client con la sessione dell'utente collegato: rispetta le regole RLS
export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // chiamato da un Server Component: la sessione la aggiorna il middleware
          }
        },
      },
    }
  );
}
