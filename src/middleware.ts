import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Middleware does two jobs:
 *   1. Refreshes the Supabase session cookie so long editing sessions don't
 *      expire mid-form.
 *   2. Bounces unauthenticated requests away from the dashboard.
 *
 * It is a first line of defence, NOT the authorization boundary — it cannot
 * see account status or emergency lock. Every page and server action still
 * calls requireUser()/requireEditor() from src/lib/auth/guard.ts.
 */

const PUBLIC_PATHS = ['/login', '/reset-password', '/update-password', '/auth'];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Must be getUser(), not getSession(): it verifies the token with Supabase
  // instead of trusting whatever the cookie claims.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublicPath = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );

  if (!user && !isPublicPath) {
    const loginUrl = new URL('/login', request.url);
    // Preserve where they were headed so sign-in can return them there.
    if (pathname !== '/') loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image optimization — those don't
     * need a session check and skipping them keeps navigation fast.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
