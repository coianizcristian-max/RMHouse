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
  // getClaims: verifica il token localmente se possibile (niente viaggio al server a ogni pagina),
  // altrimenti chiede all'Auth di Supabase come prima; in entrambi i casi rinnova la sessione se serve
  let user = null;
  if (typeof supabase.auth.getClaims === 'function') {
    const { data } = await supabase.auth.getClaims();
    user = data?.claims?.sub ? { id: data.claims.sub } : null;
  } else {
    user = (await supabase.auth.getUser()).data.user;
  }

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
