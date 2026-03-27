import { NextRequest, NextResponse } from 'next/server'

// Paths that never require auth
const PUBLIC_PREFIXES = ['/api/public', '/api/auth', '/api/webhooks']
const PUBLIC_EXACT    = ['/', '/login', '/privacy', '/terms', '/not-found']

function isPublic(pathname: string): boolean {
  // Exact match for pages
  if (PUBLIC_EXACT.includes(pathname)) return true
  // Prefix match for API routes
  if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) return true
  // Static assets, health check
  if (pathname === '/health' || pathname.startsWith('/_next')) return true
  return false
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const token        = req.cookies.get('token')?.value

  // Redirect logged-in users away from /login
  // Не можем знать роль из middleware (JWT не декодируем) — идём на /dashboard,
  // а admin/layout сам перенаправит если нужно. Но если пришли с /admin — туда и шлём.
  if (pathname === '/login' && token) {
    const from = req.nextUrl.searchParams.get('from')
    const target = from?.startsWith('/admin') ? '/admin' : '/dashboard'
    return NextResponse.redirect(new URL(target, req.url))
  }

  // Allow public paths without auth
  if (isPublic(pathname)) {
    return NextResponse.next()
  }

  // Protect /dashboard and /admin — require token
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/admin')) {
    if (!token) {
      const loginUrl = new URL('/login', req.url)
      loginUrl.searchParams.set('from', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.png|.*\\.svg|.*\\.ico).*)',
  ],
}
