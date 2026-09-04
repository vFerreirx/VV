import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { obterEmpresaPrincipal } from '../../empresas/actions'
import { obterCatalogoDePesos, obterOrcamento } from '../actions'
import { listarFaltantes } from '../faltantes-actions'
import { obterSituacaoFrete } from '../frete-actions'
import { FretePainel } from './frete-painel'
import { OrcamentoDoc } from './orcamento-doc'
import { PagamentoPainel } from './pagamento-painel'
import { podeEscrever } from '@/lib/auth/permissoes'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { requireArea } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import { compradores } from '@/lib/db/schema'
import { calcularPesos } from '@/lib/peso'
import { and, eq, isNull } from 'drizzle-orm'

export const metadata: Metadata = { title: 'Pedido — Vanvest' }

export default async function OrcamentoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requireArea('vendas')
  const { id } = await params

  // A empresa é carregada AQUI, no server component — o componente de
  // impressão só recebe o que já veio resolvido.
  const [orcamento, empresa, catalogo, situacaoFrete, faltantes] =
    await Promise.all([
      obterOrcamento(id),
      obterEmpresaPrincipal(),
      obterCatalogoDePesos(),
      obterSituacaoFrete(),
      listarFaltantes(id),
    ])
  if (!orcamento) notFound()

  // O peso é calculado AQUI, a cada leitura, a partir do catálogo de agora —
  // não é snapshot como o preço. Ver o comentário em src/lib/peso.ts.
  const pesos = calcularPesos(orcamento.itens, catalogo)

  const podeEditar = podeEscrever(await nivelDaAreaPara(user.role, 'vendas'))

  // CEP do comprador vinculado, quando há — é o destino padrão da cotação.
  let cepDoComprador: string | null = null
  if (orcamento.compradorId) {
    const [c] = await db
      .select({ cep: compradores.cep })
      .from(compradores)
      .where(
        and(
          eq(compradores.id, orcamento.compradorId),
          isNull(compradores.deletedAt),
        ),
      )
      .limit(1)
    cepDoComprador = c?.cep ?? null
  }

  // A MERCADORIA — é dela que sai o valor declarado da cotação (40% em
  // src/lib/frete.ts). Nada de `orcamento.totalComFrete` aqui: segurar o
  // frete dentro da carga que ele transporta encarece a própria cotação.
  const totalCentavos = orcamento.itens.reduce(
    (s, it) => s + Math.round(it.quantidade * Number(it.precoUnitario) * 100),
    0,
  )

  return (
    <div className="space-y-6">
      <OrcamentoDoc
        orcamento={orcamento}
        empresa={empresa}
        pesos={pesos}
        faltantes={faltantes.reduce((s, f) => s + f.quantidade, 0)}
      />
      {/* Entre o documento e o frete: é o que foi COMBINADO com o cliente
          (forma e desconto), enquanto o painel abaixo cota o custo do envio.
          O desconto sai daqui e não encosta no frete. */}
      <PagamentoPainel
        orcamentoId={orcamento.id}
        totalMercadoria={orcamento.total}
        freteValor={orcamento.freteValor}
        forma={orcamento.pagamentoForma}
        descontoPercentual={orcamento.descontoPercentual}
        podeEditar={podeEditar}
      />
      <FretePainel
        orcamentoId={orcamento.id}
        situacao={situacaoFrete}
        cepDoComprador={cepDoComprador}
        pesoGramas={pesos.totalGramas}
        itensSemPeso={orcamento.itens
          .filter((it) => pesos.porItem[it.id] == null)
          .map((it) => it.descricao)}
        totalCentavos={totalCentavos}
        salvo={{
          transportadora: orcamento.freteTransportadora,
          servico: orcamento.freteServico,
          valor: orcamento.freteValor,
          prazoDias: orcamento.fretePrazoDias,
          cepDestino: orcamento.freteCepDestino,
          cotadoEm: orcamento.freteCotadoEm,
        }}
        podeEditar={podeEditar}
      />
    </div>
  )
}
