// Proxy do Next 16 (antigo middleware.ts).
// Roda em todas as requests não estáticas, refresca a sessão do Supabase
// pelos cookies e protege as rotas autenticadas.

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import {
  COOKIE_ATIVIDADE,
  COOKIE_OPERADOR,
  COOKIE_TRAVADO,
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

  // INATIVIDADE NO TABLET DA ESTAÇÃO — o proxy TRAVA, não desloga.
  //
  // Antes isto fazia `signOut` e mandava pro /login. Agora a sessão fica e o
  // tablet trava: a leitura segue (a grade continua atualizando), e a escrita
  // pede PIN. A regra inteira está em src/lib/auth/inatividade.ts.
  //
  // ⚠️ O QUE ESTE BLOCO FAZ É GRAVAR `vv_travado`, httpOnly. O cookie de
  // atividade é escrito pelo cliente, e com trava isso deixa de bastar: se
  // tocar na tela reescrevesse a atividade, qualquer toque destravaria o
  // servidor sem PIN. A marca httpOnly o JavaScript não apaga — só a
  // confirmação de PIN, a troca de operador e o login por senha.
  //
  // É aqui que continuam cobertos os casos que o cliente não pega: aba
  // restaurada do bfcache, JS que morreu, tablet que dormiu com a página
  // aberta. A primeira request depois disso chega com a atividade velha, e o
  // tablet acorda travado. (A guarda das actions também recusa por atividade
  // vencida mesmo sem esta marca, pra action que chega antes de qualquer
  // outra request.)
  //
  // Só vale pra sessão de OPERADOR — o cookie é escrito no login.
  const travarAgora =
    user !== null &&
    request.cookies.get(COOKIE_OPERADOR)?.value === '1' &&
    request.cookies.get(COOKIE_TRAVADO)?.value !== '1' &&
    expirouPorInatividade(request.cookies.get(COOKIE_ATIVIDADE)?.value)

  function comTrava(res: NextResponse): NextResponse {
    if (travarAgora) {
      res.cookies.set(COOKIE_TRAVADO, '1', {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      })
    }
    return res
  }

  // Não autenticado tentando acessar área logada → /login?next=...
  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return comTrava(NextResponse.redirect(url))
  }

  // Autenticado em rota de auth → /dashboard
  if (user && isAuthPath(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    url.search = ''
    return comTrava(NextResponse.redirect(url))
  }

  return comTrava(response)
}

export const config = {
  matcher: [
    // Tudo exceto: assets estáticos, /_next, ícones, imagens, PWA (manifest + sw).
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)',
  ],
}
