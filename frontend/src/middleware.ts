import { NextRequest, NextResponse } from 'next/server'

const PUBLIC_PATHS = ['/', '/login', '/api/public', '/api/auth', '/api/webhooks']

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const token        = req.cookies.get('token')?.value

  // Allow public paths without auth
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Protect /dashboard and /admin
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/admin')) {
    if (!token) {
      const loginUrl = new URL('/login', req.url)
      loginUrl.searchParams.set('from', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  // Redirect logged-in users away from /login
  if (pathname === '/login' && token) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.png|.*\\.svg|.*\\.ico).*)',
  ],
}
