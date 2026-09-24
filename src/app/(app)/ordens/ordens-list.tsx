'use client'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Search,
} from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  excluirMultiplasOrdensAction,
  type OrdemListItem,
  type ProdutoComVariacoesParaForm,
} from './actions'
import { OpDetailSheet } from '@/app/(app)/producao/op-detail-sheet'
import { CodigoDoProduto } from '@/components/ordens/codigo-do-produto'
import { BotaoNovaOp } from '@/components/ordens/nova-op-dialog'
import type { RemessaFullOpcao } from './remessas-actions'
import { Badge } from '@/components/ui/badge'
import { BulkActionBar } from '@/components/ui/bulk-action-bar'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PRIORIDADE_BADGE } from '@/lib/prioridade'
import { cn } from '@/lib/utils'
import {
  CANAL_LABEL_CURTO,
  PRIORIDADE_LABEL,
  STATUS_LABEL_CURTO,
  canalValues,
  prioridadeValues,
  STATUS_FILTRAVEIS,
  statusValues,
  type OrdensFiltros,
} from '@/lib/validators/ordens'

const STATUS_BADGE: Record<(typeof statusValues)[number], string> = {
  aguardando_materia_prima: 'bg-zinc-500 text-white',
  programado: 'bg-blue-500 text-white',
  em_producao: 'bg-emerald-500 text-white',
  acabamento: 'bg-cyan-600 text-white',
  embalagem: 'bg-violet-500 text-white',
  pronto_envio: 'bg-amber-500 text-white',
  enviado: 'bg-emerald-700 text-white',
  cancelado: 'bg-muted text-muted-foreground',
}

type Props = {
  ordens: OrdemListItem[]
  total: number
  pagina: number
  totalPaginas: number
  remessas: RemessaFullOpcao[]
  podeEditar: boolean
  filtrosIniciais: OrdensFiltros
  produtosNovaOp: ProdutoComVariacoesParaForm[]
  /** Admin ou gerente: as ações de produção do painel lateral. */
  gestor: boolean
  /** Escrita no kanban: o Status manual do painel. */
  podeMoverKanban: boolean
}

// "27/30 · 2 ref." — o que a OP rendeu, contra a meta. Vazio enquanto não há
// apontamento: um "0/30" diria que a produção deu zero, quando ela nem foi
// registrada.
function resultadoDe(o: OrdemListItem): string {
  if (o.produzido === 0 && o.refugo === 0) return ''
  return `${o.produzido}/${o.quantidade}${o.refugo > 0 ? ` · ${o.refugo} ref.` : ''}`
}

export function OrdensList({
  ordens,
  total,
  pagina,
  totalPaginas,
  remessas,
  podeEditar,
  filtrosIniciais,
  produtosNovaOp,
  gestor,
  podeMoverKanban,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [busca, setBusca] = useState(filtrosIniciais.q ?? '')
  // CLICAR NA OP ABRE O PAINEL LATERAL, o mesmo do kanban, sem sair da lista.
  // "Abrir OP completa" dentro dele continua indo pra /ordens/[id].
  const [detalheId, setDetalheId] = useState<string | null>(null)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [bulkExcluindo, setBulkExcluindo] = useState(false)

  function toggleOne(id: string) {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function toggleAll() {
    setSelecionados((prev) => {
      if (prev.size === ordens.length) return new Set()
      return new Set(ordens.map((o) => o.id))
    })
  }
  function limparSelecao() {
    setSelecionados(new Set())
  }
  const allChecked = ordens.length > 0 && selecionados.size === ordens.length
  const someChecked = selecionados.size > 0 && !allChecked
  const idsSelecionados = useMemo(
    () => Array.from(selecionados),
    [selecionados],
  )

  function aplicarFiltro(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(updates)) {
      // ⚠️ STATUS É A EXCEÇÃO. Sem status na URL a lista abre em "Abertas",
      // então "todos" precisa FICAR na URL — apagá-lo, como os outros filtros
      // fazem com "todos"/"todas", mandaria o "Todas" de volta pra "Abertas".
      // "abertas" é que some: é o padrão.
      const ehPadrao =
        k === 'status' ? v === 'abertas' : v === 'todos' || v === 'todas'
      if (!v || ehPadrao) params.delete(k)
      else params.set(k, v)
    }
    // Mudou filtro -> volta pra primeira página.
    if (!('pagina' in updates)) params.delete('pagina')
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }

  function irPagina(n: number) {
    aplicarFiltro({ pagina: n <= 1 ? undefined : String(n) })
  }

  function onBuscaSubmit(e: React.FormEvent) {
    e.preventDefault()
    aplicarFiltro({ q: busca.trim() || undefined })
  }

  // Sem status na URL = "abertas" (ver `listarOrdens`).
  const statusAtual = filtrosIniciais.status ?? 'abertas'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {[
          // ABERTAS É O PADRÃO: tudo sem baixa e sem cancelamento — o que se
          // procura aqui no dia a dia, e o que o gerente confere na virada.
          { label: 'Abertas', val: 'abertas' },
          // "Com baixa", e não "Concluídas": concluída é a PRODUÇÃO, que
          // continua no board. Este chip filtra `enviado`.
          { label: 'Com baixa', val: 'enviado' },
          { label: 'Canceladas', val: 'cancelado' },
          { label: 'Todas', val: 'todos' },
        ].map((chip) => {
          const ativo = statusAtual === chip.val
          return (
            <button
              key={chip.label}
              type="button"
              onClick={() => aplicarFiltro({ status: chip.val })}
              disabled={isPending}
              className={cn(
                'rounded-full border px-3 py-1 text-xs transition-colors',
                ativo
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'hover:bg-accent',
              )}
            >
              {chip.label}
            </button>
          )
        })}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form onSubmit={onBuscaSubmit} className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              placeholder="Buscar por número, código, SKU ou produto…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-8"
              disabled={isPending}
            />
          </div>
          <Button type="submit" variant="outline" size="sm" disabled={isPending}>
            Buscar
          </Button>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={statusAtual}
            onValueChange={(v) => aplicarFiltro({ status: v ?? undefined })}
          >
            <SelectTrigger size="sm" className="min-w-[10rem]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="abertas">Abertas</SelectItem>
              <SelectItem value="todos">Todos status</SelectItem>
              {/* STATUS_FILTRAVEIS, não statusValues: acabamento e
                  embalagem saíram do fluxo e não são mais escolhíveis. O
                  STATUS_BADGE acima mantém as 8 entradas — ele desenha o
                  que já existe, inclusive OP antiga. */}
              {STATUS_FILTRAVEIS.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL_CURTO[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filtrosIniciais.canal ?? 'todos'}
            onValueChange={(v) => aplicarFiltro({ canal: v ?? undefined })}
          >
            <SelectTrigger size="sm" className="min-w-[8rem]">
              <SelectValue placeholder="Canal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos canais</SelectItem>
              {canalValues.map((c) => (
                <SelectItem key={c} value={c}>
                  {CANAL_LABEL_CURTO[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filtrosIniciais.prioridade ?? 'todas'}
            onValueChange={(v) =>
              aplicarFiltro({ prioridade: v ?? undefined })
            }
          >
            <SelectTrigger size="sm" className="min-w-[8rem]">
              <SelectValue placeholder="Prioridade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas prioridades</SelectItem>
              {prioridadeValues.map((p) => (
                <SelectItem key={p} value={p}>
                  {PRIORIDADE_LABEL[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {remessas.length > 0 && (
            <Select
              value={filtrosIniciais.remessaId ?? 'todas'}
              onValueChange={(v) => aplicarFiltro({ remessaId: v ?? undefined })}
            >
              <SelectTrigger size="sm" className="min-w-[9rem]">
                <SelectValue placeholder="Full" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todos os Fulls</SelectItem>
                {/* O RÓTULO COM A CONTA, o mesmo do kanban e do tablet:
                    "Full ML · 29/09" montado aqui deixava iguais duas
                    contas que mandam no mesmo dia. */}
                {remessas.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {podeEditar && (
        <BulkActionBar
          count={selecionados.size}
          onClear={limparSelecao}
          onDelete={() => setBulkExcluindo(true)}
        />
      )}

      {ordens.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Nenhuma OP encontrada"
          description="Crie ordens de produção pra acompanhar no kanban e dar entrada no estoque."
          action={
            podeEditar ? (
              <BotaoNovaOp produtos={produtosNovaOp} size="sm">
                Nova OP
              </BotaoNovaOp>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  {podeEditar && (
                    <TableHead className="w-10">
                      <Checkbox
                        aria-label="Selecionar tudo"
                        checked={allChecked}
                        indeterminate={someChecked}
                        onCheckedChange={toggleAll}
                      />
                    </TableHead>
                  )}
                  <TableHead>Número</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Qtd (un)</TableHead>
                  <TableHead>Máquina</TableHead>
                  <TableHead>Resultado</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Prev. fim</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordens.map((o) => (
                  <TableRow
                    key={o.id}
                    data-state={selecionados.has(o.id) ? 'selected' : undefined}
                    onClick={() => setDetalheId(o.id)}
                    className="cursor-pointer"
                  >
                    {podeEditar && (
                      // O checkbox seleciona e NÃO abre o painel.
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          aria-label={`Selecionar ${o.numero}`}
                          checked={selecionados.has(o.id)}
                          onCheckedChange={() => toggleOne(o.id)}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-mono text-xs">{o.numero}</TableCell>
                    <TableCell>
                      <div className="font-medium">
                        <CodigoDoProduto codigo={o.produtoCodigo} />
                        {o.produtoNome}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {[o.variacaoCor, o.variacaoTamanho]
                          .filter(Boolean)
                          .join(' / ') || o.produtoSku}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {o.quantidade.toLocaleString('pt-BR')}
                    </TableCell>
                    <TableCell>{o.maquinaNome ?? '—'}</TableCell>
                    <TableCell className="tabular-nums">{resultadoDe(o)}</TableCell>
                    <TableCell>
                      {o.remessaRotulo ?? CANAL_LABEL_CURTO[o.canalDestino]}
                    </TableCell>
                    <TableCell>
                      <Badge className={PRIORIDADE_BADGE[o.prioridade]}>
                        {PRIORIDADE_LABEL[o.prioridade]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_BADGE[o.status]}>
                        {STATUS_LABEL_CURTO[o.status]}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={cn(
                        'tabular-nums',
                        o.atrasada && 'text-destructive font-medium',
                      )}
                    >
                      <span className="inline-flex items-center gap-1">
                        {o.atrasada && <CircleAlert className="size-3.5" />}
                        {o.dataPrevistaFim
                          ? format(new Date(o.dataPrevistaFim), 'dd/MM/yy', {
                              locale: ptBR,
                            })
                          : '—'}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile / tablet retrato */}
          <div className="vv-reveal space-y-3 md:hidden">
            {ordens.map((o) => (
              <div
                key={o.id}
                role="button"
                tabIndex={0}
                onClick={() => setDetalheId(o.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setDetalheId(o.id)
                  }
                }}
                className="cursor-pointer rounded-lg border p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2">
                    {podeEditar && (
                      <Checkbox
                        aria-label={`Selecionar ${o.numero}`}
                        checked={selecionados.has(o.id)}
                        onCheckedChange={() => toggleOne(o.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-xs">{o.numero}</div>
                      <div className="truncate font-medium">
                        <CodigoDoProduto codigo={o.produtoCodigo} />
                        {o.produtoNome}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {[o.variacaoCor, o.variacaoTamanho]
                          .filter(Boolean)
                          .join(' / ') || o.produtoSku}
                      </div>
                    </div>
                  </div>
                  <Badge className={STATUS_BADGE[o.status]}>
                    {STATUS_LABEL_CURTO[o.status]}
                  </Badge>
                </div>
                <div className="text-muted-foreground mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <div>Quantidade</div>
                  <div className="text-foreground text-right tabular-nums">
                    {o.quantidade.toLocaleString('pt-BR')} un
                  </div>
                  <div>Máquina</div>
                  <div className="text-foreground text-right">
                    {o.maquinaNome ?? '—'}
                  </div>
                  <div>Resultado</div>
                  <div className="text-foreground text-right tabular-nums">
                    {resultadoDe(o) || '—'}
                  </div>
                  <div>Canal</div>
                  <div className="text-foreground text-right">
                    {o.remessaRotulo ?? CANAL_LABEL_CURTO[o.canalDestino]}
                  </div>
                  <div>Prioridade</div>
                  <div className="text-right">
                    <Badge className={PRIORIDADE_BADGE[o.prioridade]}>
                      {PRIORIDADE_LABEL[o.prioridade]}
                    </Badge>
                  </div>
                  <div>Prev. fim</div>
                  <div
                    className={cn(
                      'text-right tabular-nums',
                      o.atrasada && 'text-destructive font-medium',
                    )}
                  >
                    {o.dataPrevistaFim
                      ? format(new Date(o.dataPrevistaFim), 'dd/MM/yy', {
                          locale: ptBR,
                        })
                      : '—'}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Paginação */}
          {totalPaginas > 1 && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground text-sm tabular-nums">
                Página {pagina} de {totalPaginas} · {total} OPs
              </span>
              <div className="flex gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => irPagina(pagina - 1)}
                  disabled={isPending || pagina <= 1}
                >
                  <ChevronLeft />
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => irPagina(pagina + 1)}
                  disabled={isPending || pagina >= totalPaginas}
                >
                  Próxima
                  <ChevronRight />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <OpDetailSheet
        ordemId={detalheId}
        onClose={() => setDetalheId(null)}
        gestor={gestor}
        podeMover={podeMoverKanban}
        podeEditarOrdens={podeEditar}
      />
      <BulkExcluirDialog
        open={bulkExcluindo}
        ids={idsSelecionados}
        onClose={() => setBulkExcluindo(false)}
        onDone={() => {
          setBulkExcluindo(false)
          limparSelecao()
        }}
      />
    </div>
  )
}

function BulkExcluirDialog({
  open,
  ids,
  onClose,
  onDone,
}: {
  open: boolean
  ids: string[]
  onClose: () => void
  onDone: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function excluir() {
    if (ids.length === 0) return
    startTransition(async () => {
      const result = await excluirMultiplasOrdensAction(ids)
      if (!result.success) {
        // Nenhuma pôde: a frase diz por quê ("2 não: já entraram em produção").
        toast.error(result.error, { duration: 8000 })
        return
      }
      // Parte pôde, parte não: o toast conta as duas, e quem ficou continua na
      // lista pra ser cancelada.
      toast.success(result.message ?? 'Excluídas', {
        duration: result.data?.recusadas ? 8000 : undefined,
      })
      router.refresh()
      onDone()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Excluir {ids.length} OP{ids.length === 1 ? '' : 's'}?
          </DialogTitle>
          <DialogDescription>
            Excluir é pra OP cadastrada por engano: só saem as que nunca
            entraram em produção e não têm apontamento, e vão pra lixeira sem
            mudar de status. As outras ficam na lista — pra essas, use Cancelar
            no painel da OP.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button loading={isPending} variant="destructive" onClick={excluir} disabled={isPending}>
            {`Excluir ${ids.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
