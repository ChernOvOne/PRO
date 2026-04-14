import { NextRequest, NextResponse } from 'next/server'

// Paths that never require auth
const PUBLIC_PREFIXES = ['/api/public', '/api/auth', '/api/webhooks']
const PUBLIC_EXACT    = ['/', '/login', '/privacy', '/terms', '/not-found']

function isPublic(pathname: string): boolean {
  // Exact match for pages
  if (PUBLIC_EXACT.includes(pathname)) return true
  // Gift present pages are public
  if (pathname.startsWith('/present')) return true
  // Prefix match for API routes
  if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) return true
  // Static assets, health check
  if (pathname === '/health' || pathname.startsWith('/_next')) return true
  return false
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const token        = req.cookies.get('token')?.value

  // Redirect logged-in users away from /login (only if cookie is present)
  if (pathname === '/login' && token) {
    const from = req.nextUrl.searchParams.get('from')
    const target = from?.startsWith('/admin') ? '/admin' : '/dashboard'
    return NextResponse.redirect(new URL(target, req.url))
  }

  // NOTE: We do NOT redirect unauthenticated users to /login from middleware.
  // Reason: Telegram Mini App WebView blocks cookies in iframe context, so
  // `req.cookies.get('token')` is always undefined. If we redirected here,
  // users opening the Mini App would always land on /login before client-side
  // TMA auth can run.
  //
  // Auth check is done client-side in /dashboard/layout.tsx and /admin/layout.tsx
  // which can use Bearer tokens from localStorage AND Telegram initData.
  // Backend API routes are still protected by JWT middleware, so this is safe —
  // an unauthenticated user lands on a layout that immediately redirects them
  // or shows an auth error.
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.png|.*\\.svg|.*\\.ico).*)',
  ],
}
