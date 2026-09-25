'use client'

// OS DOIS DIÁLOGOS DAS PORTAS DO GERENTE — "Em qual máquina?" e "Concluir
// produção". Moram aqui, e não no board, porque três lugares abrem os dois: o
// arrastar do board, o botão principal do sheet e o Status manual do sheet.
// Com uma cópia em cada, o gerente veria perguntas diferentes pro mesmo gesto.
//
// ⚠️ SÃO CONVENIÊNCIA, NÃO A REGRA. Quem recusa máquina impedida, máquina
// ocupada e quantidade inválida é o servidor (`iniciarProducaoAction`,
// `concluirProducaoAction`). Aqui só se evita oferecer o que vai voltar como
// erro.
//
// ⚠️ NENHUM DOS DOIS MEXE NO CARD ANTES DE CONFIRMAR. Cancelar não tem o que
// desfazer: a OP nunca saiu do lugar.

import { useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  concluirProducaoAction,
  iniciarProducaoAction,
  listarMaquinasParaPegar,
  type MaquinaParaPegar,
  type MaquinasParaPegar,
} from '@/app/(app)/ordens/actions'
import { marcarEco } from '@/components/realtime/use-recarga-ao-vivo'
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
  calcularConclusao,
  conclusaoPedeMaquina,
  erroDeQuantidade,
} from '@/lib/producao/conclusao'
import type { StatusDaOrdem } from '@/lib/producao/destino-da-ordem'
import { cn } from '@/lib/utils'

// -----------------------------------------------------------------
// Em qual máquina?
// -----------------------------------------------------------------

export type OrdemParaIniciar = {
  id: string
  numero: string
  /** A máquina planejada, se houver. Vem marcada; a escolha é do gerente. */
  maquinaId: string | null
}

const SEM_ESTACAO = 'Sem estação'

export function IniciarNaMaquinaDialog({
  ordem,
  onFeito,
  onClose,
}: {
  ordem: OrdemParaIniciar
  onFeito: (mensagem: string) => void
  onClose: () => void
}) {
  const [dados, setDados] = useState<MaquinasParaPegar | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let vivo = true
    listarMaquinasParaPegar().then((r) => {
      if (!vivo) return
      if (r.success) setDados(r.data ?? null)
      else setErro(r.error)
    })
    return () => {
      vivo = false
    }
  }, [])

  // AGRUPADO POR ESTAÇÃO. O gerente recebe as máquinas da fábrica inteira, e
  // uma grade corrida de 22 códigos obriga a lembrar qual TC é de qual turma.
  const grupos = useMemo(() => {
    const mapa = new Map<string, MaquinaParaPegar[]>()
    for (const m of dados?.maquinas ?? []) {
      const chave = m.estacaoNome ?? SEM_ESTACAO
      const lista = mapa.get(chave)
      if (lista) lista.push(m)
      else mapa.set(chave, [m])
    }
    return [...mapa.entries()].sort(([a], [b]) =>
      a === SEM_ESTACAO
        ? 1
        : b === SEM_ESTACAO
          ? -1
          : a.localeCompare(b, 'pt-BR', { numeric: true }),
    )
  }, [dados])

  function escolher(maquinaId: string) {
    startTransition(async () => {
      marcarEco(ordem.id)
      const r = await iniciarProducaoAction(ordem.id, maquinaId)
      if (!r.success) {
        // O diálogo fica aberto: a próxima máquina está a um toque.
        toast.error(r.error)
        return
      }
      onFeito(r.message ?? 'OP em produção')
    })
  }

  const carregando = dados === null && erro === null

  return (
    <Dialog open onOpenChange={(o) => !o && !isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Em qual máquina?</DialogTitle>
          <DialogDescription>
            A OP {ordem.numero} entra em produção na máquina escolhida.
          </DialogDescription>
        </DialogHeader>

        {carregando && (
          <p className="text-muted-foreground py-6 text-center text-sm">
            Carregando máquinas…
          </p>
        )}

        {erro && (
          <p className="text-destructive py-6 text-center text-sm">{erro}</p>
        )}

        {dados && dados.maquinas.length === 0 && (
          <p className="text-muted-foreground py-6 text-center text-sm">
            Nenhuma máquina cadastrada.
          </p>
        )}

        {grupos.length > 0 && (
          <div className="max-h-[55vh] space-y-3 overflow-y-auto">
            {grupos.map(([estacao, lista]) => (
              <section key={estacao} className="space-y-1.5">
                {/* Com uma estação só, o título é ruído. */}
                {grupos.length > 1 && (
                  <h3 className="text-muted-foreground text-xs font-medium">
                    {estacao}
                  </h3>
                )}
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {lista.map((m) => {
                    // SÃO DOIS MOTIVOS pra máquina não servir, e a tela diz
                    // QUAL: ocupada (tem OP rodando) ou impedida (manutenção,
                    // setup, desativada). O impedimento vem de
                    // `motivoDeImpedimento`, a mesma função com que o servidor
                    // recusa.
                    const ocupada = m.ocupadaPorOp !== null
                    const bloqueada = ocupada || m.impedimento !== null
                    const planejada = m.id === ordem.maquinaId
                    return (
                      <button
                        key={m.id}
                        type="button"
                        disabled={bloqueada || isPending}
                        onClick={() => escolher(m.id)}
                        className={cn(
                          'flex flex-col items-start rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                          bloqueada
                            ? 'text-muted-foreground cursor-not-allowed opacity-60'
                            : 'hover:border-primary hover:bg-primary/5',
                          planejada && !bloqueada && 'border-primary/60',
                        )}
                      >
                        <span className="flex items-center gap-1.5 font-medium">
                          {m.codigo}
                          {planejada && (
                            <span className="text-primary text-[10px] font-normal">
                              planejada
                            </span>
                          )}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {ocupada
                            ? `Ocupada — OP ${m.ocupadaPorOp}`
                            : m.impedimento
                              ? `Indisponível — ${m.impedimento}`
                              : m.nome}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// -----------------------------------------------------------------
// Concluir produção
// -----------------------------------------------------------------

export type OrdemParaConcluir = {
  id: string
  numero: string
  status: StatusDaOrdem
  quantidade: number
  /** Soma dos apontamentos que já existem. Zero no fluxo novo. */
  produzido: number
  /** A máquina da OP (em produção) ou a planejada (fila), se houver. */
  maquinaId: string | null
}

// O MESMO CONTEÚDO DO DIÁLOGO DO OPERADOR — peças boas sugeridas com o que
// falta pra meta, e o defeito ao lado —, mas não o mesmo componente. O do
// tablet tem teclado próprio, trava de dígito no teto e rascunho que
// sobrevive ao logoff por inatividade; nada disso é problema de quem está no
// escritório com mouse e teclado.
//
// ⚠️ SEM TETO. O teto é só do operador (src/lib/producao/conclusao.ts): se a
// fábrica fez 32 numa OP de 30, quem planejou registra 32. A tela avisa que
// passou da meta, e o histórico diz quanto a mais.
export function ConcluirProducaoDialog({
  ordem,
  onFeito,
  onClose,
}: {
  ordem: OrdemParaConcluir
  onFeito: (resultado: { mensagem: string; concluiu: boolean }) => void
  onClose: () => void
}) {
  const conclusao = calcularConclusao(ordem.quantidade, ordem.produzido)
  const [produzidaTexto, setProduzidaTexto] = useState(
    String(conclusao.restante),
  )
  const [refugoTexto, setRefugoTexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const produzida = produzidaTexto === '' ? 0 : Number(produzidaTexto)
  const refugo = refugoTexto === '' ? 0 : Number(refugoTexto)
  const erroLocal = erroDeQuantidade(produzida, refugo, conclusao, {
    teto: false,
  })
  const aMais = conclusao.jaRegistrado + produzida - conclusao.meta
  // A OP não está numa máquina: o gerente diz onde ela foi feita. A planejada,
  // se houver, vem marcada.
  const pedeMaquina = conclusaoPedeMaquina(ordem.status, ordem.maquinaId)
  const [maquinaId, setMaquinaId] = useState<string | null>(ordem.maquinaId)

  function concluir() {
    if (pedeMaquina && !maquinaId) {
      setErro('Escolha em qual máquina a OP foi feita')
      return
    }
    if (erroLocal) {
      setErro(erroLocal)
      return
    }
    setErro(null)
    startTransition(async () => {
      marcarEco(ordem.id)
      const r = await concluirProducaoAction(ordem.id, {
        produzida,
        refugo,
        ...(pedeMaquina && maquinaId ? { maquinaId } : {}),
      })
      if (!r.success) {
        setErro(r.error)
        return
      }
      onFeito({
        mensagem: r.message ?? 'Produção concluída',
        concluiu: r.data?.concluiu === true,
      })
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Concluir produção</DialogTitle>
          <DialogDescription>
            OP {ordem.numero} · meta de {ordem.quantidade} peças
            {conclusao.jaRegistrado > 0 &&
              ` · ${conclusao.jaRegistrado} já registradas`}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            concluir()
          }}
        >
          {pedeMaquina && (
            <MaquinaDaConclusao
              escolhida={maquinaId}
              planejada={ordem.maquinaId}
              onEscolher={(id) => {
                setErro(null)
                setMaquinaId(id)
              }}
              disabled={isPending}
            />
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="concluir-boas">
                {conclusao.jaRegistrado > 0 ? 'Peças boas agora' : 'Peças boas'}
              </Label>
              <Input
                id="concluir-boas"
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                value={produzidaTexto}
                onChange={(e) => {
                  setErro(null)
                  setProduzidaTexto(e.target.value)
                }}
                disabled={isPending}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="concluir-refugo">Defeito</Label>
              <Input
                id="concluir-refugo"
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                placeholder="0"
                value={refugoTexto}
                onChange={(e) => {
                  setErro(null)
                  setRefugoTexto(e.target.value)
                }}
                disabled={isPending}
              />
            </div>
          </div>

          {/* Aviso, não bloqueio: acima da meta é permitido pro gerente. */}
          {aMais > 0 && !erroLocal && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {aMais} acima da meta — o histórico registra isso.
            </p>
          )}


          {erro && <p className="text-destructive text-sm">{erro}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              loading={isPending}
              disabled={isPending || (pedeMaquina && !maquinaId)}
            >
              Concluir produção
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// "EM QUAL MÁQUINA FOI FEITA?" — a OP concluída sem estar numa máquina.
//
// ⚠️ TODAS AS MÁQUINAS, inclusive ocupadas, em manutenção e desativadas. É o
// oposto do "Em qual máquina?" de iniciar: lá a pergunta é "onde pode rodar
// agora", aqui é "onde rodou". A peça já foi feita; ocupação e impedimento de
// hoje só aparecem como texto de apoio, pra ajudar a lembrar.
function MaquinaDaConclusao({
  escolhida,
  planejada,
  onEscolher,
  disabled,
}: {
  escolhida: string | null
  planejada: string | null
  onEscolher: (maquinaId: string) => void
  disabled: boolean
}) {
  const [dados, setDados] = useState<MaquinasParaPegar | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    listarMaquinasParaPegar().then((r) => {
      if (!vivo) return
      if (r.success) setDados(r.data ?? null)
      else setErro(r.error)
    })
    return () => {
      vivo = false
    }
  }, [])

  const grupos = useMemo(() => {
    const mapa = new Map<string, MaquinaParaPegar[]>()
    for (const m of dados?.maquinas ?? []) {
      const chave = m.estacaoNome ?? SEM_ESTACAO
      const lista = mapa.get(chave)
      if (lista) lista.push(m)
      else mapa.set(chave, [m])
    }
    return [...mapa.entries()].sort(([a], [b]) =>
      a === SEM_ESTACAO
        ? 1
        : b === SEM_ESTACAO
          ? -1
          : a.localeCompare(b, 'pt-BR', { numeric: true }),
    )
  }, [dados])

  return (
    <div className="space-y-1.5">
      <Label>
        Em qual máquina foi feita? <span className="text-destructive">*</span>
      </Label>
      {dados === null && erro === null && (
        <p className="text-muted-foreground text-sm">Carregando máquinas…</p>
      )}
      {erro && <p className="text-destructive text-sm">{erro}</p>}
      {grupos.length > 0 && (
        <div className="max-h-56 space-y-2 overflow-y-auto">
          {grupos.map(([estacao, lista]) => (
            <section key={estacao} className="space-y-1">
              {grupos.length > 1 && (
                <h3 className="text-muted-foreground text-xs font-medium">
                  {estacao}
                </h3>
              )}
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                {lista.map((m) => {
                  const ativa = m.id === escolhida
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => onEscolher(m.id)}
                      aria-pressed={ativa}
                      title={
                        m.ocupadaPorOp
                          ? `Agora com a OP ${m.ocupadaPorOp}`
                          : (m.impedimento ?? m.nome)
                      }
                      className={cn(
                        'flex flex-col items-start rounded-lg border px-2 py-1.5 text-left text-sm transition-colors',
                        ativa
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'hover:border-primary hover:bg-primary/5',
                      )}
                    >
                      <span className="font-medium tabular-nums">{m.codigo}</span>
                      <span
                        className={cn(
                          'text-[11px]',
                          ativa ? 'text-primary-foreground/80' : 'text-muted-foreground',
                        )}
                      >
                        {m.id === planejada
                          ? 'planejada'
                          : m.ocupadaPorOp
                            ? 'ocupada agora'
                            : m.impedimento
                              ? 'indisponível agora'
                              : ' '}
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
