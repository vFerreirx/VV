// Proxy do Next 16 (antigo middleware.ts).
// Roda em todas as requests não estáticas, refresca a sessão do Supabase
// pelos cookies e protege as rotas autenticadas.

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import {
  COOKIE_ATIVIDADE,
  COOKIE_OPERADOR,
  expirouPorInatividade,
} from '@/lib/auth/inatividade'

const PUBLIC_PATHS = ['/', '/login']
const AUTH_PATHS = ['/login']

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

function isAuthPath(pathname: string) {
  return AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  // Trigger no @supabase/ssr — refresca tokens e seta cookies no response.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // INATIVIDADE NO TABLET DA ESTAÇÃO — o backstop.
  //
  // O aviso e o logoff normais acontecem no cliente, que tem o contador na
  // tela. Isto aqui pega o que o cliente não pega: aba restaurada do
  // bfcache, JS que morreu, tablet que dormiu com a página aberta. Sem esta
  // checagem, qualquer um desses devolve a sessão do operador anterior
  // inteira, que é justamente o que o PIN foi construído pra evitar.
  //
  // Só vale pra sessão de OPERADOR (o cookie é escrito no login), e o cookie
  // de atividade é escrito pelo TOQUE, não pela request — ver
  // src/lib/auth/inatividade.ts.
  if (
    user &&
    request.cookies.get(COOKIE_OPERADOR)?.value === '1' &&
    expirouPorInatividade(request.cookies.get(COOKIE_ATIVIDADE)?.value)
  ) {
    await supabase.auth.signOut()
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = '?expirado=1'
    const saida = NextResponse.redirect(url)
    saida.cookies.delete(COOKIE_OPERADOR)
    saida.cookies.delete(COOKIE_ATIVIDADE)
    return saida
  }

  // Não autenticado tentando acessar área logada → /login?next=...
  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  // Autenticado em rota de auth → /dashboard
  if (user && isAuthPath(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    // Tudo exceto: assets estáticos, /_next, ícones, imagens, PWA (manifest + sw).
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)',
  ],
}
