'use client'

import { Ban, Pencil, Plus, Trash2, Users } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  ESTACAO_CORES,
  MAX_OPERADORES_POR_ESTACAO,
  motivoParaNaoExcluirEstacao,
} from '@/lib/validators/estacoes'

type Props = {
  estacoes: EstacaoComDetalhes[]
  operadores: OperadorOpcao[]
  maquinas: MaquinaOpcao[]
  /** Admin ou gerente: mostra o "limpar PIN" ao lado do operador. */
  podeLimparPin?: boolean
}

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

              <div className="flex items-start gap-2 text-sm">
                <Users className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                {e.operadores.length === 0 ? (
                  <span className="text-muted-foreground">Sem operadores</span>
                ) : (
                  <span>
                    {e.operadores.map((o, i) => (
                      <span key={o.id}>
                        {i > 0 && ' · '}
                        {o.nome}
                        {/* Sem PIN, o operador não troca de turno no tablet
                            — tem que digitar a senha inteira. O PIN é criado
                            por ele mesmo, no tablet. */}
                        {!o.temPin && (
                          <span className="ml-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                            sem PIN
                          </span>
                        )}
                        {/* ESQUECEU O PIN? Até aqui, a única saída era SQL no
                            banco — e quem trava é quem está no meio do turno.
                            Só aparece pra quem TEM PIN: no resto não há o que
                            limpar. */}
                        {podeLimparPin && o.temPin && (
                          <LimparPinBotao id={o.id} nome={o.nome} />
                        )}
                      </span>
                    ))}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-1">
                {e.maquinas.length === 0 ? (
                  <span className="text-muted-foreground text-xs">
                    Sem máquinas vinculadas
                  </span>
                ) : (
                  // O CÓDIGO, que é como o tablet, a aba Máquinas e o diálogo
                  // chamam a máquina. O nome fica no title.
                  e.maquinas.map((m) => (
                    <Badge
                      key={m.id}
                      variant="secondary"
                      className="tabular-nums"
                      title={m.nome}
                    >
                      {m.codigo}
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
        operadores={operadores}
        maquinas={maquinas}
      />
      <EstacaoDialog
        open={editando !== null}
        estacao={editando ?? undefined}
        onClose={() => setEditando(null)}
        operadores={operadores}
        maquinas={maquinas}
      />
      <ExcluirDialog estacao={excluindo} onClose={() => setExcluindo(null)} />
    </div>
  )
}

// -----------------------------------------------------------------
// Dialog criar/editar
// -----------------------------------------------------------------

function EstacaoDialog({
  open,
  estacao,
  onClose,
  operadores,
  maquinas,
}: {
  open: boolean
  estacao?: EstacaoComDetalhes
  onClose: () => void
  operadores: OperadorOpcao[]
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
            operadores={operadores}
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
  operadores,
  maquinas,
}: {
  estacao?: EstacaoComDetalhes
  onClose: () => void
  operadores: OperadorOpcao[]
  maquinas: MaquinaOpcao[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const isEdit = Boolean(estacao)

  const [nome, setNome] = useState(estacao?.nome ?? '')
  const [cor, setCor] = useState<string | undefined>(estacao?.cor ?? undefined)
  // Três slots, sem turno. 'nenhum' = slot vazio — o Select do design system
  // não aceita value vazio, então é o mesmo sentinela que o Zod já descarta.
  const [operadorSlots, setOperadorSlots] = useState<string[]>(() =>
    Array.from(
      { length: MAX_OPERADORES_POR_ESTACAO },
      (_, i) => estacao?.operadorIds[i] ?? 'nenhum',
    ),
  )
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

  const operadoresItems = useMemo(
    () => ({
      nenhum: 'Nenhum',
      ...Object.fromEntries(operadores.map((o) => [o.id, o.nome])),
    }),
    [operadores],
  )

  function definirSlot(indice: number, valor: string) {
    setOperadorSlots((prev) =>
      prev.map((atual, i) => (i === indice ? valor : atual)),
    )
  }

  // Um operador só pode ocupar um slot. Desabilitar é melhor que deixar
  // escolher e recusar depois no Zod.
  function jaEmOutroSlot(operadorId: string, indice: number) {
    return operadorSlots.some((v, i) => i !== indice && v === operadorId)
  }

  // E só pode estar numa estação — o UNIQUE do banco garante isso. Aqui é só
  // pra tela não oferecer o que a action vai recusar.
  function deOutraEstacao(o: OperadorOpcao) {
    return o.estacaoAtualId !== null && o.estacaoAtualId !== estacao?.id
  }

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
      const input = {
        nome,
        cor,
        // Slots vazios somem; a ordem dos escolhidos não significa nada.
        operadorIds: operadorSlots.filter((v) => v !== 'nenhum'),
        maquinaIds,
      }
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
          Defina a cor, quem opera a estação e as máquinas do grupo.
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
          <Label className="flex items-center gap-1.5">
            <Users className="text-muted-foreground size-4" /> Operadores da
            estação
          </Label>

          {operadores.length === 0 ? (
            // Estado vazio explícito. Sem isto o admin abre, vê três selects
            // com só "Nenhum" dentro e conclui que a tela quebrou — hoje não
            // existe NENHUM usuário com cargo operador cadastrado.
            <div className="rounded-lg border border-dashed p-3 text-sm">
              <p className="font-medium">Nenhum operador cadastrado ainda.</p>
              <p className="text-muted-foreground mt-1">
                Os operadores da estação saem dos usuários com cargo
                “Operador”. Crie um em{' '}
                <a href="/usuarios" className="underline underline-offset-2">
                  Usuários
                </a>{' '}
                e volte aqui. Dá pra salvar a estação sem operador e vincular
                depois.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {operadorSlots.map((valor, i) => (
                <div key={i} className="space-y-1.5">
                  <Label
                    htmlFor={`est-op-${i}`}
                    className="text-muted-foreground text-xs font-normal"
                  >
                    {i === MAX_OPERADORES_POR_ESTACAO - 1
                      ? `Operador ${i + 1} (opcional)`
                      : `Operador ${i + 1}`}
                  </Label>
                  <Select
                    items={operadoresItems}
                    value={valor}
                    onValueChange={(v) => v && definirSlot(i, v)}
                    disabled={isPending}
                  >
                    <SelectTrigger id={`est-op-${i}`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nenhum">Nenhum</SelectItem>
                      {operadores.map((o) => (
                        <SelectItem
                          key={o.id}
                          value={o.id}
                          disabled={jaEmOutroSlot(o.id, i) || deOutraEstacao(o)}
                        >
                          {o.nome}
                          {deOutraEstacao(o)
                            ? ` — já está na ${o.estacaoAtualNome}`
                            : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          )}
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
                    title={m.nome}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-xs tabular-nums transition-colors',
                      ativo
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'hover:bg-accent',
                    )}
                  >
                    {/* O CÓDIGO, que é como o tablet e o cartão chamam a
                        máquina. A estação só aparece quando é OUTRA — na
                        própria, "· Estação 1" repetido em cada chip é
                        ruído. */}
                    {m.codigo}
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
                <span className="font-medium">{m.codigo}</span> sai da{' '}
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
            A estação some. Máquinas e operadores não são apagados, mas ficam
            sem estação.
          </DialogDescription>
        </DialogHeader>

        {/* O QUE ACONTECE, COM NOME. "As máquinas voltam a ficar sem estação"
            não dizia que elas somem dos tablets, nem que os operadores
            perdem o tablet junto — é isso que quem exclui precisa pesar. */}
        {estacao && (
          <div className="max-h-[50vh] space-y-3 overflow-y-auto text-sm">
            <div className="space-y-1">
              <p className="font-medium">
                Ficam sem estação e somem dos tablets
              </p>
              {estacao.maquinas.length === 0 ? (
                <p className="text-muted-foreground">
                  Nenhuma máquina vinculada.
                </p>
              ) : (
                <ul className="text-muted-foreground space-y-0.5">
                  {estacao.maquinas.map((m) => (
                    <li key={m.id} className="tabular-nums">
                      <span className="text-foreground">{m.codigo}</span>
                      {' · '}
                      {m.nome}
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
            <div className="space-y-1">
              <p className="font-medium">
                Ficam sem estação e não conseguem mais usar o tablet
              </p>
              {estacao.operadores.length === 0 ? (
                <p className="text-muted-foreground">
                  Nenhum operador vinculado.
                </p>
              ) : (
                <p className="text-muted-foreground">
                  {estacao.operadores.map((o) => o.nome).join(', ')}
                </p>
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
