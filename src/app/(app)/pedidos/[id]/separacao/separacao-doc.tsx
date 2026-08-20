'use client'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ArrowLeft, PackageX, Printer, Save } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import type { EmpresaDoDocumento } from '../../../empresas/actions'
import type { OrcamentoComItens } from '../../actions'
import { salvarFaltantesAction, type Faltante } from '../../faltantes-actions'
import { IdentidadeEmpresa } from '../empresa-doc'
import { Logo } from '@/components/brand/logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

// Via de separação: SEM preço, kit quebrado em componentes — é a lista que
// a pessoa usa pra separar de verdade (produto, quantidade e cliente).
//
// O que sai em cada linha e em que ordem é decidido por src/lib/separacao.ts,
// que é puro; aqui só se exibe. O catálogo vem resolvido do server (page.tsx).
//
// É AQUI QUE SE MARCA O QUE FALTA, e não numa lista à parte: esta lista já
// explode o kit, resolve o tamanho real de cada peça e soma as linhas iguais
// vindas de itens diferentes. Uma segunda lista com a mesma promessa acabaria
// divergindo desta, e a que diverge é a que mente. A coluna "Faltam" só existe
// na TELA — a via impressa continua sendo a de sempre, sem coluna a mais.
export function SeparacaoDoc({
  orcamento,
  empresa,
  catalogo,
  faltantesSalvos,
  podeEditar,
}: {
  orcamento: OrcamentoComItens
  empresa: EmpresaDoDocumento | null
  catalogo: CatalogoSeparacao
  faltantesSalvos: Faltante[]
  podeEditar: boolean
}) {
  const linhas = montarLinhasSeparacao(orcamento.itens, catalogo)
  const totalUnidades = linhas.reduce((s, l) => s + l.quantidade, 0)

  const router = useRouter()
  const [salvando, startTransition] = useTransition()
  // Campo por linha, guardado como TEXTO: vazio é "não falta nada", que é
  // diferente de zero digitado — e apagar o campo não pode virar 0 na hora.
  const [faltam, setFaltam] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      faltantesSalvos.map((f) => [f.chave, String(f.quantidade)]),
    ),
  )
  const [sujo, setSujo] = useState(false)

  const totalFaltante = linhas.reduce(
    (s, l) => s + Math.min(Number(faltam[l.chave] ?? 0) || 0, l.quantidade),
    0,
  )

  function digitar(chave: string, valor: string, maximo: number) {
    const so = valor.replace(/\D/g, '')
    // Aparado no que a linha tem: não dá pra faltar 5 de uma linha de 3. A
    // action confere de novo no servidor.
    const n = so === '' ? '' : String(Math.min(Number(so), maximo))
    setFaltam((prev) => ({ ...prev, [chave]: n }))
    setSujo(true)
  }

  function salvar() {
    startTransition(async () => {
      const r = await salvarFaltantesAction(
        orcamento.id,
        linhas.map((l) => ({
          chave: l.chave,
          descricao: l.descricao,
          quantidade: Number(faltam[l.chave] ?? 0) || 0,
        })),
      )
      if (!r.success) {
        toast.error(r.error)
        return
      }
      toast.success(r.message ?? 'Faltantes salvos')
      setSujo(false)
      router.refresh()
    })
  }

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
          {totalFaltante > 0 && (
            <Button
              variant="outline"
              render={<Link href={`/pedidos/${orcamento.id}/faltantes`} />}
            >
              <PackageX />
              Via de faltantes
            </Button>
          )}
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

      {/* Cliente */}
      <div>
        <div className="text-muted-foreground text-xs tracking-wide uppercase">
          Cliente
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
            {podeEditar && <col className="w-24 print:hidden" />}
          </colgroup>
          <TableHeader>
            {/* Só na impressão: o <thead> se repete em toda página, então
                esta linha é o que identifica a página 2 em diante — sem ela
                a folha solta é uma lista de itens sem dono. O colSpan é 2
                porque na impressão a coluna "Faltam" não existe. */}
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
              {podeEditar && (
                <TableHead className="text-right print:hidden">
                  Faltam
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((l) => (
              <TableRow key={l.chave}>
                <TableCell className="font-medium break-words whitespace-normal">
                  {l.descricao}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {l.quantidade.toLocaleString('pt-BR')}
                </TableCell>
                {podeEditar && (
                  <TableCell className="text-right print:hidden">
                    <Input
                      value={faltam[l.chave] ?? ''}
                      onChange={(e) =>
                        digitar(l.chave, e.target.value, l.quantidade)
                      }
                      disabled={salvando}
                      inputMode="numeric"
                      placeholder="0"
                      aria-label={`Faltam de ${l.descricao}`}
                      className="h-8 w-16 text-center tabular-nums"
                    />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="font-semibold">Total</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">
                {totalUnidades.toLocaleString('pt-BR')}
              </TableCell>
              {podeEditar && (
                <TableCell className="text-right font-semibold tabular-nums print:hidden">
                  {totalFaltante > 0 ? totalFaltante.toLocaleString('pt-BR') : '—'}
                </TableCell>
              )}
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      {/* Marcação do que faltou — só na tela. */}
      {podeEditar && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 print:hidden">
          <p className="text-muted-foreground text-xs">
            Digite em <strong>Faltam</strong> o que não achou na hora de
            separar. O sistema não sabe o que tem em estoque — quem sabe é
            você. O que ficar marcado sai na <strong>via de faltantes</strong>,
            que é a lista do que produzir.
          </p>
          <Button onClick={salvar} loading={salvando} disabled={salvando || !sujo}>
            <Save />
            Salvar faltantes
          </Button>
        </div>
      )}

      <p className="text-muted-foreground border-t pt-3 text-xs print:border-foreground/20">
        Documento gerado em{' '}
        {format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} — via de
        separação, sem valores.
      </p>
    </div>
  )
}
