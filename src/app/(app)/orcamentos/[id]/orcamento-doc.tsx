'use client'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ArrowLeft, ClipboardList, FileSignature, Printer } from 'lucide-react'
import Link from 'next/link'

import type { OrcamentoComItens } from '../actions'
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

function reais(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Documento do orçamento, pronto pra imprimir/salvar em PDF (a impressão
// esconde sidebar/topbar e a barra de ações pelo print:hidden global).
export function OrcamentoDoc({ orcamento }: { orcamento: OrcamentoComItens }) {
  return (
    <div className="mx-auto max-w-3xl space-y-6 print:space-y-4">
      {/* Barra de ações (fora da impressão) */}
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Button
          render={<Link href="/orcamentos" />}
          variant="ghost"
          size="icon-sm"
          aria-label="Voltar"
        >
          <ArrowLeft />
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            render={<Link href={`/orcamentos/${orcamento.id}/separacao`} />}
          >
            <ClipboardList />
            Via de separação
          </Button>
          <Button
            variant="outline"
            render={<Link href={`/orcamentos/${orcamento.id}/romaneio`} />}
          >
            <FileSignature />
            Romaneio
          </Button>
          <Button onClick={() => window.print()}>
            <Printer />
            Imprimir / PDF
          </Button>
        </div>
      </div>

      {/* Cabeçalho do documento */}
      <div className="flex items-start justify-between gap-4 border-b pb-4 print:border-foreground/20">
        <div className="flex items-center gap-3">
          <Logo variant="mark" className="size-10" />
          <div>
            <div className="text-lg font-semibold">Vanvest Home Decor</div>
            <div className="text-muted-foreground text-sm">
              Orçamento nº {orcamento.numero}
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

      {/* Cliente */}
      <div>
        <div className="text-muted-foreground text-xs tracking-wide uppercase">
          Cliente
        </div>
        <div className="mt-0.5 text-base font-medium">{orcamento.cliente}</div>
      </div>

      {/* Itens — descrição QUEBRA LINHA (nada de cortar no PDF) */}
      <div className="rounded-lg border print:border-foreground/20">
        <Table className="table-fixed">
          {/* As larguras vivem aqui, e não na primeira linha: `table-fixed`
              tira as colunas da primeira linha do <thead>, que na impressão
              é a faixa de identificação (um só <th> com colSpan). */}
          <colgroup>
            <col />
            <col className="w-14 sm:w-16" />
            <col className="w-24 sm:w-28" />
            <col className="w-24 sm:w-28" />
          </colgroup>
          <TableHeader>
            {/* Só na impressão: o <thead> se repete em toda página, então
                esta linha é o que identifica a página 2 em diante — sem ela
                a folha solta é uma lista de itens sem dono. */}
            <TableRow className="hidden print:table-row">
              <TableHead
                colSpan={4}
                className="text-muted-foreground h-auto py-1 text-[10px] font-normal"
              >
                Orçamento nº {orcamento.numero} · Vanvest Home Decor
              </TableHead>
            </TableRow>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Qtd</TableHead>
              <TableHead className="text-right">Preço un.</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orcamento.itens.map((it) => (
              <TableRow key={it.id}>
                <TableCell className="font-medium break-words whitespace-normal">
                  {it.descricao}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {it.quantidade.toLocaleString('pt-BR')}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {reais(Number(it.precoUnitario))}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {reais(it.quantidade * Number(it.precoUnitario))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="font-semibold">Total</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">
                {orcamento.itens
                  .reduce((s, it) => s + it.quantidade, 0)
                  .toLocaleString('pt-BR')}
              </TableCell>
              <TableCell />
              <TableCell className="text-right text-base font-semibold tabular-nums">
                {reais(orcamento.total)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      {/* Observações */}
      {orcamento.observacao && (
        <div>
          <div className="text-muted-foreground text-xs tracking-wide uppercase">
            Observações
          </div>
          <p className="mt-1 text-sm whitespace-pre-wrap">
            {orcamento.observacao}
          </p>
        </div>
      )}

      <p className="text-muted-foreground border-t pt-3 text-xs print:border-foreground/20">
        Documento gerado em{' '}
        {format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} —
        valores sujeitos a confirmação.
      </p>
    </div>
  )
}
