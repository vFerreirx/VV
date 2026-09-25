'use client'

import {
  AlertTriangle,
  ChevronDown,
  PackageCheck,
  PackageSearch,
  Pencil,
  Trash2,
  Truck,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import type {
  EtapaKanban,
  OpDaRemessa,
  RemessaAberta,
  RemessaDespachada,
  RemessaSemOp,
} from './actions'
import {
  despacharRemessaAction,
  editarRemessaAction,
  excluirRemessaAction,
} from './actions'
import { OpDetailSheet } from '@/app/(app)/producao/op-detail-sheet'
import { CampoProducaoAte } from '@/components/remessas/campo-producao-ate'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ContaMarketplace } from '@/lib/db/schema'
import {
  diaMes,
  rotuloDaRemessa,
  erroDoProducaoAte,
  type RiscoDaRemessa,
} from '@/lib/producao/prazo-da-remessa'
import { erroDoDespacho } from '@/lib/producao/transicoes-da-op'
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
import { cn } from '@/lib/utils'
import { STATUS_LABEL_CURTO } from '@/lib/validators/ordens'

// Mesmas cores usadas por etapa no kanban (src/app/(app)/producao/kanban-board.tsx),
// duplicadas aqui pra não importar um componente client grande só por uma constante.
const STATUS_BAR_COLOR: Record<EtapaKanban, string> = {
  aguardando_materia_prima: 'bg-zinc-500',
  programado: 'bg-blue-500',
  em_producao: 'bg-emerald-500',
  pronto_envio: 'bg-amber-500',
}

// ⚠️ VERMELHO É SÓ PRAZO DE PRODUÇÃO FURADO. "Envio passou · falta
// despachar" é pendência de fechamento, não atraso da malharia — âmbar, com nome
// próprio (src/lib/producao/prazo-da-remessa.ts).
const RISCO_INFO: Record<RiscoDaRemessa, { label: string; badge: string }> = {
  no_prazo: { label: 'No prazo', badge: 'bg-emerald-500/15 text-emerald-600' },
  em_risco: { label: 'Em risco', badge: 'bg-amber-500/15 text-amber-600' },
  atrasada: { label: 'Atrasada', badge: 'bg-destructive/15 text-destructive' },
  baixa_pendente: {
    label: 'Envio passou · falta despachar',
    badge: 'bg-amber-500/15 text-amber-600',
  },
}

function prazoLabel(diasRestantes: number): string {
  if (diasRestantes < 0) {
    return `atrasado há ${Math.abs(diasRestantes)} dia${Math.abs(diasRestantes) > 1 ? 's' : ''}`
  }
  if (diasRestantes === 0) return 'envia hoje'
  if (diasRestantes === 1) return 'envia amanhã'
  return `faltam ${diasRestantes} dias`
}

type Props = {
  remessas: RemessaAberta[]
  despachadas: RemessaDespachada[]
  ops: OpDaRemessa[]
  semOp: RemessaSemOp[]
  /** Escrita em Remessas: Editar e Despachar. */
  podeEditar: boolean
  /** Contas ativas, pro "Editar" (filtradas pelo canal da remessa). */
  contas: ContaMarketplace[]
  // O painel lateral da OP é o mesmo do kanban e da /ordens.
  gestor: boolean
  podeMoverKanban: boolean
  podeEditarOrdens: boolean
}

// O NOME DA REMESSA É O MESMO EM TODO LUGAR: "Full Shopee · Conta 5 · 30/09"
// (`rotuloDaRemessa`) — a pasta do kanban, o tablet, o calendário e esta
// tela. Antes esta tela montava "Full Shopee · 30/09 · Conta 5 Shopee" à mão,
// em outra ordem.
function nomeDaRemessa(r: {
  canal: string
  dataEnvio: string
  contaNome?: string | null
}): string {
  return rotuloDaRemessa(r.canal, r.dataEnvio, r.contaNome ?? null)
}

// Remessa antiga, de antes do cadastro de contas: o rótulo fica sem conta, e
// a lista avisa — é aqui que se edita pra pôr uma.
function SemConta({ contaNome }: { contaNome: string | null }) {
  if (contaNome) return null
  return <span className="text-muted-foreground font-normal"> (sem conta)</span>
}

export function RemessasView({
  remessas,
  despachadas,
  ops,
  semOp,
  podeEditar,
  contas,
  gestor,
  podeMoverKanban,
  podeEditarOrdens,
}: Props) {
  const [excluindo, setExcluindo] = useState<RemessaSemOp | null>(null)
  const [aba, setAba] = useState<'abertas' | 'despachadas'>('abertas')
  // Clicar numa OP abre o painel lateral, sem sair da tela.
  const [detalheId, setDetalheId] = useState<string | null>(null)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Remessas Full</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {aba === 'abertas'
            ? `${remessas.length} remessa${remessas.length === 1 ? '' : 's'} aberta${remessas.length === 1 ? '' : 's'} · ordenadas pelo envio mais próximo`
            : `${despachadas.length} despachada${despachadas.length === 1 ? '' : 's'} com envio nos últimos 30 dias ou depois`}
        </p>
      </div>

      <div className="flex gap-1.5">
        {(
          [
            { val: 'abertas', label: `Abertas (${remessas.length})` },
            { val: 'despachadas', label: `Despachadas (${despachadas.length})` },
          ] as const
        ).map((c) => (
          <button
            key={c.val}
            type="button"
            onClick={() => setAba(c.val)}
            aria-pressed={aba === c.val}
            className={cn(
              'rounded-full border px-3 py-1 text-xs transition-colors',
              aba === c.val
                ? 'bg-primary text-primary-foreground border-primary'
                : 'hover:bg-accent',
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {aba === 'despachadas' ? (
        <ListaDespachadas despachadas={despachadas} />
      ) : remessas.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
          Nenhuma remessa Full aberta no momento.
        </div>
      ) : (
        <div className="space-y-3">
          {remessas.map((r) => (
            <RemessaCard
              key={r.id}
              remessa={r}
              ops={ops.filter((o) => o.remessaFullId === r.id)}
              podeEditar={podeEditar}
              contas={contas}
              onAbrirOp={setDetalheId}
            />
          ))}
        </div>
      )}

      {/* Remessas que ficaram pra trás: sem nenhuma OP ativa, elas somem da
          lista acima e continuam segurando o identificador do envio, o que
          impede reimportar o mesmo PDF. Daqui elas podem ir pra lixeira. */}
      {aba === 'abertas' && semOp.length > 0 && (
        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold">Remessas sem OP ativa</h2>
            <p className="text-muted-foreground mt-0.5 text-sm">
              Não aparecem na lista acima e continuam bloqueando a reimportação
              do envio. Excluir manda pra lixeira — dá pra restaurar depois.
            </p>
          </div>
          <div className="divide-y rounded-xl border">
            {semOp.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5"
              >
                <PackageSearch className="text-muted-foreground size-4 shrink-0" />
                <span className="text-sm font-medium">
                  {nomeDaRemessa(r)}
                  <SemConta contaNome={r.contaNome} />
                </span>
                <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
                  {r.envioId ? (
                    <span className="font-mono">envio {r.envioId}</span>
                  ) : (
                    'sem identificador de envio'
                  )}
                  {r.opsInativas > 0 &&
                    ` · ${r.opsInativas} OP${r.opsInativas > 1 ? 's' : ''} excluída${r.opsInativas > 1 ? 's' : ''}/cancelada${r.opsInativas > 1 ? 's' : ''}`}
                </span>
                {podeEditar && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setExcluindo(r)}
                  >
                    <Trash2 />
                    Excluir
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <ExcluirRemessaDialog
        remessa={excluindo}
        onClose={() => setExcluindo(null)}
      />
      <OpDetailSheet
        ordemId={detalheId}
        onClose={() => setDetalheId(null)}
        gestor={gestor}
        podeMover={podeMoverKanban}
        podeEditarOrdens={podeEditarOrdens}
      />
    </div>
  )
}

function ExcluirRemessaDialog({
  remessa,
  onClose,
}: {
  remessa: RemessaSemOp | null
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function excluir() {
    if (!remessa) return
    startTransition(async () => {
      const r = await excluirRemessaAction(remessa.id)
      if (!r.success) {
        toast.error(r.error, { duration: 10000 })
        return
      }
      toast.success(r.message ?? 'Remessa excluída')
      onClose()
      router.refresh()
    })
  }

  return (
    <Dialog open={remessa !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir remessa?</DialogTitle>
          <DialogDescription>
            A remessa{' '}
            <span className="text-foreground font-medium">
              {remessa && nomeDaRemessa(remessa)}
            </span>{' '}
            vai pra lixeira, de onde dá pra restaurar. As OPs excluídas dela não
            são afetadas.
            {remessa?.envioId &&
              ' Depois disso o envio pode ser importado de novo.'}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button loading={isPending} variant="destructive" onClick={excluir} disabled={isPending}>
            {'Excluir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RemessaCard({
  remessa: r,
  ops,
  podeEditar,
  contas,
  onAbrirOp,
}: {
  remessa: RemessaAberta
  ops: OpDaRemessa[]
  podeEditar: boolean
  contas: ContaMarketplace[]
  onAbrirOp: (id: string) => void
}) {
  const [aberta, setAberta] = useState(false)
  const [editando, setEditando] = useState(false)
  const [despachando, setDespachando] = useState(false)
  const pctPecas =
    r.unidades > 0 ? Math.round((r.produzidas / r.unidades) * 100) : 0
  const risco = RISCO_INFO[r.risco]
  // Só oferece Despachar quando há o que despachar: alguma OP que
  // `erroDoDespacho` deixa ir.
  const temParaDespachar = ops.some(
    (o) => erroDoDespacho(o.status, o.temApontamento) === null,
  )

  return (
    <div className="bg-card rounded-xl border shadow-sm">
      {/* O cabeçalho NÃO é um botão só: botão dentro de botão é HTML
          inválido, e Editar/Despachar moram aqui. Expandir é a área grande;
          as ações ficam à direita. */}
      <div className="flex items-start gap-2 p-4 pb-0">
        <button
          type="button"
          onClick={() => setAberta((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-medium"
        >
          <PackageSearch
            className={cn(
              'size-4 shrink-0',
              r.risco === 'atrasada' ? 'text-destructive' : 'text-muted-foreground',
            )}
          />
          <span className="min-w-0">
            {nomeDaRemessa(r)}
            <SemConta contaNome={r.contaNome} />
            {/* O PRAZO DA PRODUÇÃO continua ao lado, onde estava: o rótulo
                diz o dia do caminhão, isto diz até quando a malharia tem. */}
            <span className="text-muted-foreground font-normal">
              {' '}
              · {prazoLabel(r.diasRestantes)}
            </span>
          </span>
        </button>
        <span className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <Badge className={cn('text-[11px]', risco.badge)}>{risco.label}</Badge>
          {podeEditar && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditando(true)}
                aria-label="Editar remessa"
              >
                <Pencil />
                Editar
              </Button>
              {temParaDespachar && (
                <Button size="sm" onClick={() => setDespachando(true)}>
                  <Truck />
                  Despachar
                </Button>
              )}
            </>
          )}
          <button
            type="button"
            onClick={() => setAberta((v) => !v)}
            aria-label={aberta ? 'Recolher' : 'Ver OPs'}
          >
            <ChevronDown
              className={cn(
                'text-muted-foreground size-4 transition-transform',
                aberta && 'rotate-180',
              )}
            />
          </button>
        </span>
      </div>

      <button
        type="button"
        onClick={() => setAberta((v) => !v)}
        className="flex w-full flex-col gap-3 rounded-b-xl p-4 text-left"
      >
        {/* Barra segmentada por etapa */}
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
          {r.etapas
            .filter((e) => e.count > 0)
            .map((e) => (
              <div
                key={e.status}
                className={STATUS_BAR_COLOR[e.status]}
                style={{ width: `${(e.count / r.ops) * 100}%` }}
                title={`${STATUS_LABEL_CURTO[e.status]}: ${e.count}`}
              />
            ))}
        </div>

        <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {/* O PRAZO DA PRODUÇÃO ao lado do envio: é dele que o risco conta. */}
          <span
            className={cn(
              'tabular-nums',
              r.risco === 'atrasada' && 'text-destructive font-medium',
              r.risco === 'em_risco' && 'font-medium text-amber-600',
            )}
          >
            Produção até {diaMes(r.producaoAte)}
          </span>
          <span className="tabular-nums">
            {r.produzidas.toLocaleString('pt-BR')}/
            {r.unidades.toLocaleString('pt-BR')} peças · {pctPecas}%
          </span>
          <span className="tabular-nums">
            {r.opsProntas}/{r.ops} OPs com produção concluída
          </span>
          {r.atrasadas > 0 && (
            <span className="text-destructive inline-flex items-center gap-1 font-medium">
              <AlertTriangle className="size-3" />
              {r.atrasadas} OP{r.atrasadas > 1 ? 's' : ''} atrasada
              {r.atrasadas > 1 ? 's' : ''}
            </span>
          )}
          <span>
            {r.pronta ? (
              <span className="font-medium text-emerald-600">
                Produção concluída
              </span>
            ) : (
              <>
                Travando em:{' '}
                <span className="font-medium">
                  {r.gargalo ? STATUS_LABEL_CURTO[r.gargalo] : '—'}
                </span>
              </>
            )}
          </span>
        </div>
      </button>

      {aberta && (
        <div className="space-y-1.5 border-t p-3">
          {ops.map((o) => (
            <OpRow
              key={o.id}
              op={o}
              gargalo={r.gargalo}
              onAbrir={() => onAbrirOp(o.id)}
            />
          ))}
        </div>
      )}

      {editando && (
        <EditarRemessaDialog
          remessa={r}
          contas={contas.filter((c) => c.canal === r.canal)}
          onClose={() => setEditando(false)}
        />
      )}
      {despachando && (
        <DespacharDialog
          remessa={r}
          ops={ops}
          onClose={() => setDespachando(false)}
        />
      )}
    </div>
  )
}

function OpRow({
  op,
  gargalo,
  onAbrir,
}: {
  op: OpDaRemessa
  gargalo: EtapaKanban | null
  onAbrir: () => void
}) {
  const travando = gargalo !== null && op.status === gargalo

  return (
    // O MESMO PAINEL LATERAL DA /ordens e do kanban, sem sair da tela.
    <button
      type="button"
      onClick={onAbrir}
      className={cn(
        'flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-xs transition-colors hover:bg-muted/40',
        (travando || op.atrasada) && 'border-destructive/40 bg-destructive/5',
      )}
    >
      <span className="flex min-w-0 flex-col">
        <span className="flex items-center gap-1.5 font-medium">
          {op.numero}
          {op.atrasada && <AlertTriangle className="text-destructive size-3" />}
        </span>
        <span className="text-muted-foreground truncate">
          {op.produtoNome}
          {[op.variacaoCor, op.variacaoTamanho].filter(Boolean).length > 0 &&
            ` · ${[op.variacaoCor, op.variacaoTamanho].filter(Boolean).join('/')}`}
        </span>
      </span>
      <span className="text-muted-foreground flex shrink-0 items-center gap-3 tabular-nums">
        {/* RESULTADO no lugar do responsável: o que saiu contra o pedido. */}
        <span className="w-14 text-right">
          {op.produzido}/{op.quantidade}
        </span>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px]',
            travando ? 'bg-destructive/15 text-destructive font-medium' : 'bg-muted',
          )}
        >
          {STATUS_LABEL_CURTO[op.status]}
        </span>
      </span>
    </button>
  )
}

// -----------------------------------------------------------------
// Despachar
// -----------------------------------------------------------------

// A CONFIRMAÇÃO DIZ O QUE VAI E O QUE FICA, com a mesma regra do servidor
// (`erroDoDespacho`). O servidor confere de novo — isto só
// mostra antes o que ele vai decidir.
function DespacharDialog({
  remessa: r,
  ops,
  onClose,
}: {
  remessa: RemessaAberta
  ops: OpDaRemessa[]
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const pendentes = ops.filter((o) => o.status !== 'enviado')
  const vao = pendentes.filter(
    (o) => erroDoDespacho(o.status, o.temApontamento) === null,
  )
  const ficam = pendentes.filter((o) => !vao.includes(o))

  function despachar() {
    startTransition(async () => {
      const res = await despacharRemessaAction(r.id)
      if (!res.success) {
        toast.error(res.error, { duration: 10000 })
        return
      }
      toast.success(res.message ?? 'Remessa despachada', { duration: 8000 })
      onClose()
      router.refresh()
    })
  }

  const linha = (o: OpDaRemessa, detalhe: string) => (
    <li key={o.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="min-w-0 truncate">
        <span className="font-mono text-xs">{o.numero}</span> · {o.produtoNome}
        {[o.variacaoCor, o.variacaoTamanho].filter(Boolean).length > 0 &&
          ` · ${[o.variacaoCor, o.variacaoTamanho].filter(Boolean).join('/')}`}
      </span>
      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{detalhe}</span>
    </li>
  )

  return (
    <Dialog open onOpenChange={(o) => !o && !isPending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Despachar {nomeDaRemessa(r)}?
          </DialogTitle>
          <DialogDescription>
            Finaliza as OPs com produção concluída, de uma vez. As outras ficam
            na remessa.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] space-y-4 overflow-y-auto">
          <section>
            <h3 className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
              <PackageCheck className="size-4" />
              Vão ({vao.length})
            </h3>
            <ul className="divide-y">
              {vao.map((o) => linha(o, `${o.produzido}/${o.quantidade}`))}
            </ul>
          </section>
          {ficam.length > 0 && (
            <section>
              <h3 className="text-muted-foreground text-sm font-medium">
                Ficam ({ficam.length})
              </h3>
              <ul className="divide-y">
                {ficam.map((o) =>
                  linha(
                    o,
                    // Produção concluída sem apontamento fica, e diz por quê:
                    // despachar sem apontamento é recusa, nunca número inventado.
                    o.status === 'pronto_envio' && !o.temApontamento
                      ? 'sem apontamento'
                      : STATUS_LABEL_CURTO[o.status],
                  ),
                )}
              </ul>
            </section>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Voltar
          </Button>
          <Button
            onClick={despachar}
            loading={isPending}
            disabled={isPending || vao.length === 0}
          >
            <Truck />
            Despachar {vao.length} OP{vao.length === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// -----------------------------------------------------------------
// Editar remessa
// -----------------------------------------------------------------

function EditarRemessaDialog({
  remessa: r,
  contas,
  onClose,
}: {
  remessa: RemessaAberta
  contas: ContaMarketplace[]
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [dataEnvio, setDataEnvio] = useState(r.dataEnvio)
  const [contaId, setContaId] = useState<string | null>(r.contaId)
  // Parte do GRAVADO (null = padrão), e não do efetivo: senão abrir e salvar
  // sem mexer congelaria o padrão numa data, e mudar o envio depois não
  // arrastaria mais o prazo.
  const [producaoAte, setProducaoAte] = useState<string | null>(r.producaoAteGravado)
  const erroPrazo = dataEnvio ? erroDoProducaoAte(dataEnvio, producaoAte) : null

  function salvar() {
    if (!dataEnvio || !contaId || erroPrazo) return
    startTransition(async () => {
      const res = await editarRemessaAction(r.id, { dataEnvio, contaId, producaoAte })
      if (!res.success) {
        toast.error(res.error)
        return
      }
      toast.success(res.message ?? 'Remessa atualizada')
      onClose()
      router.refresh()
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Editar {nomeDaRemessa(r)}
          </DialogTitle>
          <DialogDescription>
            Mudar a data de envio ou o &ldquo;Produção até&rdquo; muda o prazo das
            OPs ainda não despachadas, com uma linha no histórico de cada uma.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="editar-envio">Data de envio</Label>
            <Input
              id="editar-envio"
              type="date"
              value={dataEnvio}
              onChange={(e) => setDataEnvio(e.target.value)}
              disabled={isPending}
            />
          </div>
          <CampoProducaoAte
            id="editar-producao-ate"
            dataEnvio={dataEnvio}
            valor={producaoAte}
            onChange={setProducaoAte}
            disabled={isPending}
          />
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Conta</Label>
            <Select
              value={contaId}
              onValueChange={(v) => setContaId(v ?? null)}
              disabled={isPending || contas.length === 0}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Escolha a conta do envio" />
              </SelectTrigger>
              <SelectContent>
                {contas.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            onClick={salvar}
            loading={isPending}
            disabled={isPending || !dataEnvio || !contaId || erroPrazo !== null}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// -----------------------------------------------------------------
// Despachadas
// -----------------------------------------------------------------

function ListaDespachadas({ despachadas }: { despachadas: RemessaDespachada[] }) {
  if (despachadas.length === 0) {
    return (
      <div className="text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
        Nenhuma remessa despachada com envio nos últimos 30 dias.
      </div>
    )
  }
  return (
    <div className="divide-y rounded-xl border">
      {despachadas.map((r) => {
        // Enviadas contra pedidas: o que de fato foi no caminhão, somado dos
        // apontamentos das OPs despachadas.
        const falta = r.pecasPedidas - r.pecasEnviadas
        return (
          <div key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
            <Truck className="text-muted-foreground size-4 shrink-0" />
            <span className="text-sm font-medium">
              {nomeDaRemessa(r)}
              <SemConta contaNome={r.contaNome} />
            </span>
            <span className="text-muted-foreground text-xs tabular-nums">
              {r.ops} OP{r.ops === 1 ? '' : 's'}
            </span>
            <span
              className={cn(
                'text-xs tabular-nums',
                falta > 0 ? 'font-medium text-amber-600' : 'text-muted-foreground',
              )}
            >
              {r.pecasEnviadas.toLocaleString('pt-BR')}/
              {r.pecasPedidas.toLocaleString('pt-BR')} peças enviadas
              {falta > 0 && ` · ${falta} a menos`}
            </span>
            {r.despachadaEm && (
              <span className="text-muted-foreground ml-auto text-xs">
                despachada em{' '}
                {r.despachadaEm.toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                })}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
