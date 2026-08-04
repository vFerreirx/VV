'use client'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ArrowLeft, Printer } from 'lucide-react'
import Link from 'next/link'

import type { OrcamentoComItens } from '../../actions'
import { Logo } from '@/components/brand/logo'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatarNumeroPedido } from '@/lib/validators/orcamentos'

type LinhaSeparacao = { descricao: string; quantidade: number }

// Explode kit em componentes (quantidade do componente × quantidade do
// item) e soma linhas de mesmo produto/cor/tamanho vindas de itens
// diferentes — é o total real que a pessoa vai separar. Itens sem
// kitComponentes (produto avulso OU orçamento antigo, sem essa coluna)
// caem pra descrição em texto, sem quebrar.
function montarLinhas(itens: OrcamentoComItens['itens']): LinhaSeparacao[] {
  const totais = new Map<string, number>()
  const ordem: string[] = []

  function somar(descricao: string, quantidade: number) {
    if (!totais.has(descricao)) {
      totais.set(descricao, 0)
      ordem.push(descricao)
    }
    totais.set(descricao, totais.get(descricao)! + quantidade)
  }

  for (const it of itens) {
    const componentes = it.kitComponentes
    if (componentes && componentes.length > 0) {
      for (const c of componentes) {
        // Tamanho do COMPONENTE (capa é 45x45 mesmo num kit Queen). Cai pro
        // tamanho do item quando o snapshot é antigo e não tem tamanho.
        const tam = c.tamanho ?? it.tamanho
        const descricao = [`${c.produtoNome}${tam ? ` ${tam}` : ''}`, c.cor]
          .filter(Boolean)
          .join(' - ')
        somar(descricao, c.quantidade * it.quantidade)
      }
    } else {
      somar(it.descricao, it.quantidade)
    }
  }

  return ordem.map((descricao) => ({
    descricao,
    quantidade: totais.get(descricao)!,
  }))
}

// Via de separação: SEM preço, kit quebrado em componentes — é a lista que
// a pessoa usa pra separar de verdade (produto, quantidade e comprador).
export function SeparacaoDoc({ orcamento }: { orcamento: OrcamentoComItens }) {
  const linhas = montarLinhas(orcamento.itens)
  const totalUnidades = linhas.reduce((s, l) => s + l.quantidade, 0)

  return (
    <div className="mx-auto max-w-3xl space-y-6 print:space-y-4">
      {/* Barra de ações (fora da impressão) */}
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Button
          render={<Link href={`/pedidos/${orcamento.id}`} />}
          variant="ghost"
          size="icon-sm"
          aria-label="Voltar"
        >
          <ArrowLeft />
        </Button>
        <Button onClick={() => window.print()}>
          <Printer />
          Imprimir / PDF
        </Button>
      </div>

      {/* Cabeçalho do documento */}
      <div className="flex items-start justify-between gap-4 border-b pb-4 print:border-foreground/20">
        <div className="flex items-center gap-3">
          <Logo variant="mark" className="size-10" />
          <div>
            <div className="text-lg font-semibold">Vanvest Home Decor</div>
            <div className="text-muted-foreground text-sm">
              Via de separação — Pedido nº{' '}
              {formatarNumeroPedido(orcamento.numero)}
            </div>
          </div>
        </div>
        <div className="text-right text-sm">
          <div className="text-muted-foreground">Data</div>
          <div className="font-medium tabular-nums">
            {format(new Date(orcamento.createdAt), 'dd/MM/yyyy', {
              locale: ptBR,
            })}
          </div>
        </div>
      </div>

      {/* Comprador */}
      <div>
        <div className="text-muted-foreground text-xs tracking-wide uppercase">
          Comprador
        </div>
        <div className="mt-0.5 text-base font-medium">{orcamento.cliente}</div>
      </div>

      {/* Itens — sem preço nenhum, só o que separar */}
      <div className="rounded-lg border print:border-foreground/20">
        <Table className="table-fixed">
          {/* As larguras vivem aqui, e não na primeira linha: `table-fixed`
              tira as colunas da primeira linha do <thead>, que na impressão
              é a faixa de identificação (um só <th> com colSpan). */}
          <colgroup>
            <col />
            <col className="w-20" />
          </colgroup>
          <TableHeader>
            {/* Só na impressão: o <thead> se repete em toda página, então
                esta linha é o que identifica a página 2 em diante — sem ela
                a folha solta é uma lista de itens sem dono. */}
            <TableRow className="hidden print:table-row">
              <TableHead
                colSpan={2}
                className="text-muted-foreground h-auto py-1 text-[10px] font-normal"
              >
                Via de separação — Pedido nº{' '}
                {formatarNumeroPedido(orcamento.numero)} · {orcamento.cliente}
              </TableHead>
            </TableRow>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead className="text-right">Qtd</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((l) => (
              <TableRow key={l.descricao}>
                <TableCell className="font-medium break-words whitespace-normal">
                  {l.descricao}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {l.quantidade.toLocaleString('pt-BR')}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="font-semibold">Total</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">
                {totalUnidades.toLocaleString('pt-BR')}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      <p className="text-muted-foreground border-t pt-3 text-xs print:border-foreground/20">
        Documento gerado em{' '}
        {format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} — via de
        separação, sem valores.
      </p>
    </div>
  )
}
