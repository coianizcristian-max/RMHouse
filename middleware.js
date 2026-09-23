import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Aggiorna la sessione Supabase e protegge /gestione (staff) e /area (clienti)
export async function middleware(request) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const staff = pathname.startsWith('/gestione');
  const cliente = pathname.startsWith('/area') && !pathname.startsWith('/area/accedi');

  if (!user && (staff || cliente)) {
    const url = request.nextUrl.clone();
    url.pathname = cliente ? '/area/accedi' : '/login';
    url.searchParams.set('da', pathname);
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = { matcher: ['/gestione/:path*', '/area/:path*', '/login'] };
