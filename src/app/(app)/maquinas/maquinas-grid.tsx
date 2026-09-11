'use client'

import {
  ExternalLink,
  Factory,
  MoreHorizontal,
  Pencil,
  Power,
  Trash2,
  TriangleAlert,
  Wrench,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  excluirMaquinaAction,
  trocarStatusAction,
  type MaquinaListItem,
} from './actions'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/ui/empty-state'
import {
  contarMaquinas,
  grupoDaSituacao,
  situacaoDaMaquina,
  ROTULO_DO_GRUPO,
  type GrupoDeMaquina,
  type SituacaoDaMaquina,
} from '@/lib/producao/estado-maquina'
import { tituloDaOp } from '@/lib/producao/rotulo-da-op'
import { createClient as createBrowserSupabase } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

type Props = {
  maquinas: MaquinaListItem[]
  podeEditar: boolean
  /**
   * Quem enxerga a área `ordens` recebe o link pro detalhe da OP. Quem não
   * enxerga não recebe: `/ordens` tem `requireArea('ordens')`, e oferecer um
   * link que termina em redirect é pior do que não oferecer.
   */
  podeVerOrdens: boolean
}

// A cor sai do TOM da regra compartilhada, não do status cru. Enquanto era
// um mapa por status aqui, "operando" pintava de verde 18 máquinas paradas.
const TOM_DOT: Record<SituacaoDaMaquina['tom'], string> = {
  producao: 'bg-emerald-500',
  livre: 'bg-sky-500',
  atencao: 'bg-orange-500',
  inativa: 'bg-muted-foreground',
}

const SEM_ESTACAO = '__sem__'

// Agrupa as máquinas pela estação (Turma 1/2/3), na ordem das estações;
// máquinas sem estação ficam num grupo no final. A ordem dentro de cada
// grupo segue a listagem (por código: Máquina 1, 2, 3…).
function agruparPorEstacao(maquinas: MaquinaListItem[]) {
  const mapa = new Map<string, MaquinaListItem[]>()
  for (const m of maquinas) {
    const chave = m.estacaoNome ?? SEM_ESTACAO
    const arr = mapa.get(chave)
    if (arr) arr.push(m)
    else mapa.set(chave, [m])
  }
  return Array.from(mapa.entries())
    .sort(([a], [b]) => {
      if (a === SEM_ESTACAO) return 1
      if (b === SEM_ESTACAO) return -1
      return a.localeCompare(b, 'pt-BR', { numeric: true })
    })
    .map(([chave, ops]) => ({
      estacao: chave === SEM_ESTACAO ? null : chave,
      maquinas: ops,
    }))
}

export function MaquinasGrid({
  maquinas,
  podeEditar,
  podeVerOrdens,
}: Props) {
  const [excluindo, setExcluindo] = useState<MaquinaListItem | null>(null)
  const { estacao, grupo, definir } = useFiltrosNaUrl()
  const conectado = useAtualizacaoAoVivo()

  // A SITUAÇÃO É CALCULADA UMA VEZ e alimenta resumo, filtro e cartão. Se
  // cada um chamasse `situacaoDaMaquina` por conta, seriam três leituras da
  // mesma regra — iguais hoje, e uma delas esquecida amanhã.
  const comSituacao = useMemo(
    () =>
      maquinas.map((m) => ({
        maquina: m,
        situacao: situacaoDaMaquina(m.status, m.op !== null),
      })),
    [maquinas],
  )

  // ⚠️ O RESUMO CONTA A FÁBRICA INTEIRA, não o que sobrou do filtro. Filtrar
  // por "Estação 1" e ver o contador cair daria a impressão de que a fábrica
  // encolheu — o resumo responde "como está a fábrica", o filtro responde "o
  // que quero olhar agora".
  const contagem = useMemo(
    () => contarMaquinas(comSituacao.map((x) => x.situacao)),
    [comSituacao],
  )

  const estacoes = useMemo(
    () =>
      Array.from(
        new Set(maquinas.map((m) => m.estacaoNome ?? SEM_ESTACAO)),
      ).sort((a, b) =>
        a === SEM_ESTACAO ? 1 : b === SEM_ESTACAO ? -1 : a.localeCompare(b, 'pt-BR', { numeric: true }),
      ),
    [maquinas],
  )

  const visiveis = useMemo(
    () =>
      comSituacao
        .filter(
          (x) =>
            estacao === null ||
            (x.maquina.estacaoNome ?? SEM_ESTACAO) === estacao,
        )
        .filter((x) => grupo === null || grupoDaSituacao(x.situacao) === grupo)
        .map((x) => x.maquina),
    // Depende dos VALORES e não de um objeto `filtros`: um objeto novo a
    // cada render refaria a lista inteira toda vez, sem nada ter mudado.
    [comSituacao, estacao, grupo],
  )

  if (maquinas.length === 0) {
    return (
      <EmptyState
        icon={Factory}
        title="Nenhuma máquina cadastrada"
        description="Cadastre as máquinas da fábrica pra usar nas estações e nas OPs."
      />
    )
  }

  const grupos = agruparPorEstacao(visiveis)

  return (
    <>
      <div className="space-y-4">
        {/* RESUMO + FILTROS na mesma faixa: os números SÃO o filtro de
            situação. Ter um contador "3 indisponíveis" ao lado de um seletor
            que também diz "indisponíveis" seria a mesma escolha oferecida
            duas vezes. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 border-b pb-3">
          {(['em_producao', 'livre', 'indisponivel'] as const).map((g) => (
            <ContadorFiltro
              key={g}
              grupo={g}
              quantidade={
                g === 'em_producao'
                  ? contagem.emProducao
                  : g === 'livre'
                    ? contagem.livres
                    : contagem.indisponiveis
              }
              ativo={grupo === g}
              onClick={() => definir({ grupo: grupo === g ? null : g })}
            />
          ))}

          {estacoes.length > 1 && (
            <div className="ml-auto flex items-center gap-1.5">
              <Button
                size="sm"
                variant={estacao === null ? 'secondary' : 'ghost'}
                onClick={() => definir({ estacao: null })}
              >
                Todas
              </Button>
              {estacoes.map((e) => (
                <Button
                  key={e}
                  size="sm"
                  variant={estacao === e ? 'secondary' : 'ghost'}
                  onClick={() => definir({ estacao: estacao === e ? null : e })}
                >
                  {e === SEM_ESTACAO ? 'Sem estação' : e}
                </Button>
              ))}
            </div>
          )}
        </div>

        {/* ⚠️ O AVISO DE CONEXÃO EXISTE PRA NÃO MENTIR. Sem ele, um realtime
            caído deixa a tela parada mostrando dado velho com cara de atual —
            e numa tela que responde "o que está rodando agora", dado velho é
            pior que tela vazia. O resto do projeto é silencioso nisso; aqui
            não. */}
        {!conectado && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs text-amber-700 dark:text-amber-300">
            <TriangleAlert className="mt-px size-3.5 shrink-0" />
            <span>
              Sem atualização automática. O que está na tela pode não ser o de
              agora — recarregue a página.
            </span>
          </div>
        )}

        {grupos.length === 0 ? (
          // A SAÍDA VEM JUNTO COM O BECO SEM SAÍDA. Filtrar por "em produção"
          // numa fábrica parada é o caso NORMAL desta tela, e uma tela vazia
          // sem botão obriga a lembrar qual dos filtros estava ligado.
          <div className="rounded-md border border-dashed p-6 text-center">
            <p className="text-muted-foreground text-sm">
              Nenhuma máquina com esse filtro.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => definir({ estacao: null, grupo: null })}
            >
              Ver todas
            </Button>
          </div>
        ) : (
          grupos.map((g) => (
            <section key={g.estacao ?? SEM_ESTACAO} className="space-y-2.5">
              <div className="flex items-baseline gap-2">
                <h2 className="text-sm font-semibold">
                  {g.estacao ?? 'Sem estação'}
                </h2>
                <span className="text-muted-foreground text-xs">
                  {g.maquinas.length}{' '}
                  {g.maquinas.length === 1 ? 'máquina' : 'máquinas'}
                </span>
              </div>
              <div className="vv-stagger grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {g.maquinas.map((m) => (
                  <MaquinaCard
                    key={m.id}
                    maquina={m}
                    podeEditar={podeEditar}
                    podeVerOrdens={podeVerOrdens}
                    onExcluir={() => setExcluindo(m)}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      <ExcluirDialog maquina={excluindo} onClose={() => setExcluindo(null)} />
    </>
  )
}

// -----------------------------------------------------------------
// Filtros — moram na URL
// -----------------------------------------------------------------

// ⚠️ URL E NÃO ESTADO LOCAL: recarregar não perde o filtro, e dá pra mandar
// o link de "as indisponíveis da Estação 2" pra alguém.
//
// Escreve com `window.history.replaceState`, que o Next integra ao router e
// sincroniza com `useSearchParams` (docs: Native History API). O filtro é
// aplicado no CLIENTE sobre a lista já carregada — 18 máquinas não pagam uma
// ida ao servidor por clique —, então `router.push` seria um round-trip sem
// ganho nenhum.
//
// `replaceState` e não `pushState`: filtrar não é navegar. Com push, sair da
// tela exigiria apertar "voltar" uma vez por clique de filtro.
type Filtros = { estacao: string | null; grupo: GrupoDeMaquina | null }

const GRUPOS_VALIDOS: readonly GrupoDeMaquina[] = [
  'em_producao',
  'livre',
  'indisponivel',
]

function useFiltrosNaUrl() {
  const searchParams = useSearchParams()

  const estacao = searchParams.get('estacao')
  const grupoBruto = searchParams.get('situacao')
  // Valor inválido na URL (alguém digitou, ou o enum mudou) vira "sem
  // filtro" em vez de lista vazia sem explicação.
  const grupo = GRUPOS_VALIDOS.includes(grupoBruto as GrupoDeMaquina)
    ? (grupoBruto as GrupoDeMaquina)
    : null

  function definir(mudanca: Partial<Filtros>) {
    const params = new URLSearchParams(searchParams.toString())
    if ('estacao' in mudanca) {
      if (mudanca.estacao) params.set('estacao', mudanca.estacao)
      else params.delete('estacao')
    }
    if ('grupo' in mudanca) {
      if (mudanca.grupo) params.set('situacao', mudanca.grupo)
      else params.delete('situacao')
    }
    const qs = params.toString()
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname)
  }

  return { estacao, grupo, definir }
}

// -----------------------------------------------------------------
// Atualização ao vivo
// -----------------------------------------------------------------

// Escuta as DUAS tabelas que desenham esta tela: `ordens_producao` diz se a
// máquina está ocupada, `maquinas` diz se está impedida. As duas já estão na
// publicação `supabase_realtime` (05_realtime.sql) — sem isso o canal
// conectaria e nunca receberia evento, que é falha muda.
//
// Devolve se o canal está VIVO. O `subscribe` entrega o estado, e é dele que
// sai o aviso: quando cai, a tela diz que parou de atualizar em vez de
// continuar mostrando o que era verdade dez minutos atrás.
function useAtualizacaoAoVivo(): boolean {
  const router = useRouter()
  const [conectado, setConectado] = useState(true)

  useEffect(() => {
    const supabase = createBrowserSupabase()
    const canal = supabase
      .channel('maquinas-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ordens_producao' },
        () => router.refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'maquinas' },
        () => router.refresh(),
      )
      .subscribe((status) => {
        setConectado(status === 'SUBSCRIBED')
      })

    return () => {
      supabase.removeChannel(canal)
    }
  }, [router])

  return conectado
}

function ContadorFiltro({
  grupo,
  quantidade,
  ativo,
  onClick,
}: {
  grupo: GrupoDeMaquina
  quantidade: number
  ativo: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        'flex items-baseline gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors',
        ativo ? 'border-foreground/30 bg-accent' : 'hover:bg-accent/50',
      )}
    >
      <span className="text-base font-semibold tabular-nums">{quantidade}</span>
      <span className="text-muted-foreground">{ROTULO_DO_GRUPO[grupo]}</span>
    </button>
  )
}

// -----------------------------------------------------------------
// Card de máquina
// -----------------------------------------------------------------

function MaquinaCard({
  maquina,
  podeEditar,
  podeVerOrdens,
  onExcluir,
}: {
  maquina: MaquinaListItem
  podeEditar: boolean
  podeVerOrdens: boolean
  onExcluir: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // ⚠️ A MESMA FUNÇÃO DA TELA DO OPERADOR e do seletor do kanban
  // (src/lib/producao/estado-maquina.ts). Enquanto cada tela respondia por
  // conta própria, esta aqui lia só `maquinas.status` e dizia "Operando" nas
  // 18 máquinas com a fábrica parada.
  const s = situacaoDaMaquina(maquina.status, maquina.op !== null)
  const emManutencao = s.disponibilidade === 'manutencao'
  const desativada = s.disponibilidade === 'desativada'

  function definirStatus(novo: 'operando' | 'manutencao' | 'desativada') {
    startTransition(async () => {
      const result = await trocarStatusAction(maquina.id, { status: novo })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'Situação atualizada')
      router.refresh()
    })
  }

  return (
    // ⚠️ ALTURA PADRÃO (`min-h-44`), e não altura livre. A grade estica os
    // cartões de uma fileira até o mais alto, então UMA máquina com OP fazia
    // as duas vizinhas crescerem junto e ficarem com um vazio no meio — e as
    // fileiras sem OP nenhuma ficavam baixinhas. Numa tela cujo trabalho é
    // varrer 18 cartões procurando o que mudou, tamanho irregular é ruído.
    //
    // O número é o do cartão OCUPADO já compacto (cabeçalho + bloco da OP de
    // duas linhas + botão): o ocupado enche, o livre respira. Se o bloco da
    // OP crescer, este `min-h` precisa crescer junto — senão a irregularidade
    // volta em silêncio.
    <article className="vv-lift flex min-h-44 flex-col gap-3 rounded-xl border p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn('size-2.5 shrink-0 rounded-full', TOM_DOT[s.tom])}
            title={s.rotulo}
          />
          <div className="min-w-0">
            {/* O CÓDIGO NA FRENTE. A tela do operador identifica a máquina
                por ele ("TC-07") e esta aqui mostrava só o nome ("Máquina
                7") — duas telas nomeando o mesmo objeto de jeitos
                diferentes, com o operador tendo que traduzir. */}
            <div className="truncate font-medium">
              <span className="tabular-nums">{maquina.codigo}</span>
              <span className="text-muted-foreground font-normal">
                {' · '}
                {maquina.nome}
              </span>
            </div>
            <div
              className={cn(
                'text-xs',
                s.tom === 'producao' && 'font-medium text-emerald-700 dark:text-emerald-400',
                s.tom === 'atencao' && 'font-medium text-orange-700 dark:text-orange-400',
                (s.tom === 'livre' || s.tom === 'inativa') && 'text-muted-foreground',
              )}
            >
              {s.rotulo}
            </div>
          </div>
        </div>

        {/* ⚠️ EDITAR, DESATIVAR E EXCLUIR SAÍRAM DO CARTÃO pra dentro do
            menu. O cartão é de CONSULTA — o que se faz aqui o dia inteiro é
            olhar o que está rodando, não administrar cadastro. Dois ícones
            soltos ao lado do nome convidavam ao toque errado, e a lixeira
            ficava a um dedo de distância da informação mais lida da tela. */}
        {podeEditar && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Ações da ${maquina.codigo}`}
                />
              }
            >
              <MoreHorizontal />
            </DropdownMenuTrigger>
            {/* ⚠️ `w-auto`: o padrão do DropdownMenuContent é
                `w-(--anchor-width)` — a largura do GATILHO —, e aqui o
                gatilho é um botão de ícone de 32px. O menu nascia no piso de
                128px e "Desativar máquina" quebrava em duas linhas. */}
            <DropdownMenuContent align="end" className="w-auto whitespace-nowrap">
              <DropdownMenuItem
                onClick={() =>
                  definirStatus(desativada ? 'operando' : 'desativada')
                }
                disabled={isPending}
              >
                <Power />
                {desativada ? 'Ativar máquina' : 'Desativar máquina'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                render={<Link href={`/maquinas/${maquina.id}`} />}
              >
                <Pencil />
                Editar cadastro
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={onExcluir}>
                <Trash2 />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* ⚠️ A OP APARECE MESMO SOB MANUTENÇÃO. Os dois eixos são
          independentes: a manchete acima diz "Em manutenção", e este bloco
          diz que há trabalho preso ali dentro. Mostrar só um dos dois manda
          quem olha decidir errado — ou acha que a máquina está livre, ou
          acha que a OP sumiu.

          DUAS LINHAS, E ERAM QUATRO. O que saiu: o nome do produto com o
          modelo colado ("Manta - ACONCHEGO" em cima de "Areia · ACONCHEGO ·
          Manta" dizia ACONCHEGO e Manta duas vezes cada) e a linha própria
          do "Ver a OP" — o número virou o link. Cada linha aqui é altura que
          os 18 cartões pagam. */}
      {maquina.op && (
        <div className="min-w-0 rounded-md border px-2.5 py-2 text-xs">
          <div className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate">
              <TituloDaPeca op={maquina.op} />
            </span>
            {/* O NÚMERO É O LINK, quando a pessoa pode ver a área `ordens`.
                Vai pra LISTA FILTRADA e não pra /ordens/{id}: aquela rota é
                `requireRole(['admin','gerente_producao'])` e é a tela de
                EDIÇÃO — quem tem só `ver` em máquinas bateria num redirect. */}
            {podeVerOrdens ? (
              <Link
                href={`/ordens?q=${encodeURIComponent(maquina.op.numero)}`}
                className="text-muted-foreground hover:text-foreground inline-flex shrink-0 items-center gap-1 tabular-nums underline-offset-2 hover:underline"
              >
                {maquina.op.numero}
                <ExternalLink className="size-3" />
              </Link>
            ) : (
              <span className="text-muted-foreground shrink-0 tabular-nums">
                {maquina.op.numero}
              </span>
            )}
          </div>
          <div className="text-muted-foreground truncate tabular-nums">
            {maquina.op.quantidade} peças
            {/* "responsável" é quem PEGOU a OP, não um cadastro de máquina —
                o campo `operador_atual` que existia aqui apontava, em três
                máquinas, pra um usuário apagado (56_maquinas_rls_estacao.sql). */}
            {maquina.op.responsavelNome && ` · ${maquina.op.responsavelNome}`}
          </div>
        </div>
      )}

      {/* ⚠️ `mt-auto` GRUDA A AÇÃO NO RODAPÉ. A grade estica os cartões da
          mesma fileira até a altura do mais alto (o que tem OP dentro), e sem
          isto o botão de cada um parava onde o texto dele acabava — três
          botões em três alturas diferentes na mesma linha, que é o "um card
          ficou maior que o outro". */}
      {podeEditar && (
        <div className="mt-auto flex gap-1.5">
          {/* MANUTENÇÃO é toggle, e SAIR DELA NÃO DECLARA PRODUÇÃO: grava
              'operando', que passou a significar só "apta". A manchete então
              é recalculada da OP — se o trabalho continua lá, volta a "Em
              produção"; se não, "Livre". Antes isto gravava 'operando' com o
              sentido de "está rodando", e a máquina mentia até alguém
              corrigir à mão. */}
          {/* MANUTENÇÃO FICA VISÍVEL, sozinha. É a ação do dia a dia — a
              máquina parou agora e alguém precisa registrar —, e enterrá-la
              no menu custaria um toque em cima da urgência. Desativar é
              decisão, não rotina: aquela pode esperar o menu. */}
          <Button
            size="sm"
            variant={emManutencao ? 'default' : 'outline'}
            className="w-full"
            disabled={isPending}
            aria-pressed={emManutencao}
            onClick={() =>
              definirStatus(emManutencao ? 'operando' : 'manutencao')
            }
          >
            <Wrench />
            Manutenção
          </Button>
        </div>
      )}
    </article>
  )
}

// O MESMO TÍTULO DAS TELAS DE PEDIDO E DA FILA DO OPERADOR, montado pela
// mesma função (`tituloDaOp`, src/lib/producao/rotulo-da-op.ts). A família em
// negrito porque é o que a peça É; a variação em peso normal.
//
// ⚠️ Aqui havia um `variacaoDe` local que juntava cor · modelo · tamanho no
// braço, e o resultado era "Manta - ACONCHEGO" na linha de cima e "Areia ·
// ACONCHEGO · Manta" na de baixo — o modelo e o tamanho ditos duas vezes.
// `tituloDaOp` corta o modelo quando ele já está no nome do produto, e foi
// escrita justamente pra isso.
function TituloDaPeca({
  op,
}: {
  op: {
    produtoNome: string
    variacaoCor: string | null
    variacaoModelo: string | null
    variacaoTamanho: string | null
  }
}) {
  const t = tituloDaOp(op.produtoNome, {
    cor: op.variacaoCor,
    modelo: op.variacaoModelo,
    tamanho: op.variacaoTamanho,
  })
  return (
    <>
      <span className="font-medium">{t.familia}</span>
      {t.variacao && <span className="text-muted-foreground"> · {t.variacao}</span>}
    </>
  )
}

// -----------------------------------------------------------------
// Dialog de exclusão
// -----------------------------------------------------------------

function ExcluirDialog({
  maquina,
  onClose,
}: {
  maquina: MaquinaListItem | null
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function excluir() {
    if (!maquina) return
    startTransition(async () => {
      const result = await excluirMaquinaAction(maquina.id)
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
    <Dialog open={maquina !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir máquina?</DialogTitle>
          <DialogDescription>
            {maquina?.nome} será marcada como excluída. As OPs vinculadas
            mantêm a referência histórica.
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
