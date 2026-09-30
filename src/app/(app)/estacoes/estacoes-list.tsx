'use client'

import { Ban, Pencil, Plus, Trash2, Users } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  atualizarEstacaoAction,
  criarEstacaoAction,
  type EstacaoComDetalhes,
  excluirEstacaoAction,
  limparPinAction,
  type MaquinaOpcao,
  type OperadorOpcao,
} from './actions'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { nomeDaMaquina } from '@/lib/producao/nome-da-maquina'
import { cn } from '@/lib/utils'
import {
  ESTACAO_CORES,
  motivoParaNaoExcluirEstacao,
} from '@/lib/validators/estacoes'

type Props = {
  estacoes: EstacaoComDetalhes[]
  operadores: OperadorOpcao[]
  maquinas: MaquinaOpcao[]
  /** Admin ou gerente: mostra o "limpar PIN" ao lado do operador. */
  podeLimparPin?: boolean
}

// A ESTAÇÃO É O LUGAR DE UM TABLET: nome, cor e máquinas. O operador não
// pertence a ela — todo operador aparece em todo tablet e mexe em qualquer
// máquina (src/lib/db/acao-do-operador.ts). Por isso os operadores saíram do
// cartão e do diálogo da estação e viraram um quadro só, acima das estações,
// com o que ainda é da gerência: quem está sem PIN, e o "limpar PIN".

export function EstacoesList({
  estacoes,
  operadores,
  maquinas,
  podeLimparPin = false,
}: Props) {
  const [criando, setCriando] = useState(false)
  const [editando, setEditando] = useState<EstacaoComDetalhes | null>(null)
  const [excluindo, setExcluindo] = useState<EstacaoComDetalhes | null>(null)

  return (
    <div className="space-y-4">
      <QuadroDeOperadores operadores={operadores} podeLimparPin={podeLimparPin} />

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCriando(true)}>
          <Plus />
          Nova estação
        </Button>
      </div>

      {estacoes.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <p className="text-muted-foreground text-sm">
            Nenhuma estação cadastrada.
          </p>
          <Button size="sm" className="mt-3" onClick={() => setCriando(true)}>
            Criar primeira estação
          </Button>
        </div>
      ) : (
        <div className="vv-stagger grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {estacoes.map((e) => (
            <article
              key={e.id}
              className="bg-card flex flex-col gap-3 rounded-xl border p-4"
              style={
                e.cor ? { borderLeftColor: e.cor, borderLeftWidth: 4 } : undefined
              }
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className="size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: e.cor ?? 'var(--muted-foreground)' }}
                  />
                  <h3 className="font-medium">{e.nome}</h3>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => setEditando(e)}
                    aria-label="Editar"
                  >
                    <Pencil />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => setExcluindo(e)}
                    aria-label="Excluir"
                  >
                    <Trash2 className="text-destructive" />
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1">
                {e.maquinas.length === 0 ? (
                  <span className="text-muted-foreground text-xs">
                    Sem máquinas vinculadas
                  </span>
                ) : (
                  // "Máquina 4", como o tablet, a aba Máquinas e o diálogo
                  // chamam a máquina (src/lib/producao/nome-da-maquina.ts).
                  e.maquinas.map((m) => (
                    <Badge
                      key={m.id}
                      variant="secondary"
                      className="tabular-nums"
                    >
                      {nomeDaMaquina(m.numero)}
                    </Badge>
                  ))
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <EstacaoDialog
        open={criando}
        onClose={() => setCriando(false)}
        maquinas={maquinas}
      />
      <EstacaoDialog
        open={editando !== null}
        estacao={editando ?? undefined}
        onClose={() => setEditando(null)}
        maquinas={maquinas}
      />
      <ExcluirDialog estacao={excluindo} onClose={() => setExcluindo(null)} />
    </div>
  )
}

// -----------------------------------------------------------------
// Operadores — de todos os tablets
// -----------------------------------------------------------------

function QuadroDeOperadores({
  operadores,
  podeLimparPin,
}: {
  operadores: OperadorOpcao[]
  podeLimparPin: boolean
}) {
  return (
    <section className="bg-card flex items-start gap-2 rounded-xl border p-4 text-sm">
      <Users className="text-muted-foreground mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 space-y-1">
        <p className="font-medium">
          Operadores{' '}
          <span className="text-muted-foreground font-normal">
            · aparecem em todos os tablets
          </span>
        </p>
        {operadores.length === 0 ? (
          // Estado vazio explícito: hoje pode não existir operador nenhum, e
          // um quadro em branco pareceria bug.
          <p className="text-muted-foreground">
            Nenhum operador cadastrado. Os operadores saem dos usuários com
            cargo “Operador”, em{' '}
            <a href="/usuarios" className="underline underline-offset-2">
              Usuários
            </a>
            .
          </p>
        ) : (
          <p>
            {operadores.map((o, i) => (
              <span key={o.id}>
                {i > 0 && ' · '}
                {o.nome}
                {/* Sem PIN, o operador não troca de turno no tablet — tem que
                    digitar a senha inteira. O PIN é criado por ele mesmo, no
                    tablet. */}
                {!o.temPin && (
                  <span className="ml-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                    sem PIN
                  </span>
                )}
                {/* ESQUECEU O PIN? Até aqui, a única saída era SQL no banco
                    — e quem trava é quem está no meio do turno. Só aparece
                    pra quem TEM PIN: no resto não há o que limpar. */}
                {podeLimparPin && o.temPin && (
                  <LimparPinBotao id={o.id} nome={o.nome} />
                )}
              </span>
            ))}
          </p>
        )}
      </div>
    </section>
  )
}

// -----------------------------------------------------------------
// Dialog criar/editar
// -----------------------------------------------------------------

function EstacaoDialog({
  open,
  estacao,
  onClose,
  maquinas,
}: {
  open: boolean
  estacao?: EstacaoComDetalhes
  onClose: () => void
  maquinas: MaquinaOpcao[]
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {open && (
          <EstacaoBody
            key={estacao?.id ?? 'novo'}
            estacao={estacao}
            onClose={onClose}
            maquinas={maquinas}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function EstacaoBody({
  estacao,
  onClose,
  maquinas,
}: {
  estacao?: EstacaoComDetalhes
  onClose: () => void
  maquinas: MaquinaOpcao[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const isEdit = Boolean(estacao)

  const [nome, setNome] = useState(estacao?.nome ?? '')
  const [cor, setCor] = useState<string | undefined>(estacao?.cor ?? undefined)
  const [maquinaIds, setMaquinaIds] = useState<string[]>(
    estacao?.maquinaIds ?? [],
  )
  // O AVISO DE SAÍDA aparece no próprio rodapé, e não num segundo diálogo
  // empilhado: é a mesma decisão, e o que ela move está logo acima.
  const [confirmandoSaida, setConfirmandoSaida] = useState(false)

  // Máquinas marcadas que hoje estão em OUTRA estação. Salvar as tira de lá
  // (`aplicarMaquinas`) — e o tablet daquela estação perde a máquina sem
  // ninguém ter olhado pra ele.
  const saindoDeOutra = maquinas.filter(
    (m) =>
      maquinaIds.includes(m.id) &&
      m.estacaoId !== null &&
      m.estacaoId !== estacao?.id,
  )

  function toggleMaquina(id: string) {
    setConfirmandoSaida(false)
    setMaquinaIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  function salvar(confirmado = false) {
    if (!confirmado && saindoDeOutra.length > 0) {
      setConfirmandoSaida(true)
      return
    }
    startTransition(async () => {
      const input = { nome, cor, maquinaIds }
      const result = estacao
        ? await atualizarEstacaoAction(estacao.id, input)
        : await criarEstacaoAction(input)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'Salvo')
      router.refresh()
      onClose()
    })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isEdit ? 'Editar estação' : 'Nova estação'}</DialogTitle>
        <DialogDescription>
          A estação é o lugar de um tablet: o grupo de máquinas perto dele.
          Qualquer operador mexe em qualquer máquina.
        </DialogDescription>
      </DialogHeader>

      <div className="max-h-[60vh] space-y-4 overflow-y-auto">
        <div className="space-y-1.5">
          <Label htmlFor="est-nome">Nome</Label>
          <Input
            id="est-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="ex: Estação 1"
            autoFocus
            disabled={isPending}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Cor</Label>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setCor(undefined)}
              disabled={isPending}
              aria-label="Sem cor"
              className={cn(
                'text-muted-foreground flex size-7 items-center justify-center rounded-full border-2',
                !cor ? 'border-foreground' : 'border-border',
              )}
            >
              <Ban className="size-3.5" />
            </button>
            {ESTACAO_CORES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCor(c)}
                disabled={isPending}
                aria-label={`Cor ${c}`}
                style={{ backgroundColor: c }}
                className={cn(
                  'size-7 rounded-full border-2 transition-transform hover:scale-110',
                  cor === c
                    ? 'border-foreground ring-foreground/20 ring-2'
                    : 'border-transparent',
                )}
              />
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>
            Máquinas{' '}
            {maquinaIds.length > 0 && (
              <span className="text-muted-foreground font-normal">
                ({maquinaIds.length})
              </span>
            )}
          </Label>
          {maquinas.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              Nenhuma máquina cadastrada.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {maquinas.map((m) => {
                const ativo = maquinaIds.includes(m.id)
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleMaquina(m.id)}
                    disabled={isPending}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-xs tabular-nums transition-colors',
                      ativo
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'hover:bg-accent',
                    )}
                  >
                    {/* "Máquina 4", como o tablet e o cartão chamam a
                        máquina. A estação só aparece quando é OUTRA — na
                        própria, "· Estação 1" repetido em cada chip é
                        ruído. */}
                    {nomeDaMaquina(m.numero)}
                    {m.estacaoNome && m.estacaoId !== estacao?.id && (
                      <span className={cn(!ativo && 'text-muted-foreground')}>
                        {' · '}
                        {m.estacaoNome}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {confirmandoSaida && saindoDeOutra.length > 0 ? (
        <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          <ul className="space-y-0.5">
            {saindoDeOutra.map((m) => (
              <li key={m.id} className="tabular-nums">
                <span className="font-medium">{nomeDaMaquina(m.numero)}</span> sai da{' '}
                {m.estacaoNome}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmandoSaida(false)}
              disabled={isPending}
            >
              Voltar
            </Button>
            <Button
              loading={isPending}
              onClick={() => salvar(true)}
              disabled={isPending || nome.trim().length < 2}
            >
              Mover e salvar
            </Button>
          </div>
        </div>
      ) : (
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button loading={isPending} onClick={() => salvar()} disabled={isPending || nome.trim().length < 2}>
            {isEdit ? 'Salvar' : 'Criar'}
          </Button>
        </DialogFooter>
      )}
    </>
  )
}

// -----------------------------------------------------------------
// Dialog excluir
// -----------------------------------------------------------------

function ExcluirDialog({
  estacao,
  onClose,
}: {
  estacao: EstacaoComDetalhes | null
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  // A MESMA FRASE da action. Aqui ela só desabilita o botão antes; quem
  // recusa de verdade é o servidor, porque entre abrir e confirmar alguém
  // pode ter iniciado uma OP numa dessas máquinas.
  const bloqueio = estacao ? motivoParaNaoExcluirEstacao(estacao.maquinas) : null

  function excluir() {
    if (!estacao) return
    startTransition(async () => {
      const result = await excluirEstacaoAction(estacao.id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'Excluída')
      router.refresh()
      onClose()
    })
  }

  return (
    <Dialog open={estacao !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir {estacao?.nome}?</DialogTitle>
          <DialogDescription>
            A estação some. As máquinas não são apagadas, mas ficam sem
            estação.
          </DialogDescription>
        </DialogHeader>

        {/* O QUE ACONTECE, COM NOME. "As máquinas voltam a ficar sem estação"
            não dizia onde elas vão parar no tablet — é isso que quem exclui
            precisa pesar. Operador não entra aqui: ele não pertence a
            estação, e continua em todos os tablets. */}
        {estacao && (
          <div className="max-h-[50vh] space-y-3 overflow-y-auto text-sm">
            <div className="space-y-1">
              <p className="font-medium">
                Ficam sem estação — no tablet, vão pra aba “Sem estação”
              </p>
              {estacao.maquinas.length === 0 ? (
                <p className="text-muted-foreground">
                  Nenhuma máquina vinculada.
                </p>
              ) : (
                <ul className="text-muted-foreground space-y-0.5">
                  {estacao.maquinas.map((m) => (
                    <li key={m.id} className="tabular-nums">
                      <span className="text-foreground">
                        {nomeDaMaquina(m.numero)}
                      </span>
                      {m.opEmProducao && (
                        <span className="text-destructive font-medium">
                          {' '}
                          · {m.opEmProducao} em produção
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {bloqueio && (
          <p className="text-destructive text-sm font-medium">{bloqueio}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            loading={isPending}
            variant="destructive"
            onClick={excluir}
            disabled={isPending || bloqueio !== null}
          >
            Excluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// -----------------------------------------------------------------
// Limpar PIN
// -----------------------------------------------------------------

// Zera o PIN do operador — ele cadastra um novo no próximo toque do tablet.
// A confirmação existe porque, entre o clique e o próximo turno, o operador
// fica sem atalho: é rápido de refazer, mas não é invisível.
function LimparPinBotao({ id, nome }: { id: string; nome: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function limpar() {
    const ok = window.confirm(
      `Limpar o PIN de ${nome}? Ele vai criar um novo no próximo toque do tablet.`,
    )
    if (!ok) return
    startTransition(async () => {
      const r = await limparPinAction(id)
      if (!r.success) {
        toast.error(r.error)
        return
      }
      toast.success(r.message ?? 'PIN limpo')
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      onClick={limpar}
      disabled={isPending}
      className="text-muted-foreground hover:text-foreground ml-1 text-xs underline underline-offset-2 disabled:opacity-60"
    >
      {isPending ? 'limpando…' : 'limpar PIN'}
    </button>
  )
}
