'use client'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  CheckCircle2,
  ChevronDown,
  Cog,
  ExternalLink,
  Loader2,
  PackageCheck,
  Trash2,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  listarEventosOrdem,
  type EventoKanbanComUsuario,
} from './actions'
import {
  ConcluirProducaoDialog,
  IniciarNaMaquinaDialog,
} from './dialogos-do-gerente'
import {
  apontarProducaoAction,
  cancelarOrdemAction,
  desfazerConclusaoAction,
  excluirOrdemAction,
  listarApontamentos,
  mudarStatusOrdemAction,
  obterOrdem,
  type ApontamentoItem,
  type OrdemDetalhe,
} from '@/app/(app)/ordens/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  erroDaExclusao,
  erroDaTransicaoGenerica,
  erroDoCancelamento,
} from '@/lib/producao/transicoes-da-op'
import { cn } from '@/lib/utils'
import {
  CANAL_LABEL,
  PRIORIDADE_LABEL,
  STATUS_FILTRAVEIS,
  STATUS_LABEL,
  STATUS_LABEL_CURTO,
  statusValues,
} from '@/lib/validators/ordens'

type Status = (typeof statusValues)[number]

// A PRÓXIMA AÇÃO DE CADA ETAPA — um botão principal só. A mini-tela era uma
// lista de tudo que dava pra fazer (avançar, pegar, soltar, apontar, status
// manual), e o gerente tinha que descobrir qual era a da vez. Agora ela abre
// dizendo.
//
// ⚠️ "CONCLUIR" É SÓ A SAÍDA DA MÁQUINA. O fim comercial se chama "Dar baixa",
// com o efeito escrito — no canal Estoque é ele que põe peça no saldo. Com as
// duas coisas chamadas "concluir", o gerente não sabia qual tinha feito.
type AcaoPrincipal = 'iniciar' | 'concluir' | 'baixa' | null

function acaoPrincipalDe(status: Status): AcaoPrincipal {
  switch (status) {
    case 'aguardando_materia_prima':
    case 'programado':
      return 'iniciar'
    // Os legados acabamento/embalagem também concluem: a OP já saiu da
    // máquina no fluxo antigo, e o gerente pode concluir de qualquer coluna
    // anterior (transicoes-da-op.ts).
    case 'em_producao':
    case 'acabamento':
    case 'embalagem':
      return 'concluir'
    case 'pronto_envio':
      return 'baixa'
    case 'enviado':
    case 'cancelado':
      return null
  }
}

export function OpDetailSheet({
  ordemId,
  onClose,
  gestor,
  podeMover,
  podeEditarOrdens,
}: {
  ordemId: string | null
  onClose: () => void
  /** Admin ou gerente: as ações de produção e o apontamento avulso. */
  gestor: boolean
  /** Escrita no kanban: o Status manual. */
  podeMover: boolean
  /** Escrita em "ordens": Cancelar e Excluir, que são decisões sobre a OP. */
  podeEditarOrdens: boolean
}) {
  return (
    <Sheet open={ordemId !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {/* Key força remontagem ao trocar de OP — evita setState em effect. */}
        {ordemId && (
          <DetalheBody
            key={ordemId}
            ordemId={ordemId}
            onClose={onClose}
            gestor={gestor}
            podeMover={podeMover}
            podeEditarOrdens={podeEditarOrdens}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

// -----------------------------------------------------------------
// Body — só monta quando ordemId existe (controlado pela key acima)
// -----------------------------------------------------------------

function DetalheBody({
  ordemId,
  onClose,
  gestor,
  podeMover,
  podeEditarOrdens,
}: {
  ordemId: string
  onClose: () => void
  gestor: boolean
  podeMover: boolean
  podeEditarOrdens: boolean
}) {
  const router = useRouter()
  const [ordem, setOrdem] = useState<OrdemDetalhe | null>(null)
  const [eventos, setEventos] = useState<EventoKanbanComUsuario[]>([])
  const [apontamentos, setApontamentos] = useState<ApontamentoItem[]>([])
  const [produzido, setProduzido] = useState(0)
  const [refugoTotal, setRefugoTotal] = useState(0)
  const [, startTransition] = useTransition()
  const [confirmarExcluir, setConfirmarExcluir] = useState(false)
  const [excluindo, startExcluir] = useTransition()
  const [confirmarCancelar, setConfirmarCancelar] = useState(false)
  const [cancelando, startCancelar] = useTransition()
  const [acaoPend, startAcao] = useTransition()
  const [porta, setPorta] = useState<'maquina' | 'concluir' | null>(null)
  const [apontarOpen, setApontarOpen] = useState(false)
  const [qtdProduzida, setQtdProduzida] = useState('')
  const [qtdRefugo, setQtdRefugo] = useState('')
  const [apontando, startApontar] = useTransition()

  async function recarregarApontamentos(id: string) {
    const a = await listarApontamentos(id)
    setApontamentos(a.itens)
    setProduzido(a.totalProduzido)
    setRefugoTotal(a.totalRefugo)
  }

  function apontar() {
    if (!ordem) return
    startApontar(async () => {
      const result = await apontarProducaoAction(ordem.id, {
        produzida: qtdProduzida,
        refugo: qtdRefugo,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'Apontado')
      setQtdProduzida('')
      setQtdRefugo('')
      setApontarOpen(false)
      await recarregarApontamentos(ordem.id)
      router.refresh()
    })
  }

  // Depois de qualquer ação o sheet relê a OP inteira: status, máquina,
  // histórico e apontamentos mudam juntos, e mostrar metade atualizada é pior
  // que esperar um instante.
  async function recarregar(id: string) {
    const [o, e] = await Promise.all([
      obterOrdem(id),
      listarEventosOrdem(id),
      recarregarApontamentos(id),
    ])
    if (o) setOrdem(o)
    setEventos(e)
  }

  // ESCOLHER UM STATUS — do botão principal ou do Status manual. As duas
  // portas próprias abrem diálogo; o resto vai pelo caminho genérico.
  function escolherStatus(novoStatus: Status) {
    if (!ordem || ordem.status === novoStatus) return
    // Cancelar tem confirmação e porta própria, venha do botão ou daqui.
    if (novoStatus === 'cancelado') {
      setConfirmarCancelar(true)
      return
    }
    if (novoStatus === 'em_producao') {
      // Voltar da conclusão pra máquina é desfazer a conclusão, apontamento
      // junto — igual ao arrastar do board.
      if (ordem.status === 'pronto_envio') desfazerConclusao()
      else setPorta('maquina')
      return
    }
    if (novoStatus === 'pronto_envio') {
      setPorta('concluir')
      return
    }
    handleMudarStatus(novoStatus)
  }

  function desfazerConclusao() {
    if (!ordem) return
    startAcao(async () => {
      const r = await desfazerConclusaoAction(ordem.id)
      if (!r.success) {
        toast.error(r.error)
        return
      }
      toast.success(r.message ?? 'Conclusão desfeita')
      await recarregar(ordem.id)
      router.refresh()
    })
  }

  async function aoIniciar(mensagem: string) {
    if (!ordem) return
    setPorta(null)
    toast.success(mensagem)
    await recarregar(ordem.id)
    router.refresh()
  }

  async function aoConcluir({
    mensagem,
    concluiu,
  }: {
    mensagem: string
    concluiu: boolean
  }) {
    if (!ordem) return
    setPorta(null)
    // "Desfazer" só pra conclusão DE AGORA — ver o mesmo comentário no board.
    toast.success(
      mensagem,
      concluiu
        ? {
            duration: 8000,
            action: { label: 'Desfazer', onClick: () => desfazerConclusao() },
          }
        : undefined,
    )
    await recarregar(ordem.id)
    router.refresh()
  }

  function excluir() {
    if (!ordem) return
    startExcluir(async () => {
      const result = await excluirOrdemAction(ordem.id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'OP excluída')
      setConfirmarExcluir(false)
      onClose()
      router.refresh()
    })
  }

  // CANCELAR: a fábrica desistiu. Continua visível em Canceladas, e a
  // máquina, se estava em produção, fica livre — ver `cancelarOrdemAction`.
  function cancelar() {
    if (!ordem) return
    startCancelar(async () => {
      const result = await cancelarOrdemAction(ordem.id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'OP cancelada')
      setConfirmarCancelar(false)
      await recarregar(ordem.id)
      router.refresh()
    })
  }

  useEffect(() => {
    let cancelado = false
    Promise.all([
      obterOrdem(ordemId),
      listarEventosOrdem(ordemId),
      listarApontamentos(ordemId),
    ]).then(([o, e, a]) => {
      if (cancelado) return
      setOrdem(o)
      setEventos(e)
      setApontamentos(a.itens)
      setProduzido(a.totalProduzido)
      setRefugoTotal(a.totalRefugo)
    })
    return () => {
      cancelado = true
    }
  }, [ordemId])

  function handleMudarStatus(novoStatus: (typeof statusValues)[number]) {
    if (!ordem || ordem.status === novoStatus) return
    const anterior = ordem.status

    setOrdem({ ...ordem, status: novoStatus })

    startTransition(async () => {
      const result = await mudarStatusOrdemAction(ordem.id, {
        status: novoStatus,
      })
      if (!result.success) {
        setOrdem({ ...ordem, status: anterior })
        toast.error(result.error)
        return
      }
      // Enviado/cancelado saem do kanban — fecha o painel e atualiza o board.
      if (novoStatus === 'enviado' || novoStatus === 'cancelado') {
        toast.success(
          novoStatus === 'enviado'
            ? ordem.canalDestino === 'estoque'
              ? 'Baixa dada · entrou no estoque'
              : 'Baixa dada · OP enviada'
            : 'OP cancelada',
        )
        onClose()
        router.refresh()
        return
      }
      toast.success('Status atualizado')
      const novosEventos = await listarEventosOrdem(ordem.id)
      setEventos(novosEventos)
    })
  }

  if (!ordem) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <Loader2 className="size-3.5 animate-spin" />
          Carregando…
        </div>
      </div>
    )
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle className="font-mono">{ordem.numero}</SheetTitle>
        <SheetDescription>{ordem.produto.nome}</SheetDescription>
      </SheetHeader>

      <div className="space-y-5 px-4 pb-4">
        {/* A PRÓXIMA AÇÃO — um botão só, o da etapa. Só pra gerente/admin:
            são as portas de `iniciarProducaoAction` e da conclusão sem teto,
            que o servidor recusa pros outros papéis. */}
        {gestor &&
          (() => {
            const acao = acaoPrincipalDe(ordem.status)
            if (!acao) return null
            const semApontamento = apontamentos.length === 0
            return (
              <section className="space-y-1.5">
                {acao === 'iniciar' && (
                  <Button
                    className="w-full"
                    disabled={acaoPend}
                    onClick={() => setPorta('maquina')}
                  >
                    <Cog />
                    Iniciar na máquina…
                  </Button>
                )}

                {acao === 'concluir' && (
                  <>
                    <Button
                      className="w-full"
                      disabled={acaoPend}
                      onClick={() => setPorta('concluir')}
                    >
                      <PackageCheck />
                      Concluir produção…
                    </Button>
                    {/* OP LEGADA em produção sem máquina: o arrastar antigo não
                        perguntava. Resgatável, mas não é o caminho principal. */}
                    {ordem.status === 'em_producao' && !ordem.maquina && (
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground w-full text-center text-xs underline-offset-2 hover:underline"
                        disabled={acaoPend}
                        onClick={() => setPorta('maquina')}
                      >
                        Pôr numa máquina…
                      </button>
                    )}
                  </>
                )}

                {acao === 'baixa' && (
                  <>
                    <Button
                      className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
                      // Sem apontamento a baixa é recusada no servidor — e antes
                      // entrava a META no estoque. A tela explica embaixo em vez
                      // de deixar o toque virar erro.
                      disabled={acaoPend || semApontamento}
                      onClick={() => handleMudarStatus('enviado')}
                    >
                      <CheckCircle2 />
                      {ordem.canalDestino === 'estoque'
                        ? 'Dar baixa · entra no estoque'
                        : 'Dar baixa · enviada'}
                    </Button>
                    {semApontamento && (
                      <p className="text-muted-foreground text-center text-xs">
                        Sem apontamento. Lance as peças abaixo antes de dar baixa.
                      </p>
                    )}
                  </>
                )}
              </section>
            )
          })()}

        {/* Resultado da produção (progresso + apontamentos) */}
        <section className="space-y-2">
          <h3 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Resultado da produção
          </h3>
          <div className="text-muted-foreground flex justify-between text-xs tabular-nums">
            <span>Produzido</span>
            <span className="text-foreground font-medium">
              {produzido}/{ordem.quantidade} un
              {refugoTotal > 0 && (
                <span className="text-destructive ml-2">
                  {refugoTotal} refugo
                </span>
              )}
            </span>
          </div>
          <div className="bg-muted h-2 overflow-hidden rounded-full">
            <div
              className={cn(
                'h-full rounded-full',
                produzido >= ordem.quantidade
                  ? 'bg-emerald-500'
                  : 'bg-primary',
              )}
              style={{
                width: `${Math.min(100, ordem.quantidade > 0 ? (produzido / ordem.quantidade) * 100 : 0)}%`,
              }}
            />
          </div>
          {apontamentos.length > 0 && (
            <ul className="text-muted-foreground space-y-1 pt-1 text-xs">
              {apontamentos.slice(0, 5).map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    {a.operadorNome ?? 'Operador'} ·{' '}
                    {format(new Date(a.em), "dd/MM HH:mm", { locale: ptBR })}
                  </span>
                  <span className="text-foreground shrink-0 tabular-nums">
                    +{a.produzida}
                    {a.refugo > 0 && (
                      <span className="text-destructive"> /{a.refugo}r</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {/* FERRAMENTA DE CORREÇÃO, NÃO O CAMINHO. As quantidades entram pela
              conclusão; isto existe pra OP antiga que chegou em Produção
              concluída sem apontamento, e pro ajuste que só aparece na
              conferência. Só soma — pra tirar, desfaz-se a conclusão. */}
          {gestor && ordem.status !== 'enviado' && ordem.status !== 'cancelado' && (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
              onClick={() => setApontarOpen(true)}
            >
              Lançar apontamento avulso
            </button>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Detalhes
          </h3>
          <dl className="text-muted-foreground grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
            <Detail label="Produto SKU" value={ordem.produto.sku} mono />
            <Detail
              label="Variação"
              value={
                ordem.variacao
                  ? [
                      ordem.variacao.cor,
                      ordem.variacao.modelo,
                      ordem.variacao.tamanho,
                    ]
                      .filter(Boolean)
                      .join(' / ') || ordem.variacao.skuVariacao
                  : '—'
              }
            />
            <Detail
              label="Quantidade"
              value={`${ordem.quantidade.toLocaleString('pt-BR')} un`}
            />
            <Detail
              label="Máquina"
              value={ordem.maquina ? ordem.maquina.nome : '—'}
            />
            <Detail label="Canal" value={CANAL_LABEL[ordem.canalDestino]} />
            <Detail
              label="Prioridade"
              value={PRIORIDADE_LABEL[ordem.prioridade]}
            />
            <Detail
              label="Responsável"
              value={ordem.responsavel?.nome ?? '—'}
            />
            <Detail
              label="Início previsto"
              value={
                ordem.dataPrevistaInicio
                  ? format(new Date(ordem.dataPrevistaInicio), 'dd/MM/yy', {
                      locale: ptBR,
                    })
                  : '—'
              }
            />
            <Detail
              label="Fim previsto"
              value={
                ordem.dataPrevistaFim
                  ? format(new Date(ordem.dataPrevistaFim), 'dd/MM/yy', {
                      locale: ptBR,
                    })
                  : '—'
              }
            />
            <Detail
              label="Início real"
              value={
                ordem.dataRealInicio
                  ? format(new Date(ordem.dataRealInicio), 'dd/MM/yy', {
                      locale: ptBR,
                    })
                  : '—'
              }
            />
            <Detail
              label="Fim real"
              value={
                ordem.dataRealFim
                  ? format(new Date(ordem.dataRealFim), 'dd/MM/yy', {
                      locale: ptBR,
                    })
                  : '—'
              }
            />
          </dl>
        </section>

        {ordem.observacoes && (
          <section className="space-y-2">
            <h3 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Observações
            </h3>
            <p className="text-sm whitespace-pre-wrap">{ordem.observacoes}</p>
          </section>
        )}

        <section className="space-y-2">
          <h3 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Histórico ({eventos.length})
          </h3>
          {eventos.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              Sem eventos registrados.
            </p>
          ) : (
            <ol className="space-y-2 text-xs">
              {eventos.map((ev) => (
                <li
                  key={ev.id}
                  className="border-l-2 border-foreground/10 pl-3"
                >
                  <div className="flex flex-wrap items-center gap-1">
                    {ev.statusAnterior ? (
                      <>
                        <Badge variant="secondary">
                          {STATUS_LABEL_CURTO[ev.statusAnterior]}
                        </Badge>
                        <span className="text-muted-foreground">→</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">criada</span>
                    )}
                    <Badge variant="default">
                      {STATUS_LABEL_CURTO[ev.statusNovo]}
                    </Badge>
                  </div>
                  <div className="text-muted-foreground mt-0.5">
                    {ev.usuarioNome ?? 'Sistema'} ·{' '}
                    {format(new Date(ev.createdAt), "dd/MM/yy 'às' HH:mm", {
                      locale: ptBR,
                    })}
                  </div>
                  {ev.observacao && (
                    <div className="text-muted-foreground italic">
                      {ev.observacao}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* STATUS MANUAL — RECOLHIDO E NO FIM. É correção, não fluxo: o
            fluxo é o botão lá de cima. Oferece só os status escolhíveis
            (`STATUS_FILTRAVEIS`), e desabilita o que o caminho genérico
            recusa, com a mesma regra do servidor. "Em produção" e "Produção
            concluída" abrem os diálogos das portas, como no board. */}
        {podeMover && (
          <details className="group rounded-md border">
            <summary className="text-muted-foreground flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-medium uppercase tracking-wide">
              Status manual
              <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t p-3">
              <Select
                value={ordem.status}
                onValueChange={(v) => v && escolherStatus(v as Status)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {/* Legado fora do fluxo: aparece como é, sem ser escolhível. */}
                  {!(STATUS_FILTRAVEIS as readonly string[]).includes(ordem.status) && (
                    <SelectItem value={ordem.status} disabled>
                      {STATUS_LABEL[ordem.status]} (histórico)
                    </SelectItem>
                  )}
                  {STATUS_FILTRAVEIS.map((st) => {
                    // As portas com diálogo ficam habilitadas: o diálogo é
                    // quem pergunta o que falta. A baixa não tem diálogo, e só
                    // vale a partir de Produção concluída.
                    const temPorta = st === 'em_producao' || st === 'pronto_envio'
                    // Cancelar exige escrita em ordens: sem ela, a opção
                    // levaria a uma action que recusa.
                    const bloqueio = temPorta
                      ? null
                      : st === 'cancelado' && !podeEditarOrdens
                        ? 'sem permissão'
                        : erroDaTransicaoGenerica(
                            ordem.status,
                            st,
                            apontamentos.length > 0,
                          )
                    return (
                      <SelectItem key={st} value={st} disabled={bloqueio !== null}>
                        {STATUS_LABEL[st]}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
          </details>
        )}

        {/* CANCELAR E EXCLUIR SÃO COISAS DIFERENTES (transicoes-da-op.ts), e
            cada botão só aparece quando a regra deixa — a mesma com que o
            servidor recusa. Cancelar é a fábrica desistindo; excluir é o
            engano de cadastro, que só existe enquanto a OP nunca produziu. */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <div className="flex flex-wrap gap-1">
            {podeEditarOrdens && erroDoCancelamento(ordem.status) === null && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirmarCancelar(true)}
                disabled={cancelando}
              >
                Cancelar OP…
              </Button>
            )}
            {podeEditarOrdens &&
              erroDaExclusao({
                status: ordem.status,
                dataRealInicio: ordem.dataRealInicio,
                temApontamento: apontamentos.length > 0,
              }) === null && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmarExcluir(true)}
                  disabled={excluindo}
                >
                  <Trash2 className="text-destructive" />
                  Excluir
                </Button>
              )}
          </div>
          <Button
            size="sm"
            variant="outline"
            render={<Link href={`/ordens/${ordem.id}`} />}
          >
            <ExternalLink />
            Abrir OP completa
          </Button>
        </div>
      </div>

      <Dialog
        open={confirmarExcluir}
        onOpenChange={(o) => !o && setConfirmarExcluir(false)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir OP {ordem.numero}?</DialogTitle>
            <DialogDescription>
              Pra OP cadastrada por engano. Ela sai das listas e vai pra
              lixeira sem mudar de status — restaurar devolve exatamente como
              está. Se a fábrica desistiu dela, use Cancelar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmarExcluir(false)}
              disabled={excluindo}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={excluir}
              disabled={excluindo}
            >
              {excluindo ? 'Excluindo…' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmarCancelar}
        onOpenChange={(o) => !o && setConfirmarCancelar(false)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar OP {ordem.numero}?</DialogTitle>
            <DialogDescription>
              A OP vai pra Canceladas e continua visível lá.
              {ordem.status === 'em_producao' &&
                ' A máquina fica livre pra outra OP.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmarCancelar(false)}
              disabled={cancelando}
            >
              Voltar
            </Button>
            <Button
              variant="destructive"
              onClick={cancelar}
              loading={cancelando}
              disabled={cancelando}
            >
              Cancelar OP
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={apontarOpen} onOpenChange={(o) => !o && setApontarOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lançar apontamento avulso</DialogTitle>
            <DialogDescription>
              Soma ao que já está registrado ({produzido}/{ordem.quantidade}).
              É correção: o caminho normal é concluir a produção.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ap-prod">Peças boas</Label>
              <Input
                id="ap-prod"
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                placeholder="0"
                value={qtdProduzida}
                onChange={(e) => setQtdProduzida(e.target.value)}
                disabled={apontando}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ap-refugo">Refugo</Label>
              <Input
                id="ap-refugo"
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                placeholder="0"
                value={qtdRefugo}
                onChange={(e) => setQtdRefugo(e.target.value)}
                disabled={apontando}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setApontarOpen(false)}
              disabled={apontando}
            >
              Cancelar
            </Button>
            <Button onClick={apontar} disabled={apontando}>
              {apontando ? 'Salvando…' : 'Lançar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {porta === 'maquina' && (
        <IniciarNaMaquinaDialog
          ordem={{
            id: ordem.id,
            numero: ordem.numero,
            maquinaId: ordem.maquinaId,
          }}
          onFeito={aoIniciar}
          onClose={() => setPorta(null)}
        />
      )}
      {porta === 'concluir' && (
        <ConcluirProducaoDialog
          ordem={{
            id: ordem.id,
            numero: ordem.numero,
            status: ordem.status,
            quantidade: ordem.quantidade,
            produzido,
          }}
          onFeito={aoConcluir}
          onClose={() => setPorta(null)}
        />
      )}
    </>
  )
}

function Detail({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <>
      <dt className="text-xs">{label}</dt>
      <dd
        className={cn(
          'text-foreground text-right tabular-nums',
          mono && 'font-mono',
        )}
      >
        {value}
      </dd>
    </>
  )
}
