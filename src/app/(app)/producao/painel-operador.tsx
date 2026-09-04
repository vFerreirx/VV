'use client'

import { Delete, TriangleAlert } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'

import type { KanbanCardData } from './actions'
import {
  apontarProducaoAction,
  listarMaquinasParaPegar,
  mudarStatusOrdemAction,
  pegarOrdemAction,
  type MaquinasParaPegar,
} from '@/app/(app)/ordens/actions'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { createClient as createBrowserSupabase } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────────
// A TELA DE QUEM PRODUZ — não a de quem planeja.
// ─────────────────────────────────────────────────────────────────────────
//
// O kanban ao lado (kanban-board.tsx) é do gerente: quatro colunas, arrastar
// card, filtros, pastas de remessa Full, contador de limite, badge de aging.
// Aqui é o tablet preso na estação, dedo com fiapo de linha, luz de galpão.
// Um card é uma OP é uma decisão.
//
// O QUE ESTA TELA NÃO TEM, e a ausência é o desenho: arrastar, colunas,
// filtros, chips, agrupamento, histórico, ícone sem rótulo, nada que dependa
// de hover. Botão é verbo — "Apontar produção", "Terminei", "Pegar pra mim".
//
// MEDIDAS: alvo de toque a partir de 56px (`h-14`), tecla do numérico com
// 64px (`h-16`), texto de conteúdo a partir de 18px (`text-lg`).
//
// ⚠️ ISTO É SÓ UI. Nenhuma regra vive aqui: quem decide o que o operador
// pode é `operadorPodeAgirNaOrdem` / `condicaoDeVisaoDoOperador`
// (src/lib/db/estacao-operadores.ts) e as guardas das actions. A tela só
// evita oferecer o clique que já seria recusado, e mostra a mensagem que a
// action devolveu quando erra.

type Props = {
  nomeOperador: string
  estacaoNome: string | null
  minhas: KanbanCardData[]
  livres: KanbanCardData[]
  daEstacao: KanbanCardData[]
  /** Nível do kanban permite agir? Só esconde botão — a action é que decide. */
  podeAgir: boolean
}

/** "Terracota · King" — o que ele reconhece de longe, sem o nome do produto. */
function variacaoDe(op: KanbanCardData): string {
  return [op.variacaoCor, op.variacaoModelo, op.variacaoTamanho]
    .filter(Boolean)
    .join(' · ')
}

export function PainelOperador({
  nomeOperador,
  estacaoNome,
  minhas,
  livres,
  daEstacao,
  podeAgir,
}: Props) {
  const router = useRouter()
  const [apontando, setApontando] = useState<KanbanCardData | null>(null)
  const [terminando, setTerminando] = useState<KanbanCardData | null>(null)

  // Realtime, igual ao kanban: sem isto a OP que o colega acabou de pegar
  // continua aparecendo como livre, e o próximo toque leva um erro que a
  // tela poderia ter evitado.
  useEffect(() => {
    const supabase = createBrowserSupabase()
    const channel = supabase
      .channel('painel-operador-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ordens_producao' },
        () => router.refresh(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [router])

  // SEM ESTAÇÃO A TELA INTEIRA VIRA O AVISO, e não um toast que some.
  //
  // Sem estação ele não consegue pegar nada (`pegarOrdemAction` recusa) nem
  // agir em OP nenhuma (`operadorPodeAgirNaOrdem` recusa), e a visão dele se
  // reduz à fila. Mostrar as listas junto do aviso seria oferecer botões que
  // só devolvem erro — melhor dizer de cara do que ele descobrir clicando.
  if (!estacaoNome) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="rounded-xl border-2 border-amber-500/50 bg-amber-500/10 p-8 text-center">
          <TriangleAlert className="mx-auto size-12 text-amber-600 dark:text-amber-400" />
          <h1 className="mt-4 text-2xl font-semibold">
            Você ainda não está em nenhuma estação.
          </h1>
          <p className="mt-2 text-lg text-amber-800 dark:text-amber-200">
            Chame o Willian.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Cabeçalho: quem sou, onde estou, quantas comigo. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b pb-4">
        <h1 className="text-3xl font-semibold">
          {nomeOperador}
          <span className="text-muted-foreground font-normal"> · </span>
          <span className="text-muted-foreground font-normal">
            {estacaoNome}
          </span>
        </h1>
        <p className="text-xl">
          {minhas.length === 0
            ? 'nenhuma OP com você'
            : `${minhas.length} OP${minhas.length === 1 ? '' : 's'} com você`}
        </p>
      </div>

      <Secao titulo="Minhas OPs">
        {minhas.length === 0 ? (
          <Vazio>Nenhuma OP com você agora. Pegue uma da lista abaixo.</Vazio>
        ) : (
          <Grade>
            {minhas.map((op) => (
              <CardOp
                key={op.id}
                op={op}
                comProgresso
                acoes={
                  podeAgir &&
                  // OP minha SEM MÁQUINA não tem o que apontar nem o que
                  // terminar: `operadorPodeAgirNaOrdem` recusa as duas coisas
                  // enquanto não houver máquina. Em vez de oferecer dois
                  // botões que só devolvem erro, oferece o que resolve.
                  (op.maquinaId ? (
                    <AcoesDeQuemProduz
                      onApontar={() => setApontando(op)}
                      onTerminar={() => setTerminando(op)}
                    />
                  ) : (
                    <BotaoPegar op={op} rotulo="Escolher máquina" />
                  ))
                }
              />
            ))}
          </Grade>
        )}
      </Secao>

      <Secao titulo="Livres pra pegar">
        {livres.length === 0 ? (
          <Vazio>Nada livre no momento. Fale com o gerente.</Vazio>
        ) : (
          <Grade>
            {livres.map((op) => (
              <CardOp
                key={op.id}
                op={op}
                acoes={podeAgir && <BotaoPegar op={op} />}
              />
            ))}
          </Grade>
        )}
      </Secao>

      {/* A OP QUE O COLEGA PEGOU. Menor que as outras duas de propósito: não
          é o trabalho dele, é a passagem de turno — a OP que ficou pela
          metade quando o turno virou. A regra que permite agir nela está em
          `operadorPodeAgirNaOrdem`, e existe por esse motivo exato. */}
      {daEstacao.length > 0 && (
        <Secao titulo="Na estação (com o colega)">
          <Grade>
            {daEstacao.map((op) => (
              <CardOp
                key={op.id}
                op={op}
                comProgresso
                comResponsavel
                discreto
                acoes={
                  podeAgir && (
                    <AcoesDeQuemProduz
                      onApontar={() => setApontando(op)}
                      onTerminar={() => setTerminando(op)}
                    />
                  )
                }
              />
            ))}
          </Grade>
        </Secao>
      )}

      {apontando && (
        <ApontarDialog op={apontando} onClose={() => setApontando(null)} />
      )}
      {terminando && (
        <TerminarDialog op={terminando} onClose={() => setTerminando(null)} />
      )}
    </div>
  )
}

// -----------------------------------------------------------------
// Estrutura
// -----------------------------------------------------------------

function Secao({
  titulo,
  children,
}: {
  titulo: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
        {titulo}
      </h2>
      {children}
    </section>
  )
}

// Um card por linha; dois só a partir de telas largas. No tablet em pé, o
// card ocupa a largura toda — é o alvo mais fácil de acertar que existe.
function Grade({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">{children}</div>
}

function Vazio({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-lg">
      {children}
    </p>
  )
}

// -----------------------------------------------------------------
// O card
// -----------------------------------------------------------------

function CardOp({
  op,
  comProgresso = false,
  comResponsavel = false,
  discreto = false,
  acoes,
}: {
  op: KanbanCardData
  comProgresso?: boolean
  comResponsavel?: boolean
  discreto?: boolean
  acoes?: React.ReactNode | false
}) {
  const pronta = op.status === 'pronto_envio'

  return (
    <div
      className={cn(
        'rounded-xl border-2 p-4',
        discreto && 'bg-muted/30',
        pronta && 'border-emerald-500/50 bg-emerald-500/5',
      )}
    >
      {/* O que ele reconhece de longe vem primeiro e maior. O número da OP e
          a máquina são identificação, não conteúdo — vêm depois e menores. */}
      <div className="text-2xl leading-tight font-semibold">
        {op.produtoNome}
      </div>
      {variacaoDe(op) && (
        <div className="mt-0.5 text-xl">{variacaoDe(op)}</div>
      )}
      <div className="text-muted-foreground mt-1 text-sm">
        {op.numero}
        {' · '}
        {op.maquinaCodigo ?? 'sem máquina'}
        {comResponsavel && op.responsavelNome && ` · com ${op.responsavelNome}`}
      </div>

      {comProgresso && <Progresso op={op} />}

      {/* A OP já terminada não some da tela: ela vira este estado. Sem isso o
          card desapareceria no toque de "Terminei" e ele não saberia se deu
          certo — e a resposta ("agora é com o gerente") é o que ele precisa. */}
      {pronta ? (
        <p className="mt-3 text-lg font-medium text-emerald-700 dark:text-emerald-400">
          Pronta pro envio — o gerente conclui.
        </p>
      ) : (
        acoes && <div className="mt-4 flex gap-2">{acoes}</div>
      )}
    </div>
  )
}

// Progresso em PALAVRAS e em barra. A barra sozinha não diz quantas faltam,
// e é isso que ele precisa saber pra decidir se termina hoje.
function Progresso({ op }: { op: KanbanCardData }) {
  const pct =
    op.quantidade > 0
      ? Math.min(100, Math.round((op.produzido / op.quantidade) * 100))
      : 0
  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-baseline gap-x-3 text-lg">
        <span className="font-medium tabular-nums">
          {op.produzido} de {op.quantidade} prontas
        </span>
        {op.refugo > 0 && (
          <span className="text-destructive text-base tabular-nums">
            {op.refugo} refugo
          </span>
        )}
      </div>
      <div className="bg-muted mt-2 h-3 overflow-hidden rounded-full">
        <div
          className="bg-primary h-full rounded-full transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// -----------------------------------------------------------------
// Ações
// -----------------------------------------------------------------

function AcoesDeQuemProduz({
  onApontar,
  onTerminar,
}: {
  onApontar: () => void
  onTerminar: () => void
}) {
  return (
    <>
      <Button className="h-14 flex-1 text-lg" onClick={onApontar}>
        Apontar produção
      </Button>
      <Button
        variant="outline"
        className="h-14 flex-1 text-lg"
        onClick={onTerminar}
      >
        Terminei
      </Button>
    </>
  )
}

function BotaoPegar({
  op,
  rotulo = 'Pegar pra mim',
}: {
  op: KanbanCardData
  rotulo?: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [escolhendo, setEscolhendo] = useState(false)

  function pegar(maquinaId?: string) {
    startTransition(async () => {
      const r = await pegarOrdemAction(op.id, maquinaId)
      if (!r.success) {
        toast.error(r.error)
        return
      }
      setEscolhendo(false)
      toast.success(r.message ?? 'OP é sua')
      router.refresh()
    })
  }

  return (
    <>
      <Button
        className="h-14 flex-1 text-lg"
        loading={isPending}
        disabled={isPending}
        // OP que já tem máquina não pergunta de novo — a máquina dela é a
        // resposta. Mesma regra de `pegarOrdemAction`.
        onClick={() => (op.maquinaId ? pegar() : setEscolhendo(true))}
      >
        {rotulo}
      </Button>
      {escolhendo && (
        <EscolherMaquinaDialog
          ordemNumero={op.numero}
          isPending={isPending}
          onEscolher={(maquinaId) => pegar(maquinaId)}
          onClose={() => setEscolhendo(false)}
        />
      )}
    </>
  )
}

// Escolha da máquina, em botões grandes. É CONVENIÊNCIA, não a regra: quem
// valida se a máquina existe, é da estação e está livre é `pegarOrdemAction`.
function EscolherMaquinaDialog({
  ordemNumero,
  isPending,
  onEscolher,
  onClose,
}: {
  ordemNumero: string
  isPending: boolean
  onEscolher: (maquinaId: string) => void
  onClose: () => void
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

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-2xl">Em qual máquina?</DialogTitle>
          <DialogDescription className="text-base">
            A OP {ordemNumero} entra em produção na máquina escolhida.
          </DialogDescription>
        </DialogHeader>

        {dados === null && erro === null && (
          <p className="text-muted-foreground py-8 text-center text-lg">
            Carregando máquinas…
          </p>
        )}
        {erro && (
          <p className="text-destructive py-8 text-center text-lg">{erro}</p>
        )}
        {dados && dados.maquinas.length === 0 && (
          <p className="text-muted-foreground py-8 text-center text-lg">
            Nenhuma máquina vinculada à sua estação. Fale com o admin.
          </p>
        )}

        {dados && dados.maquinas.length > 0 && (
          <div className="grid max-h-[50vh] grid-cols-2 gap-2 overflow-y-auto">
            {dados.maquinas.map((m) => {
              // Duas OPs na mesma máquina não existe no mundo físico.
              const ocupada = m.ocupadaPorOp !== null
              return (
                <button
                  key={m.id}
                  type="button"
                  disabled={ocupada || isPending}
                  onClick={() => onEscolher(m.id)}
                  className={cn(
                    'focus-visible:ring-ring flex h-20 flex-col items-center justify-center rounded-xl border-2 px-3 focus-visible:ring-2 focus-visible:outline-none',
                    ocupada
                      ? 'text-muted-foreground cursor-not-allowed opacity-60'
                      : 'hover:border-primary hover:bg-primary/5',
                  )}
                >
                  <span className="text-xl font-semibold">{m.codigo}</span>
                  <span className="text-muted-foreground text-sm">
                    {ocupada ? `Ocupada — OP ${m.ocupadaPorOp}` : m.nome}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        <Button
          variant="ghost"
          className="h-14 text-lg"
          onClick={onClose}
          disabled={isPending}
        >
          Cancelar
        </Button>
      </DialogContent>
    </Dialog>
  )
}

// -----------------------------------------------------------------
// Apontar produção — o coração da tela
// -----------------------------------------------------------------

type Campo = 'produzida' | 'refugo'

function ApontarDialog({
  op,
  onClose,
}: {
  op: KanbanCardData
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [ativo, setAtivo] = useState<Campo>('produzida')
  const [valores, setValores] = useState<Record<Campo, string>>({
    produzida: '',
    refugo: '',
  })
  const [erro, setErro] = useState<string | null>(null)

  const faltam = Math.max(0, op.quantidade - op.produzido)

  // TECLADO PRÓPRIO NA TELA, e não o do tablet: o teclado do sistema cobre
  // metade da tela, some sozinho e às vezes nem abre quando há teclado
  // físico acoplado. Aqui a tecla é sempre a mesma, sempre no mesmo lugar.
  function digitar(d: string) {
    setErro(null)
    setValores((v) => {
      const atual = v[ativo]
      // 4 dígitos é mais do que qualquer OP real, e trava o zero à esquerda
      // infinito de quem apoia o dedo na tecla.
      if (atual.length >= 4) return v
      const novo = (atual + d).replace(/^0+(?=\d)/, '')
      return { ...v, [ativo]: novo }
    })
  }
  function apagar() {
    setErro(null)
    setValores((v) => ({ ...v, [ativo]: v[ativo].slice(0, -1) }))
  }
  function limpar() {
    setErro(null)
    setValores((v) => ({ ...v, [ativo]: '' }))
  }

  function salvar() {
    setErro(null)
    startTransition(async () => {
      const r = await apontarProducaoAction(op.id, {
        produzida: valores.produzida === '' ? 0 : valores.produzida,
        refugo: valores.refugo === '' ? 0 : valores.refugo,
      })
      if (!r.success) {
        // A MENSAGEM FICA NO DIÁLOGO, em tipo grande. A validação que recusa
        // apontamento zerado já existe no Zod; num toast, ela apareceria
        // atrás do diálogo aberto e sumiria antes de ele ler.
        setErro(r.error)
        return
      }
      toast.success(r.message ?? 'Apontamento registrado')
      router.refresh()
      onClose()
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl">{op.produtoNome}</DialogTitle>
          <DialogDescription className="text-base">
            {variacaoDe(op) && `${variacaoDe(op)} · `}
            faltam {faltam}
          </DialogDescription>
        </DialogHeader>

        {/* Dois campos, um ativo por vez. O destaque é BORDA GROSSA + anel,
            não só cor: no galpão a tela leva sol de lado, e diferença de
            matiz some. */}
        <div className="grid grid-cols-2 gap-3">
          <CampoNumero
            rotulo="Prontas"
            valor={valores.produzida}
            ativo={ativo === 'produzida'}
            onSelecionar={() => setAtivo('produzida')}
          />
          <CampoNumero
            rotulo="Refugo"
            valor={valores.refugo}
            ativo={ativo === 'refugo'}
            onSelecionar={() => setAtivo('refugo')}
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <Tecla key={d} onClick={() => digitar(d)} disabled={isPending}>
              {d}
            </Tecla>
          ))}
          <Tecla onClick={limpar} disabled={isPending} aria-label="Limpar">
            C
          </Tecla>
          <Tecla onClick={() => digitar('0')} disabled={isPending}>
            0
          </Tecla>
          <Tecla onClick={apagar} disabled={isPending} aria-label="Apagar">
            <Delete className="size-7" />
          </Tecla>
        </div>

        {erro && (
          <p
            role="alert"
            className="border-destructive/50 bg-destructive/10 text-destructive rounded-lg border-2 p-3 text-center text-lg font-medium"
          >
            {erro}
          </p>
        )}

        <Button
          className="h-16 text-xl"
          loading={isPending}
          disabled={isPending}
          onClick={salvar}
        >
          Salvar
        </Button>
        <Button
          variant="ghost"
          className="h-12"
          onClick={onClose}
          disabled={isPending}
        >
          Cancelar
        </Button>
      </DialogContent>
    </Dialog>
  )
}

function CampoNumero({
  rotulo,
  valor,
  ativo,
  onSelecionar,
}: {
  rotulo: string
  valor: string
  ativo: boolean
  onSelecionar: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelecionar}
      aria-pressed={ativo}
      className={cn(
        'focus-visible:ring-ring rounded-xl border-2 px-3 py-2 text-left focus-visible:ring-2 focus-visible:outline-none',
        ativo ? 'border-primary ring-primary/30 ring-4' : 'border-input',
      )}
    >
      <span className="text-muted-foreground block text-sm tracking-wide uppercase">
        {rotulo}
      </span>
      <span className="block text-4xl font-semibold tabular-nums">
        {valor === '' ? '0' : valor}
      </span>
    </button>
  )
}

// 64px de lado, com foco visível: o tablet da estação pode ter teclado
// acoplado, e quem navega por Tab precisa ver onde está.
function Tecla({
  children,
  onClick,
  disabled,
  'aria-label': ariaLabel,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  'aria-label'?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="bg-muted hover:bg-muted/70 focus-visible:ring-ring active:bg-muted/50 flex h-16 items-center justify-center rounded-xl text-2xl font-semibold disabled:opacity-50 focus-visible:ring-4 focus-visible:outline-none"
    >
      {children}
    </button>
  )
}

// -----------------------------------------------------------------
// Terminei
// -----------------------------------------------------------------

// CONFIRMAÇÃO, e não o toast-com-desfazer do kanban. Toque acidental no
// tablet é comum — a mão encosta na tela ao apoiar —, e desfazer exige ler
// rápido uma tarja que some. Aqui a pergunta espera.
function TerminarDialog({
  op,
  onClose,
}: {
  op: KanbanCardData
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  function confirmar() {
    setErro(null)
    startTransition(async () => {
      const r = await mudarStatusOrdemAction(op.id, { status: 'pronto_envio' })
      if (!r.success) {
        setErro(r.error)
        return
      }
      toast.success(r.message ?? 'OP pronta pro envio')
      router.refresh()
      onClose()
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            Terminou a OP {op.numero}?
          </DialogTitle>
          <DialogDescription className="text-lg">
            Ela vai pra Pronto envio
            {op.maquinaCodigo ? ` e libera a máquina ${op.maquinaCodigo}` : ''}.
          </DialogDescription>
        </DialogHeader>

        {erro && (
          <p
            role="alert"
            className="border-destructive/50 bg-destructive/10 text-destructive rounded-lg border-2 p-3 text-center text-lg font-medium"
          >
            {erro}
          </p>
        )}

        <Button
          className="h-16 text-xl"
          loading={isPending}
          disabled={isPending}
          onClick={confirmar}
        >
          Sim, terminei
        </Button>
        <Button
          variant="ghost"
          className="h-12"
          onClick={onClose}
          disabled={isPending}
        >
          Voltar
        </Button>
      </DialogContent>
    </Dialog>
  )
}
