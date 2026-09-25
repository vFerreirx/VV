'use client'

import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Search,
  X,
} from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  excluirMultiplasOrdensAction,
  type ContagensDaLista,
  type DestinoFiltrado,
  type OrdemListItem,
  type ProdutoComVariacoesParaForm,
} from './actions'
import { OpDetailSheet } from '@/app/(app)/producao/op-detail-sheet'
import {
  LinhaDaPeca,
  SeloDePrioridade,
  TextoDoPrazo,
} from '@/components/ordens/linha-da-peca'
import { BotaoNovaOp } from '@/components/ordens/nova-op-dialog'
import type { RemessaFullOpcao } from './remessas-actions'
import { Badge } from '@/components/ui/badge'
import { BulkActionBar } from '@/components/ui/bulk-action-bar'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ColorSwatch } from '@/components/ui/color-swatch'
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
import { corDoCanal } from '@/lib/producao/cor-do-canal'
import {
  agruparPorDia,
  prazoNaLista,
  quantidadeNaLista,
} from '@/lib/producao/lista-de-ordens'
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

// ALVO DE TOQUE DE 48px em tudo que é ação: a mesma tela roda no escritório
// e no tablet do galpão, de luva ou com a mão ocupada. Os componentes de UI
// nascem com 28–32px (feitos pro mouse); aqui eles crescem.
//
// O Select precisa do `data-[size=default]:` porque a altura dele vem
// num seletor de atributo, mais específico que um `h-12` solto.
const ALTURA_DO_SELECT = 'data-[size=default]:h-12'

type Props = {
  ordens: OrdemListItem[]
  total: number
  pagina: number
  totalPaginas: number
  contagens: ContagensDaLista
  destino: DestinoFiltrado | null
  remessas: RemessaFullOpcao[]
  podeEditar: boolean
  filtrosIniciais: OrdensFiltros
  produtosNovaOp: ProdutoComVariacoesParaForm[]
  /** Admin ou gerente: as ações de produção do painel lateral. */
  gestor: boolean
  /** Escrita no kanban: o Status manual do painel. */
  podeMoverKanban: boolean
}

// O FILTRO QUE O RÓTULO DO DESTINO APLICA. O Full filtra pela remessa, o
// pedido pelo pedido — e esses dois ganham a faixa-resumo no topo. Estoque e
// venda direta não têm "um" destino pra resumir: filtram pelo canal.
function filtroDoDestino(o: OrdemListItem): Record<string, string | undefined> {
  if (o.remessaFullId) return { remessaId: o.remessaFullId, pedidoId: undefined }
  if (o.orcamentoId) return { pedidoId: o.orcamentoId, remessaId: undefined }
  return { canal: o.canalDestino }
}

export function OrdensList({
  ordens,
  total,
  pagina,
  totalPaginas,
  contagens,
  destino,
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
  // Os separadores por dia de criação — a lista já chega ordenada por ela.
  const porDia = useMemo(() => agruparPorDia(ordens), [ordens])

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
  const prazoAtual = filtrosIniciais.prazo

  // O rótulo do destino filtra, e NÃO abre o painel da linha.
  function filtrarPeloDestino(e: React.MouseEvent, o: OrdemListItem) {
    e.stopPropagation()
    aplicarFiltro(filtroDoDestino(o))
  }

  return (
    <div className="space-y-5">
      {/* O QUE APERTA, PRIMEIRO. É o que o gerente vem ver aqui: o kanban e
          o tablet já mostram a fila; a lista é onde ele confere o que está
          atrasado e o que vence hoje — e dali parte pra OP. (O "Falta dar
          baixa" saiu em 25/09/2026: a OP fora de remessa finaliza na
          conclusão, e o que falta despachar é da remessa, em /remessas.) Cada contador é o filtro dele: clicar aplica, clicar de
          novo tira. Os números contam o conjunto filtrado inteiro (não só a
          página) e não mudam ao clicar um deles (`ContagensDaLista`). */}
      <div className="flex flex-wrap gap-3" role="group" aria-label="O que aperta">
        <Contador
          n={contagens.atrasadas}
          rotulo="Atrasadas"
          ativo={prazoAtual === 'atrasadas'}
          tom="atrasada"
          disabled={isPending}
          onClick={() =>
            aplicarFiltro({
              prazo: prazoAtual === 'atrasadas' ? undefined : 'atrasadas',
              status: 'abertas',
            })
          }
        />
        <Contador
          n={contagens.vencemHoje}
          rotulo={contagens.vencemHoje === 1 ? 'Vence hoje' : 'Vencem hoje'}
          ativo={prazoAtual === 'hoje'}
          tom="hoje"
          disabled={isPending}
          onClick={() =>
            aplicarFiltro({
              prazo: prazoAtual === 'hoje' ? undefined : 'hoje',
              status: 'abertas',
            })
          }
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          // ABERTAS É O PADRÃO: tudo não finalizado e não cancelado — o que se
          // procura aqui no dia a dia, e o que o gerente confere na virada.
          { label: 'Abertas', val: 'abertas' },
          // "Finalizadas", e não "Concluídas": concluída é a PRODUÇÃO, e o
          // Full concluído continua esperando o despacho. Este chip filtra
          // `enviado`.
          { label: 'Finalizadas', val: 'enviado' },
          { label: 'Canceladas', val: 'cancelado' },
          { label: 'Todas', val: 'todos' },
        ].map((chip) => {
          const ativo = statusAtual === chip.val && !prazoAtual
          return (
            <button
              key={chip.label}
              type="button"
              aria-pressed={ativo}
              // Trocar de chip tira o filtro de prazo: "Atrasadas" dentro de
              // "Finalizadas" é sempre vazio, e a lista vazia pareceria bug.
              onClick={() => aplicarFiltro({ status: chip.val, prazo: undefined })}
              disabled={isPending}
              className={cn(
                'focus-visible:ring-ring h-12 rounded-full border px-5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none motion-reduce:transition-none',
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

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <form onSubmit={onBuscaSubmit} className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 lg:max-w-sm">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-5 -translate-y-1/2" />
            <Input
              placeholder="Número, código (076), SKU ou produto…"
              aria-label="Buscar OP"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="h-12 pl-10 text-base md:text-base"
              disabled={isPending}
            />
          </div>
          <Button
            type="submit"
            variant="outline"
            className="h-12 px-4"
            disabled={isPending}
          >
            Buscar
          </Button>
        </form>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Select
            value={statusAtual}
            onValueChange={(v) =>
              aplicarFiltro({ status: v ?? undefined, prazo: undefined })
            }
          >
            <SelectTrigger
              aria-label="Etapa"
              className={cn(ALTURA_DO_SELECT, 'w-full sm:w-auto sm:min-w-40')}
            >
              <SelectValue placeholder="Etapa" />
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
            <SelectTrigger
              aria-label="Canal"
              className={cn(ALTURA_DO_SELECT, 'w-full sm:w-auto sm:min-w-36')}
            >
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
            <SelectTrigger
              aria-label="Prioridade"
              className={cn(ALTURA_DO_SELECT, 'w-full sm:w-auto sm:min-w-40')}
            >
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
              onValueChange={(v) =>
                aplicarFiltro({ remessaId: v ?? undefined, pedidoId: undefined })
              }
            >
              <SelectTrigger
                aria-label="Full"
                className={cn(ALTURA_DO_SELECT, 'w-full sm:w-auto sm:min-w-44')}
              >
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

      {destino && (
        <FaixaDoDestino
          destino={destino}
          disabled={isPending}
          onLimpar={() => aplicarFiltro({ [destino.filtro]: undefined })}
        />
      )}

      {podeEditar && (
        <BulkActionBar
          count={selecionados.size}
          onClear={limparSelecao}
          onDelete={() => setBulkExcluindo(true)}
          // Por cima do cabeçalho da tabela, que também gruda no topo.
          className="z-20"
        />
      )}

      {ordens.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Nenhuma OP encontrada"
          description="Crie ordens de produção pra acompanhar no kanban até ficarem prontas."
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
          {/* Desktop.
              ⚠️ `<table>` DIRETO, e não o <Table> do ui/: ele embrulha a
              tabela num `overflow-x-auto`, e aí o cabeçalho `sticky` grudaria
              nessa caixa (que não rola) em vez de na página. Com seis colunas
              a tabela cabe na tela grande — não precisa da rolagem lateral.

              SEIS COLUNAS, E ERAM NOVE. Máquina desceu pra baixo da peça,
              Qtd e Resultado viraram uma coluna só, e Prioridade virou um
              selo que só aparece quando é Alta ou Urgente (`ehDestaque`). */}
          <div className="hidden rounded-lg border md:block">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {podeEditar && (
                    <Th className="w-12 rounded-tl-lg px-0 text-center">
                      <Checkbox
                        aria-label="Selecionar tudo"
                        checked={allChecked}
                        indeterminate={someChecked}
                        onCheckedChange={toggleAll}
                        className="mx-auto after:-inset-4"
                      />
                    </Th>
                  )}
                  <Th className={cn(!podeEditar && 'rounded-tl-lg')}>Nº</Th>
                  <Th>OP</Th>
                  <Th className="text-right">Quantidade</Th>
                  <Th>Destino</Th>
                  <Th>Status</Th>
                  <Th className="rounded-tr-lg">Prazo</Th>
                </tr>
              </thead>
              <tbody>
                {porDia.map((grupo) => [
                  <tr key={`dia:${grupo.rotulo}`}>
                    <td
                      colSpan={podeEditar ? 7 : 6}
                      className="bg-muted/60 text-muted-foreground border-b px-4 py-1.5 text-xs font-semibold tracking-wide uppercase"
                    >
                      <SeparadorDoDia rotulo={grupo.rotulo} n={grupo.ops.length} />
                    </td>
                  </tr>,
                  ...grupo.ops.map((o) => (
                    <tr
                      key={o.id}
                      data-state={selecionados.has(o.id) ? 'selected' : undefined}
                      tabIndex={0}
                      aria-label={`Abrir ${o.numero}`}
                      onClick={() => setDetalheId(o.id)}
                      onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setDetalheId(o.id)
                        }
                      }}
                      className={cn(
                        'hover:bg-muted/50 data-[state=selected]:bg-muted focus-visible:ring-ring cursor-pointer border-b transition-colors last:border-0 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset motion-reduce:transition-none',
                        // A COR DO FULL É SÓ UMA BORDA À ESQUERDA, do lado do
                        // checkbox e longe do quadradinho do fio
                        // (cor-do-canal.ts). O nome do Full continua escrito
                        // na coluna Destino.
                        corDoCanal(o.canalDestino)?.borda,
                      )}
                    >
                      {podeEditar && (
                        // O checkbox seleciona e NÃO abre o painel.
                        <td
                          className="w-12 px-0 text-center align-middle"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            aria-label={`Selecionar ${o.numero}`}
                            checked={selecionados.has(o.id)}
                            onCheckedChange={() => toggleOne(o.id)}
                            className="mx-auto after:-inset-4"
                          />
                        </td>
                      )}
                      <td className="text-muted-foreground px-3 py-2 align-middle font-mono text-xs whitespace-nowrap">
                        {o.numero}
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <div className="flex items-center gap-3">
                          {/* O QUADRADINHO É A COR DO FIO, o mesmo do tablet:
                              o olho varre a coluna de cores em vez de ler
                              vinte nomes que começam igual. */}
                          <ColorSwatch hex={o.corHex} hex2={o.corHex2} />
                          <div className="min-w-0">
                            <div className="text-base leading-snug">
                              <LinhaDaPeca op={o} />
                            </div>
                            <div className="text-muted-foreground text-xs">
                              <Maquina nome={o.maquinaNome} />
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right align-middle whitespace-nowrap">
                        <Quantidade o={o} />
                      </td>
                      <td className="text-muted-foreground px-3 py-0 align-middle whitespace-nowrap">
                        <BotaoDoDestino o={o} onClick={filtrarPeloDestino} />
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          <Status o={o} />
                        </div>
                      </td>
                      <td className="px-3 py-2 align-middle whitespace-nowrap">
                        <PrazoDaLinha o={o} />
                      </td>
                    </tr>
                  )),
                ])}
              </tbody>
            </table>
          </div>

          {/* Mobile / tablet retrato — a MESMA hierarquia da tabela: a peça
              com a cor do fio; status e prazo logo abaixo; destino e
              quantidade; e por último número e máquina, que identificam mas
              não decidem nada. */}
          <div className="vv-reveal space-y-3 md:hidden">
            {porDia.map((grupo) => (
              <section key={grupo.rotulo} className="space-y-3">
                <h2 className="text-muted-foreground px-1 pt-2 text-xs font-semibold tracking-wide uppercase">
                  <SeparadorDoDia rotulo={grupo.rotulo} n={grupo.ops.length} />
                </h2>
                {grupo.ops.map((o) => {
                  const cor = corDoCanal(o.canalDestino)
                  return (
                    <div
                      key={o.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Abrir ${o.numero}`}
                      onClick={() => setDetalheId(o.id)}
                      onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setDetalheId(o.id)
                        }
                      }}
                      className={cn(
                        'bg-card focus-visible:ring-ring cursor-pointer rounded-xl border p-3 focus-visible:ring-2 focus-visible:outline-none',
                        selecionados.has(o.id) && 'bg-muted',
                        // Borda do Full, e o conteúdo afasta (`pl-5`) pra ela
                        // não encostar no quadradinho do fio — como no tablet.
                        cor && [cor.borda, 'pl-5'],
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <ColorSwatch hex={o.corHex} hex2={o.corHex2} tamanho="lg" />
                        <div className="min-w-0 flex-1">
                          <div className="text-lg leading-snug">
                            <LinhaDaPeca op={o} />
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
                            <Status o={o} />
                            <PrazoDaLinha o={o} semTraco />
                          </div>
                        </div>
                        {podeEditar && (
                          <div
                            className="-mt-1 -mr-1 flex size-12 shrink-0 items-center justify-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Checkbox
                              aria-label={`Selecionar ${o.numero}`}
                              checked={selecionados.has(o.id)}
                              onCheckedChange={() => toggleOne(o.id)}
                              className="size-5 after:-inset-3.5"
                            />
                          </div>
                        )}
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3 border-t pt-1 text-sm">
                        <span className="text-muted-foreground min-w-0 truncate">
                          <BotaoDoDestino o={o} onClick={filtrarPeloDestino} />
                        </span>
                        <span className="shrink-0 text-right">
                          <Quantidade o={o} />
                        </span>
                      </div>
                      <div className="text-muted-foreground flex justify-between gap-2 text-xs">
                        <span className="font-mono">{o.numero}</span>
                        <Maquina nome={o.maquinaNome} />
                      </div>
                    </div>
                  )
                })}
              </section>
            ))}
          </div>

          {/* Paginação */}
          {totalPaginas > 1 && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground text-sm tabular-nums">
                Página {pagina} de {totalPaginas} · {total} OPs
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="h-12 px-4"
                  onClick={() => irPagina(pagina - 1)}
                  disabled={isPending || pagina <= 1}
                >
                  <ChevronLeft />
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  className="h-12 px-4"
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

// O cabeçalho da coluna GRUDA NO TOPO ao rolar as 50 linhas. O fundo opaco é
// pra linha que passa por baixo não aparecer através dele.
function Th({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <th
      className={cn(
        'bg-background text-muted-foreground sticky top-0 z-10 h-11 border-b px-3 text-left align-middle text-xs font-semibold tracking-wide whitespace-nowrap uppercase',
        className,
      )}
    >
      {children}
    </th>
  )
}

// "Hoje · 24/09 · 4 OPs". A contagem é a da PÁGINA: um dia pode continuar na
// próxima. O rótulo depende do relógio — ver `TextoDoPrazo` sobre o aviso de
// hidratação.
function SeparadorDoDia({ rotulo, n }: { rotulo: string; n: number }) {
  return (
    <span suppressHydrationWarning>
      {rotulo}{' '}
      <span className="font-normal normal-case">
        · {n} {n === 1 ? 'OP' : 'OPs'}
      </span>
    </span>
  )
}

function Maquina({ nome }: { nome: string | null }) {
  return <span>{nome ? `Máquina ${nome}` : 'Sem máquina'}</span>
}

// "30 pç" enquanto roda; "27/30 pç" e "2 com defeito" depois — `quantidadeNaLista`.
// Âmbar quando a produção fechou abaixo da meta.
function Quantidade({ o }: { o: OrdemListItem }) {
  const q = quantidadeNaLista(o)
  return (
    <>
      <span
        className={cn(
          'tabular-nums',
          q.faltou && 'font-semibold text-amber-700 dark:text-amber-400',
        )}
      >
        {q.texto}
      </span>
      {q.refugo && (
        <span className="text-muted-foreground block text-xs tabular-nums">
          {q.refugo}
        </span>
      )}
    </>
  )
}

function Status({ o }: { o: OrdemListItem }) {
  return (
    <>
      <Badge className={cn('h-6 px-2.5', STATUS_BADGE[o.status])}>
        {STATUS_LABEL_CURTO[o.status]}
      </Badge>
      <SeloDePrioridade
        prioridade={o.prioridade}
        className="text-xs font-semibold"
      />
    </>
  )
}

// O prazo em palavras, e só em vermelho quando aperta — `prazoNaLista`, que
// cala o prazo da OP já concluída (a produção terminou; o resto é despacho). Sem prazo, a
// tabela mostra "—" pra coluna não parecer quebrada; o cartão não mostra nada.
function PrazoDaLinha({
  o,
  semTraco = false,
}: {
  o: OrdemListItem
  semTraco?: boolean
}) {
  const prazo = prazoNaLista(o.status, o.dataPrevistaFim)
  if (!prazo) {
    return semTraco ? null : <span className="text-muted-foreground">—</span>
  }
  return <TextoDoPrazo prazo={prazo} comIcone />
}

// O DESTINO É UM ATALHO: clicar filtra a lista por ele (o Full pela remessa,
// o pedido pelo pedido) e abre a faixa-resumo. 48px de altura, e o
// sublinhado no hover diz que é clicável sem gritar numa coluna inteira.
function BotaoDoDestino({
  o,
  onClick,
}: {
  o: OrdemListItem
  onClick: (e: React.MouseEvent, o: OrdemListItem) => void
}) {
  return (
    <button
      type="button"
      onClick={(e) => onClick(e, o)}
      title={`Ver só ${o.destino}`}
      className="hover:text-foreground focus-visible:ring-ring inline-flex min-h-12 max-w-full items-center truncate rounded-md text-left underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
    >
      {o.destino}
    </button>
  )
}

// Os dois contadores do topo. Vermelho cheio pra atrasada, contorno
// vermelho pra "vence hoje" (aperta, mas ainda dá tempo).
//
// ZERO NÃO GRITA: o contador vazio fica neutro e desabilitado. Caixas
// coloridas com "0" dentro ensinariam o olho a ignorar a cor.
const TOM_DO_CONTADOR = {
  atrasada:
    'border-destructive bg-destructive/10 text-destructive dark:bg-destructive/20',
  hoje: 'border-destructive/60 text-destructive',
} as const

function Contador({
  n,
  rotulo,
  ativo,
  tom,
  disabled,
  onClick,
}: {
  n: number
  rotulo: string
  ativo: boolean
  tom: keyof typeof TOM_DO_CONTADOR
  disabled: boolean
  onClick: () => void
}) {
  const vazio = n === 0 && !ativo
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={onClick}
      disabled={disabled || vazio}
      className={cn(
        'focus-visible:ring-ring flex min-h-16 flex-1 items-center gap-3 rounded-xl border-2 px-4 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-default motion-reduce:transition-none sm:min-w-44 sm:flex-none',
        vazio ? 'text-muted-foreground' : TOM_DO_CONTADOR[tom],
        ativo && 'ring-foreground ring-offset-background ring-2 ring-offset-2',
      )}
    >
      <span className="text-3xl font-bold tabular-nums">{n}</span>
      <span className="max-w-24 text-sm leading-tight font-semibold">
        {rotulo}
      </span>
    </button>
  )
}

// A FAIXA DO FULL (OU DO PEDIDO) FILTRADO — o cabeçalho do bloco de destino
// do tablet, com a mesma cor (cor-do-canal.ts: texto escuro sobre a cor
// clara, barra grossa na cor cheia) e o mesmo aviso (`alertaDoBloco`). Com um
// destino filtrado a pergunta é "como está esse Full?", e a faixa responde
// com ele INTEIRO: OPs por status e peças sobre a meta.
//
// A BARRA MORA AQUI, E NÃO NA LINHA: a produção só é registrada na conclusão,
// então por OP ela seria 0% ou cheia. No destino inteiro ela anda a cada OP
// concluída — aí mede algo.
function FaixaDoDestino({
  destino,
  disabled,
  onLimpar,
}: {
  destino: DestinoFiltrado
  disabled: boolean
  onLimpar: () => void
}) {
  const cor = corDoCanal(destino.canal)
  const { resumo } = destino
  const pct =
    resumo.meta > 0
      ? Math.min(100, Math.round((resumo.produzido / resumo.meta) * 100))
      : 0
  return (
    <section
      aria-label={`Resumo de ${destino.cabecalho}`}
      className="overflow-hidden rounded-xl border-2"
    >
      <div className={cn('flex items-stretch', cor ? cor.faixa : 'bg-muted')}>
        {cor && <span aria-hidden className={cn('w-2.5 shrink-0', cor.barra)} />}
        <div className="flex min-w-0 flex-1 flex-col gap-3 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <h2 className="text-lg font-semibold">{destino.cabecalho}</h2>
            <div className="flex items-center gap-2 text-base font-medium tabular-nums">
              <span>
                {resumo.total} {resumo.total === 1 ? 'OP' : 'OPs'}
              </span>
              {resumo.alerta.prazo && (
                <span className="text-destructive font-bold">
                  {resumo.alerta.prazo}
                </span>
              )}
              {resumo.alerta.urgente && <SeloDePrioridade prioridade="urgente" />}
              <button
                type="button"
                onClick={onLimpar}
                disabled={disabled}
                aria-label={`Tirar o filtro de ${destino.cabecalho}`}
                className="focus-visible:ring-ring -mr-2 inline-flex size-12 items-center justify-center rounded-lg hover:bg-current/10 focus-visible:ring-2 focus-visible:outline-none"
              >
                <X className="size-5" />
              </button>
            </div>
          </div>
          {/* Na ordem do fluxo (`statusValues`), só os que têm OP. */}
          <div className="flex flex-wrap items-center gap-2">
            {statusValues
              .filter((s) => (resumo.porStatus[s] ?? 0) > 0)
              .map((s) => (
                <Badge key={s} className={cn('h-6 px-2.5', STATUS_BADGE[s])}>
                  <span className="font-bold tabular-nums">
                    {resumo.porStatus[s]}
                  </span>
                  {STATUS_LABEL_CURTO[s]}
                </Badge>
              ))}
          </div>
          {resumo.meta > 0 && (
            <div className="flex items-center gap-3">
              <div
                role="progressbar"
                aria-label="Peças produzidas"
                aria-valuemin={0}
                aria-valuemax={resumo.meta}
                aria-valuenow={resumo.produzido}
                className="h-2.5 flex-1 overflow-hidden rounded-full bg-current/15"
              >
                <div
                  className="h-full rounded-full bg-current/70"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="shrink-0 text-sm font-medium tabular-nums">
                {resumo.produzido}/{resumo.meta} pç produzidas
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
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
