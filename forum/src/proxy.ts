import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const ALLOWED_COUNTRIES = ['CA', 'US']; // Temporarily added US for YC access

export async function proxy(request: NextRequest) {
  // Get country from Vercel's geo object or header
  // Note: geo is available on Vercel Edge Runtime but not in local dev types
  const geo = (request as NextRequest & { geo?: { country?: string } }).geo;
  const country = geo?.country || request.headers.get('x-vercel-ip-country');

  // Skip middleware for the blocked page itself to avoid redirect loops
  if (request.nextUrl.pathname === '/blocked') {
    return NextResponse.next();
  }

  // Skip middleware for static assets and API routes
  if (
    request.nextUrl.pathname.startsWith('/_next') ||
    request.nextUrl.pathname.startsWith('/api') ||
    request.nextUrl.pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // TEMPORARILY DISABLED: Allow all countries for YC access
  // Allow if no country detected (local development) or if country is allowed
  // if (!country || ALLOWED_COUNTRIES.includes(country)) {
  //   return NextResponse.next();
  // }

  // TEMPORARILY DISABLED: Redirect to blocked page
  // const blockedUrl = new URL('/blocked', request.url);
  // return NextResponse.redirect(blockedUrl);

  // Supabase auth middleware
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // Refreshing the auth token
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
