import { NextRequest, NextResponse } from 'next/server'

export function middleware(req: NextRequest) {
  const allowed = process.env.ALLOWED_IPS?.split(',').map(ip => ip.trim()) || []
  const ip = req.ip ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()

  if (!ip || !allowed.includes(ip)) {
    return new NextResponse('Not found', { status: 404 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/|favicon.ico|robots.txt|sitemap.xml).*)'],
}
