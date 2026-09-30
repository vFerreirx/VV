import type { Metadata } from 'next'

import { listarEstacoesParaAparelho } from './actions'
import { EscolherEstacao } from './escolher-estacao'
import { estacaoDoAparelho } from '@/lib/auth/estacao-do-aparelho'
import { requireRole } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Este aparelho — Vanvest' }

// "ESTE APARELHO" — onde o gerente diz em que estação fica o tablet.
//
// A estação é do APARELHO, não do operador (src/lib/producao/cobertura.ts).
// Acontece uma vez por tablet: o gerente entra nele com a senha dele, abre
// isto pelo menu do usuário, escolhe a estação e sai. O cookie fica no
// aparelho e sobrevive à troca de operador (src/lib/auth/estacao-do-aparelho.ts).
//
// ⚠️ FIXO EM ADMIN E GERENTE, pelo cargo, e fora de /permissoes — como
// /configuracoes, não é uma área da fábrica: é a configuração do aparelho que
// está na mão. A action confere o cargo de novo do lado dela.
export default async function EsteAparelhoPage() {
  await requireRole(['admin', 'gerente_producao'])
  const [atual, estacoes] = await Promise.all([
    estacaoDoAparelho(),
    listarEstacoesParaAparelho(),
  ])

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Este aparelho</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Em que estação fica este tablet. A tela dele abre nas máquinas dessa
          estação, e as outras ficam a um toque. Fica gravado só neste
          aparelho, e continua valendo quando você sair.
        </p>
      </div>

      <EscolherEstacao
        atualId={atual?.id ?? null}
        atualNome={atual?.nome ?? null}
        estacoes={estacoes}
      />
    </div>
  )
}
