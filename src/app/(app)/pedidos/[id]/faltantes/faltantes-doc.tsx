'use client'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ArrowLeft, ClipboardList, Printer, TriangleAlert } from 'lucide-react'
import Link from 'next/link'

import type { EmpresaDoDocumento } from '../../../empresas/actions'
import type { OrcamentoComItens } from '../../actions'
import type { Faltante } from '../../faltantes-actions'
import { IdentidadeEmpresa } from '../empresa-doc'
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
import {
  montarLinhasSeparacao,
  type CatalogoSeparacao,
} from '@/lib/separacao'
import { formatarNumeroPedido } from '@/lib/validators/orcamentos'

// VIA DE ITENS FALTANTES: o que a separação não achou e a fábrica precisa
// produzir. Irmã da via de separação e do romaneio, no mesmo layout — sem
// preço, só peça e quantidade.
//
// A ORDEM É A DA VIA DE SEPARAÇÃO, de propósito: é a mesma lista, filtrada
// pelo que ficou marcado. Quem produz encontra as peças no mesmo lugar da
// folha em que quem separou as procurou.
//
// ESTE DOCUMENTO NÃO GERA OP. Ele diz o que fazer; abrir ordem de produção
// continua sendo decisão de gente, na tela de ordens.
export function FaltantesDoc({
  orcamento,
  empresa,
  catalogo,
  faltantes,
}: {
  orcamento: OrcamentoComItens
  empresa: EmpresaDoDocumento | null
  catalogo: CatalogoSeparacao
  faltantes: Faltante[]
}) {
  // A via de separação inteira, e só depois o filtro: é ela que dá a ORDEM e
  // é contra ela que se sabe o que ainda existe no pedido.
  const daSeparacao = montarLinhasSeparacao(orcamento.itens, catalogo)
  const marcado = new Map(faltantes.map((f) => [f.chave, f.quantidade]))
  const linhas = daSeparacao
    .map((l) => ({ ...l, faltam: marcado.get(l.chave) ?? 0 }))
    .filter((l) => l.faltam > 0)

  // Marcação que não casa com nenhuma linha da via de hoje: o item saiu do
  // pedido depois de alguém marcar. Não some em silêncio — sai num aviso, com
  // o texto que estava na tela naquele momento (é pra isso que a descrição
  // fica guardada junto). O aviso não vai pro papel.
  const chavesDaVia = new Set(daSeparacao.map((l) => l.chave))
  const orfas = faltantes.filter((f) => !chavesDaVia.has(f.chave))

  const total = linhas.reduce((s, l) => s + l.faltam, 0)

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
        <div className="flex gap-2">
          <Button
            variant="outline"
            render={<Link href={`/pedidos/${orcamento.id}/separacao`} />}
          >
            <ClipboardList />
            Via de separação
          </Button>
          <Button onClick={() => window.print()} disabled={linhas.length === 0}>
            <Printer />
            Imprimir / PDF
          </Button>
        </div>
      </div>

      {orfas.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 print:hidden dark:text-amber-400">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <div>
            <div className="font-medium">
              {orfas.length} marcação(ões) não estão mais no pedido.
            </div>
            <div className="mt-1 space-y-0.5">
              {orfas.map((f) => (
                <div key={f.chave}>
                  {f.descricao} — {f.quantidade}
                </div>
              ))}
            </div>
            <div className="mt-1">
              O item foi alterado ou removido depois da marcação. Abra a via de
              separação e salve de novo pra limpar.
            </div>
          </div>
        </div>
      )}

      {/* Cabeçalho do documento */}
      <div className="flex items-start justify-between gap-4 border-b pb-4 print:border-foreground/20">
        <div className="flex items-center gap-3">
          <Logo variant="mark" className="size-10" />
          <div>
            <IdentidadeEmpresa empresa={empresa} />
            <div className="text-muted-foreground mt-1 text-sm">
              Itens faltantes — Pedido nº{' '}
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

      {/* Cliente */}
      <div>
        <div className="text-muted-foreground text-xs tracking-wide uppercase">
          Cliente
        </div>
        <div className="mt-0.5 text-base font-medium">{orcamento.cliente}</div>
      </div>

      {linhas.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border p-6 text-center text-sm print:hidden">
          Nada marcado como faltante neste pedido. A marcação é feita na{' '}
          <Link
            href={`/pedidos/${orcamento.id}/separacao`}
            className="underline"
          >
            via de separação
          </Link>
          .
        </div>
      ) : (
        <div className="rounded-lg border print:border-foreground/20">
          <Table className="table-fixed">
            <colgroup>
              <col />
              <col className="w-24" />
            </colgroup>
            <TableHeader>
              {/* Identifica a página 2 em diante na impressão — o <thead> se
                  repete em toda folha. */}
              <TableRow className="hidden print:table-row">
                <TableHead
                  colSpan={2}
                  className="text-muted-foreground h-auto py-1 text-[10px] font-normal"
                >
                  Itens faltantes — Pedido nº{' '}
                  {formatarNumeroPedido(orcamento.numero)} · {orcamento.cliente}
                </TableHead>
              </TableRow>
              <TableRow>
                <TableHead>Produzir</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => (
                <TableRow key={l.chave}>
                  <TableCell className="font-medium break-words whitespace-normal">
                    {l.descricao}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.faltam.toLocaleString('pt-BR')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold">Total</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {total.toLocaleString('pt-BR')}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}

      <p className="text-muted-foreground border-t pt-3 text-xs print:border-foreground/20">
        Documento gerado em{' '}
        {format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} — o que
        faltou na separação deste pedido, sem valores.
      </p>
    </div>
  )
}
