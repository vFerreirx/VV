'use client'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  ArrowLeft,
  ClipboardList,
  FileSignature,
  PackageX,
  Printer,
  TriangleAlert,
} from 'lucide-react'
import Link from 'next/link'

import type { EmpresaDoDocumento } from '../../empresas/actions'
import type { OrcamentoComItens } from '../actions'
import { IdentidadeEmpresa, nomeDestaque } from './empresa-doc'
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
  avisoSemPeso,
  formatarGramas,
  formatarKg,
  type ResumoPeso,
} from '@/lib/peso'
import { ROTULO_FORMA } from '@/lib/pagamento'
import { temDesconto, temFrete } from '@/lib/total-pedido'
import { formatarNumeroPedido } from '@/lib/validators/orcamentos'

function reais(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Documento do orçamento, pronto pra imprimir/salvar em PDF (a impressão
// esconde sidebar/topbar e a barra de ações pelo print:hidden global).
export function OrcamentoDoc({
  orcamento,
  empresa,
  pesos,
  faltantes,
}: {
  orcamento: OrcamentoComItens
  empresa: EmpresaDoDocumento | null
  pesos: ResumoPeso
  /** Peças já marcadas como faltantes — só pro contador do botão. */
  faltantes: number
}) {
  const aviso = avisoSemPeso(pesos.itensSemPeso)
  const comFrete = temFrete(orcamento.freteValor)
  const comDesconto = temDesconto(orcamento.descontoPercentual)
  // O rodapé vira NOTA DISCRIMINADA quando existe qualquer linha entre o
  // subtotal e o total. Sem desconto e sem frete ele continua sendo a linha
  // única "Total" de sempre.
  const comLinhaExtra = comDesconto || comFrete
  // "Desconto Pix (5%)" quando a forma é pix; sem forma pix o desconto
  // existe do mesmo jeito, e cravar "Pix" ali seria afirmar um meio de
  // pagamento que ninguém escolheu.
  const rotuloDesconto = `Desconto${
    orcamento.pagamentoForma === 'pix' ? ' Pix' : ''
  } (${Number(orcamento.descontoPercentual)
    .toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%)`

  return (
    <div className="mx-auto max-w-3xl space-y-6 print:space-y-4">
      {/* Barra de ações (fora da impressão) */}
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Button
          render={<Link href="/pedidos" />}
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
          <Button
            variant="outline"
            render={<Link href={`/pedidos/${orcamento.id}/romaneio`} />}
          >
            <FileSignature />
            Romaneio
          </Button>
          {/* Terceiro documento, irmão dos dois de cima. O número é o que já
              foi marcado como faltante na via de separação. */}
          <Button
            variant="outline"
            render={<Link href={`/pedidos/${orcamento.id}/faltantes`} />}
          >
            <PackageX />
            Itens faltantes
            {faltantes > 0 && (
              <span className="rounded-full bg-amber-500/15 px-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                {faltantes}
              </span>
            )}
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
            <IdentidadeEmpresa empresa={empresa} />
            <div className="text-muted-foreground mt-1 text-sm">
              Pedido nº {formatarNumeroPedido(orcamento.numero)}
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
          {/* SÓ QUANDO INFORMADA. Sem forma escolhida o documento não diz
              nada sobre pagamento — "Pagamento — não informado" seria uma
              linha a explicar numa via que vai pro cliente. */}
          {orcamento.pagamentoForma && (
            <div className="text-muted-foreground mt-1">
              Pagamento — {ROTULO_FORMA[orcamento.pagamentoForma]}
            </div>
          )}
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
            {/* Peso: só na TELA. É dado interno pra cotar frete — o papel
                que vai pro cliente continua igual ao de antes. O
                `print:hidden` vai no <col> E nas células; sozinho, o col
                não esconde a coluna em todos os navegadores. */}
            <col className="w-20 print:hidden sm:w-24" />
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
                Pedido nº {formatarNumeroPedido(orcamento.numero)} ·{' '}
                {nomeDestaque(empresa)}
              </TableHead>
            </TableRow>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Qtd</TableHead>
              <TableHead className="text-right print:hidden">Peso</TableHead>
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
                <TableCell className="text-muted-foreground text-right tabular-nums print:hidden">
                  {formatarGramas(pesos.porItem[it.id] ?? null)}
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
          {/* FORMATO DE NOTA quando há desconto ou frete: subtotal dos
              produtos, as linhas que explicam, e o total. É o papel que vai
              pro cliente — um total diferente da soma dos itens, sem a linha
              que explica, gera ligação.

              O QUE NÃO FOI INFORMADO NÃO SAI, e sem nenhuma das duas o rodapé
              volta a ser o de sempre (uma linha "Total"). "Frete R$ 0,00"
              leria como "por nossa conta" e "Desconto R$ 0,00" como
              "negociamos e não houve" — duas afirmações que ninguém fez.

              CADA LINHA DAQUI TEM AS CINCO CÉLULAS, com a de peso
              `print:hidden`: a coluna de peso é só de tela (ver o colgroup
              lá em cima), e uma célula a menos desalinha a nota inteira. */}
          <TableFooter>
            <TableRow>
              <TableCell
                className={comLinhaExtra ? 'font-medium' : 'font-semibold'}
              >
                {comLinhaExtra ? 'Subtotal produtos' : 'Total'}
              </TableCell>
              <TableCell className="text-right font-semibold tabular-nums">
                {orcamento.itens
                  .reduce((s, it) => s + it.quantidade, 0)
                  .toLocaleString('pt-BR')}
              </TableCell>
              <TableCell className="text-right font-semibold tabular-nums print:hidden">
                {formatarKg(pesos.totalGramas)}
              </TableCell>
              <TableCell />
              <TableCell
                className={
                  comLinhaExtra
                    ? 'text-right tabular-nums'
                    : 'text-right text-base font-semibold tabular-nums'
                }
              >
                {reais(orcamento.total)}
              </TableCell>
            </TableRow>
            {/* Desconto ANTES do frete, e negativo: ele mordeu o subtotal
                logo acima e não encosta no frete logo abaixo. A ordem das
                linhas é a própria conta. */}
            {comDesconto && (
              <TableRow>
                <TableCell className="font-medium">{rotuloDesconto}</TableCell>
                <TableCell />
                <TableCell className="print:hidden" />
                <TableCell />
                <TableCell className="text-right tabular-nums">
                  −{reais(orcamento.desconto)}
                </TableCell>
              </TableRow>
            )}
            {comFrete && (
              <TableRow>
                <TableCell className="font-medium">Frete</TableCell>
                <TableCell />
                <TableCell className="print:hidden" />
                <TableCell />
                <TableCell className="text-right tabular-nums">
                  {reais(Number(orcamento.freteValor))}
                </TableCell>
              </TableRow>
            )}
            {comLinhaExtra && (
              <TableRow>
                <TableCell className="font-semibold">Total</TableCell>
                <TableCell />
                <TableCell className="print:hidden" />
                <TableCell />
                <TableCell className="text-right text-base font-semibold tabular-nums">
                  {reais(orcamento.totalFinal)}
                </TableCell>
              </TableRow>
            )}
          </TableFooter>
        </Table>
      </div>

      {/* Aviso de peso incompleto — só na tela, junto do número que ele
          qualifica. Sem isso o total pareceria fechado quando não é. */}
      {aviso && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 print:hidden dark:text-amber-400">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <div>
            {aviso} — o peso total ({formatarKg(pesos.totalGramas)}) conta só
            o que está cadastrado. Preencha o peso em Variações → Tamanhos.
          </div>
        </div>
      )}

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
