import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_COUNTRIES = ['CA', 'US']; // Temporarily added US for YC access

export function proxy(request: NextRequest) {
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

  // Allow all requests to pass through temporarily
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
