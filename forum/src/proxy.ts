import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const REFRESH_THROTTLE_MS = 60 * 1000; // only refresh once per minute per visitor
const REFRESH_THROTTLE_COOKIE = 'sb-refresh-ts';
const AUTH_DIAGNOSTICS_ENABLED = process.env.NEXT_PUBLIC_AUTH_DIAGNOSTICS === '1';

const ALLOWED_COUNTRIES = ['CA', 'US']; // Temporarily added US for YC access

const isPrefetchRequest = (request: NextRequest) => {
  const purpose = request.headers.get('purpose');
  const nextPrefetch = request.headers.get('next-router-prefetch');
  return purpose === 'prefetch' || nextPrefetch === '1';
};

const hasSupabaseAuthCookie = (request: NextRequest) => {
  return request.cookies
    .getAll()
    .some(({ name }) => name.startsWith('sb-') && name.includes('-auth-token'));
};

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

  // Skip token refresh work for prefetches to avoid unnecessary auth churn.
  if (isPrefetchRequest(request)) {
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

  const now = Date.now();
  const lastRefreshCookie = request.cookies.get(REFRESH_THROTTLE_COOKIE);
  const lastRefresh = lastRefreshCookie ? Number.parseInt(lastRefreshCookie.value, 10) : null;
  const refreshIsThrottled = Boolean(
    lastRefresh && Number.isFinite(lastRefresh) && now - lastRefresh < REFRESH_THROTTLE_MS,
  );
  const shouldAttemptRefresh =
    hasSupabaseAuthCookie(request) && !refreshIsThrottled;

  if (shouldAttemptRefresh) {
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

    try {
      // Refreshing the auth token
      const { error } = await supabase.auth.getUser();

      if (error && AUTH_DIAGNOSTICS_ENABLED) {
        console.warn('[AuthDiag][Proxy] getUser error', {
          code: error.code,
          message: error.message,
          path: request.nextUrl.pathname,
        });
      }
    } catch (error) {
      if (AUTH_DIAGNOSTICS_ENABLED) {
        console.warn('[AuthDiag][Proxy] getUser exception', {
          path: request.nextUrl.pathname,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      // Set the throttle cookie even on failures to avoid burst retry loops.
      response.cookies.set(REFRESH_THROTTLE_COOKIE, String(now), {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60, // 1 hour, refreshed on every token refresh
      });
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
