'use client'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  CalendarClock,
  ChevronDown,
  ListTodo,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  atualizarTarefaAction,
  concluirTarefaAction,
  criarTarefaAction,
  excluirTarefaAction,
  reabrirTarefaAction,
  type TarefaComContexto,
} from './actions'
import { Badge } from '@/components/ui/badge'
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
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { estaVencida } from '@/lib/validators/tarefas'

export type ContaOpcao = { id: string; nome: string }

type Props = {
  pendentes: TarefaComContexto[]
  concluidas: TarefaComContexto[]
  contas: ContaOpcao[]
}

function dataCurta(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a!.slice(2)}`
}

export function TarefasView({ pendentes, concluidas, contas }: Props) {
  const [editando, setEditando] = useState<TarefaComContexto | null>(null)
  const [excluindo, setExcluindo] = useState<TarefaComContexto | null>(null)
  const [mostrarConcluidas, setMostrarConcluidas] = useState(false)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tarefas</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Pendências da administração — promoções, anúncios e o que mais
          precisar de alguém. A lista é dos admins: quem fizer, marca.
        </p>
      </div>

      <NovaTarefa contas={contas} />

      {pendentes.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title="Nenhuma tarefa pendente"
          description="Tudo em dia. Novas tarefas aparecem aqui assim que forem criadas."
        />
      ) : (
        <div className="divide-y rounded-xl border">
          {pendentes.map((t) => (
            <LinhaTarefa
              key={t.id}
              tarefa={t}
              onEditar={() => setEditando(t)}
              onExcluir={() => setExcluindo(t)}
            />
          ))}
        </div>
      )}

      {/* Concluídas somem da visão principal, mas não do sistema. */}
      {concluidas.length > 0 && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setMostrarConcluidas((v) => !v)}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm"
          >
            <ChevronDown
              className={cn(
                'size-4 transition-transform',
                mostrarConcluidas && 'rotate-180',
              )}
            />
            {concluidas.length} concluída{concluidas.length > 1 ? 's' : ''}
          </button>
          {mostrarConcluidas && (
            <div className="divide-y rounded-xl border">
              {concluidas.map((t) => (
                <LinhaTarefa
                  key={t.id}
                  tarefa={t}
                  onEditar={() => setEditando(t)}
                  onExcluir={() => setExcluindo(t)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {editando && (
        <TarefaDialog
          key={editando.id}
          tarefa={editando}
          contas={contas}
          onClose={() => setEditando(null)}
        />
      )}
      <ExcluirDialog tarefa={excluindo} onClose={() => setExcluindo(null)} />
    </div>
  )
}

// -----------------------------------------------------------------
// Criação rápida
// -----------------------------------------------------------------

// O caminho rápido é só o título + Enter. Prazo e conta ficam atrás do
// "mais opções" porque tarefa que dá trabalho de cadastrar ninguém cadastra.
function NovaTarefa({ contas }: { contas: ContaOpcao[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [titulo, setTitulo] = useState('')
  const [prazo, setPrazo] = useState('')
  const [contaId, setContaId] = useState<string | null>(null)
  const [aberto, setAberto] = useState(false)

  function salvar() {
    if (titulo.trim().length < 2) {
      toast.error('Escreva o título da tarefa')
      return
    }
    startTransition(async () => {
      const r = await criarTarefaAction({
        titulo,
        descricao: null,
        prazo: prazo || null,
        contaId,
      })
      if (!r.success) {
        toast.error(r.error)
        return
      }
      toast.success(r.message ?? 'Tarefa criada')
      setTitulo('')
      setPrazo('')
      setContaId(null)
      setAberto(false)
      router.refresh()
    })
  }

  return (
    <div className="bg-card space-y-3 rounded-xl border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') salvar()
          }}
          placeholder="Nova tarefa… (ex.: criar promoção do mês)"
          disabled={isPending}
          autoComplete="off"
          className="min-w-56 flex-1"
        />
        <Button onClick={salvar} disabled={isPending}>
          <Plus />
          {isPending ? 'Salvando…' : 'Adicionar'}
        </Button>
      </div>

      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs"
      >
        <ChevronDown
          className={cn('size-3.5 transition-transform', aberto && 'rotate-180')}
        />
        {aberto ? 'Menos opções' : 'Prazo e conta (opcional)'}
      </button>

      {aberto && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="nova-prazo">Prazo</Label>
            <Input
              id="nova-prazo"
              type="date"
              value={prazo}
              onChange={(e) => setPrazo(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Conta de marketplace</Label>
            <SeletorConta
              contas={contas}
              valor={contaId}
              onChange={setContaId}
              disabled={isPending}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// Seletor com opção de "nenhuma": o Select do Base UI não tem item vazio,
// então a ausência é um valor próprio ('') traduzido pra null na saída.
const SEM_CONTA = '__sem_conta__'

function SeletorConta({
  contas,
  valor,
  onChange,
  disabled,
}: {
  contas: ContaOpcao[]
  valor: string | null
  onChange: (v: string | null) => void
  disabled?: boolean
}) {
  if (contas.length === 0) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-2 text-xs">
        Nenhuma conta cadastrada — a tarefa fica geral.
      </p>
    )
  }
  return (
    <Select
      value={valor ?? SEM_CONTA}
      onValueChange={(v) => onChange(v === SEM_CONTA ? null : (v as string))}
      disabled={disabled}
    >
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={SEM_CONTA}>Nenhuma (tarefa geral)</SelectItem>
        {contas.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.nome}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// -----------------------------------------------------------------
// Linha da lista
// -----------------------------------------------------------------

function LinhaTarefa({
  tarefa: t,
  onEditar,
  onExcluir,
}: {
  tarefa: TarefaComContexto
  onEditar: () => void
  onExcluir: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const concluida = t.concluidaEm !== null
  const vencida = !concluida && estaVencida(t.prazo)

  function alternar() {
    startTransition(async () => {
      const r = concluida
        ? await reabrirTarefaAction(t.id)
        : await concluirTarefaAction(t.id)
      if (!r.success) {
        toast.error(r.error)
        return
      }
      toast.success(r.message ?? 'Pronto')
      router.refresh()
    })
  }

  return (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-3',
        vencida && 'bg-destructive/5',
      )}
    >
      <Checkbox
        checked={concluida}
        onCheckedChange={alternar}
        disabled={isPending}
        className="mt-0.5"
        aria-label={concluida ? `Reabrir ${t.titulo}` : `Concluir ${t.titulo}`}
      />

      <div className="min-w-0 flex-1">
        <div
          className={cn(
            'text-sm font-medium',
            concluida && 'text-muted-foreground line-through',
          )}
        >
          {t.titulo}
          {t.contaNome && (
            <Badge variant="secondary" className="ml-2 align-middle text-[11px]">
              {t.contaNome}
            </Badge>
          )}
        </div>

        {t.descricao && (
          <p className="text-muted-foreground mt-0.5 text-xs whitespace-pre-line">
            {t.descricao}
          </p>
        )}

        <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {t.prazo && (
            <span
              className={cn(
                'inline-flex items-center gap-1 tabular-nums',
                vencida && 'text-destructive font-medium',
              )}
            >
              {vencida ? (
                <TriangleAlert className="size-3.5" />
              ) : (
                <CalendarClock className="size-3.5" />
              )}
              {vencida ? 'venceu em ' : 'até '}
              {dataCurta(t.prazo)}
            </span>
          )}
          {concluida && (
            <span>
              concluída por {t.concluidaPorNome ?? '—'} em{' '}
              {format(new Date(t.concluidaEm!), "dd/MM/yyyy 'às' HH:mm", {
                locale: ptBR,
              })}
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 gap-1">
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={onEditar}
          aria-label={`Editar ${t.titulo}`}
        >
          <Pencil />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={onExcluir}
          aria-label={`Excluir ${t.titulo}`}
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------
// Diálogos
// -----------------------------------------------------------------

function TarefaDialog({
  tarefa,
  contas,
  onClose,
}: {
  tarefa: TarefaComContexto
  contas: ContaOpcao[]
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [titulo, setTitulo] = useState(tarefa.titulo)
  const [descricao, setDescricao] = useState(tarefa.descricao ?? '')
  const [prazo, setPrazo] = useState(tarefa.prazo ?? '')
  const [contaId, setContaId] = useState<string | null>(tarefa.contaId)

  function salvar() {
    if (titulo.trim().length < 2) {
      toast.error('Escreva o título da tarefa')
      return
    }
    startTransition(async () => {
      const r = await atualizarTarefaAction(tarefa.id, {
        titulo,
        descricao: descricao || null,
        prazo: prazo || null,
        contaId,
      })
      if (!r.success) {
        toast.error(r.error)
        return
      }
      toast.success(r.message ?? 'Tarefa atualizada')
      onClose()
      router.refresh()
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar tarefa</DialogTitle>
          <DialogDescription>
            Prazo e conta continuam opcionais — deixe em branco se a tarefa
            não tiver data ou for geral.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tarefa-titulo">Título</Label>
            <Input
              id="tarefa-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              disabled={isPending}
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tarefa-descricao">Descrição</Label>
            <Textarea
              id="tarefa-descricao"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              disabled={isPending}
              rows={3}
              placeholder="Detalhes, links, o que combinaram…"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tarefa-prazo">Prazo</Label>
              <Input
                id="tarefa-prazo"
                type="date"
                value={prazo}
                onChange={(e) => setPrazo(e.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Conta de marketplace</Label>
              <SeletorConta
                contas={contas}
                valor={contaId}
                onChange={setContaId}
                disabled={isPending}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={isPending}>
            {isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ExcluirDialog({
  tarefa,
  onClose,
}: {
  tarefa: TarefaComContexto | null
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function excluir() {
    if (!tarefa) return
    startTransition(async () => {
      const r = await excluirTarefaAction(tarefa.id)
      if (!r.success) {
        toast.error(r.error)
        return
      }
      toast.success(r.message ?? 'Tarefa excluída')
      onClose()
      router.refresh()
    })
  }

  return (
    <Dialog open={tarefa !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir tarefa?</DialogTitle>
          <DialogDescription>
            <span className="text-foreground font-medium">
              {tarefa?.titulo}
            </span>{' '}
            vai pra lixeira, de onde dá pra restaurar.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={excluir} disabled={isPending}>
            {isPending ? 'Excluindo…' : 'Excluir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
