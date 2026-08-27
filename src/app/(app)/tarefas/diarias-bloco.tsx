'use client'

import { ChevronDown, Pencil, Plus, Repeat, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  atualizarDiariaAction,
  concluirDiariaAction,
  criarDiariaAction,
  excluirDiariaAction,
  reabrirDiariaAction,
  type DiariaComContexto,
  type ListaDiarias,
} from './diarias-actions'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  DIA_SEMANA_LABEL,
  DIA_SEMANA_NOME,
  TODOS_OS_DIAS,
  horaEmBrasilia,
  resumoDeDias,
} from '@/lib/dia-brasil'
import { cn } from '@/lib/utils'

// Bloco "Diárias de hoje" — rotinas que voltam pendentes todo dia.
//
// A DIÁRIA FEITA CONTINUA NA LISTA, riscada. Isto é checklist do dia: some
// da tela e ninguém consegue mais responder "já fizeram?" sem abrir outra
// coisa — que é justamente a pergunta que o bloco existe pra responder.
//
// `valeHoje` e `feitaHoje` vêm PRONTOS do servidor (ver diarias-actions.ts).
// Este componente não chama `new Date()` em lugar nenhum de propósito: o dia
// é o de Brasília, e recalculá-lo aqui faria o navegador discordar do
// servidor à noite.
export function DiariasBloco({ lista }: { lista: ListaDiarias }) {
  const { diarias, diaSemana } = lista
  const [criando, setCriando] = useState(false)
  const [editando, setEditando] = useState<DiariaComContexto | null>(null)
  const [excluindo, setExcluindo] = useState<DiariaComContexto | null>(null)
  const [mostrarTodas, setMostrarTodas] = useState(false)

  const deHoje = diarias.filter((d) => d.valeHoje)
  const feitas = deHoje.filter((d) => d.feitaHoje).length

  const dialogos = (
    <>
      {criando && <DiariaDialog onClose={() => setCriando(false)} />}
      {editando && (
        <DiariaDialog
          key={editando.id}
          diaria={editando}
          onClose={() => setEditando(null)}
        />
      )}
      <ExcluirDiariaDialog
        diaria={excluindo}
        onClose={() => setExcluindo(null)}
      />
    </>
  )

  // NADA CADASTRADO = NADA DE MOLDURA. Um card vazio com título e contador
  // "0 de 0" viraria móvel permanente no topo da tela de quem não usa
  // rotinas. Sobra só o convite, discreto.
  if (diarias.length === 0) {
    return (
      <>
        <button
          type="button"
          onClick={() => setCriando(true)}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm"
        >
          <Repeat className="size-4" />
          Adicionar uma diária de rotina
        </button>
        {dialogos}
      </>
    )
  }

  return (
    <section className="space-y-3">
      <div className="bg-card overflow-hidden rounded-xl border">
        <div className="flex items-center gap-3 border-b px-4 py-2.5">
          <Repeat className="text-muted-foreground size-4 shrink-0" />
          <h2 className="flex-1 text-sm font-medium">Diárias de hoje</h2>
          {deHoje.length > 0 && (
            <span
              className={cn(
                'text-muted-foreground text-xs tabular-nums',
                feitas === deHoje.length && 'text-foreground font-medium',
              )}
            >
              {feitas} de {deHoje.length} feita{deHoje.length > 1 ? 's' : ''}
            </span>
          )}
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => setCriando(true)}
            aria-label="Nova diária"
          >
            <Plus />
          </Button>
        </div>

        {deHoje.length === 0 ? (
          <p className="text-muted-foreground px-4 py-3 text-sm">
            Nada pra hoje — nenhuma das diárias cadastradas vale{' '}
            {DIA_SEMANA_NOME[diaSemana]}.
          </p>
        ) : (
          <div className="divide-y">
            {deHoje.map((d) => (
              <LinhaDiaria key={d.id} diaria={d} />
            ))}
          </div>
        )}
      </div>

      {/* As que não valem hoje precisam continuar gerenciáveis: sem isto,
          uma rotina de segunda vira invisível — e portanto ineditável — do
          sábado ao domingo. Mesmo padrão de recolher das concluídas. */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setMostrarTodas((v) => !v)}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm"
        >
          <ChevronDown
            className={cn(
              'size-4 transition-transform',
              mostrarTodas && 'rotate-180',
            )}
          />
          Todas as diárias ({diarias.length})
        </button>
        {mostrarTodas && (
          <div className="divide-y rounded-xl border">
            {diarias.map((d) => (
              <div
                key={d.id}
                className="flex items-start gap-3 px-4 py-2.5 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'font-medium',
                      !d.valeHoje && 'text-muted-foreground',
                    )}
                  >
                    {d.titulo}
                  </span>
                  <Badge
                    variant="secondary"
                    className="ml-2 align-middle text-[11px]"
                  >
                    {resumoDeDias(d.diasSemana)}
                  </Badge>
                  {d.descricao && (
                    <p className="text-muted-foreground mt-0.5 text-xs whitespace-pre-line">
                      {d.descricao}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => setEditando(d)}
                    aria-label={`Editar ${d.titulo}`}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => setExcluindo(d)}
                    aria-label={`Excluir ${d.titulo}`}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {dialogos}
    </section>
  )
}

// -----------------------------------------------------------------
// Linha do dia
// -----------------------------------------------------------------

function LinhaDiaria({ diaria: d }: { diaria: DiariaComContexto }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function alternar() {
    startTransition(async () => {
      // A caixa reflete `feitaHoje`, e não `concluidaEm !== null`: uma
      // conclusão de ONTEM é passado, e desmarcar o que já nasceu
      // desmarcado não faria nada.
      const r = d.feitaHoje
        ? await reabrirDiariaAction(d.id)
        : await concluirDiariaAction(d.id)
      if (!r.success) {
        toast.error(r.error)
        return
      }
      toast.success(r.message ?? 'Pronto')
      router.refresh()
    })
  }

  return (
    <div className="flex items-start gap-3 px-4 py-2.5">
      <Checkbox
        checked={d.feitaHoje}
        onCheckedChange={alternar}
        disabled={isPending}
        className="mt-0.5"
        aria-label={d.feitaHoje ? `Desmarcar ${d.titulo}` : `Marcar ${d.titulo}`}
      />
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            'text-sm font-medium',
            d.feitaHoje && 'text-muted-foreground line-through',
          )}
        >
          {d.titulo}
        </div>
        {d.descricao && (
          <p className="text-muted-foreground mt-0.5 text-xs whitespace-pre-line">
            {d.descricao}
          </p>
        )}
        {d.feitaHoje && (
          <p className="text-muted-foreground mt-1 text-xs">
            feita por {d.concluidaPorNome ?? '—'} às{' '}
            {horaEmBrasilia(new Date(d.concluidaEm!))}
          </p>
        )}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------
// Diálogos
// -----------------------------------------------------------------

// Criar e editar no MESMO diálogo: os campos são idênticos e duas telas
// iguais divergem na primeira vez que alguém mexe numa só.
//
// A criação da diária é deliberadamente um diálogo, e não um campo rápido
// como o das tarefas normais: aqui os dias da semana fazem parte da
// decisão, e uma rotina sem dias definidos não pode existir.
function DiariaDialog({
  diaria,
  onClose,
}: {
  diaria?: DiariaComContexto
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [titulo, setTitulo] = useState(diaria?.titulo ?? '')
  const [descricao, setDescricao] = useState(diaria?.descricao ?? '')
  const [dias, setDias] = useState<number[]>(
    diaria ? diaria.diasSemana : TODOS_OS_DIAS,
  )

  function alternarDia(dia: number) {
    setDias((atual) =>
      atual.includes(dia)
        ? atual.filter((d) => d !== dia)
        : [...atual, dia].sort((a, b) => a - b),
    )
  }

  function salvar() {
    if (titulo.trim().length < 2) {
      toast.error('Escreva o título da diária')
      return
    }
    if (dias.length === 0) {
      toast.error('Escolha pelo menos um dia da semana')
      return
    }
    startTransition(async () => {
      const input = {
        titulo,
        descricao: descricao || null,
        diasSemana: dias,
      }
      const r = diaria
        ? await atualizarDiariaAction(diaria.id, input)
        : await criarDiariaAction(input)
      if (!r.success) {
        toast.error(r.error)
        return
      }
      toast.success(r.message ?? 'Pronto')
      onClose()
      router.refresh()
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {diaria ? 'Editar diária' : 'Nova diária'}
          </DialogTitle>
          <DialogDescription>
            Rotina que volta pendente todo dia. Não acumula: se ninguém fizer
            hoje, amanhã ela nasce limpa.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="diaria-titulo">Título</Label>
            <Input
              id="diaria-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              disabled={isPending}
              autoComplete="off"
              placeholder="ex.: responder perguntas do ML"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="diaria-descricao">Descrição</Label>
            <Textarea
              id="diaria-descricao"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              disabled={isPending}
              rows={3}
              placeholder="Detalhes, links, o que conferir…"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Dias da semana</Label>
            <div className="flex flex-wrap gap-1.5">
              {TODOS_OS_DIAS.map((dia) => {
                const ativo = dias.includes(dia)
                return (
                  <button
                    key={dia}
                    type="button"
                    onClick={() => alternarDia(dia)}
                    disabled={isPending}
                    aria-pressed={ativo}
                    aria-label={DIA_SEMANA_NOME[dia]}
                    className={cn(
                      'w-12 rounded-lg border py-1.5 text-xs font-medium transition-colors',
                      ativo
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {DIA_SEMANA_LABEL[dia]}
                  </button>
                )
              })}
            </div>
            <p className="text-muted-foreground text-xs">
              {dias.length === 0
                ? 'Escolha pelo menos um dia.'
                : `Aparece ${resumoDeDias(dias)}.`}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button loading={isPending} onClick={salvar} disabled={isPending}>
            {'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ExcluirDiariaDialog({
  diaria,
  onClose,
}: {
  diaria: DiariaComContexto | null
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function excluir() {
    if (!diaria) return
    startTransition(async () => {
      const r = await excluirDiariaAction(diaria.id)
      if (!r.success) {
        toast.error(r.error)
        return
      }
      toast.success(r.message ?? 'Diária excluída')
      onClose()
      router.refresh()
    })
  }

  return (
    <Dialog open={diaria !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir diária?</DialogTitle>
          <DialogDescription>
            <span className="text-foreground font-medium">
              {diaria?.titulo}
            </span>{' '}
            vai pra lixeira, de onde dá pra restaurar.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            loading={isPending}
            variant="destructive"
            onClick={excluir}
            disabled={isPending}
          >
            {'Excluir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
