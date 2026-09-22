'use client'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Factory,
  History,
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
  historicoDeParadas,
  trocarStatusAction,
  type MaquinaListItem,
  type ParadaDoHistorico,
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  contarMaquinas,
  grupoDaSituacao,
  situacaoDaMaquina,
  ROTULO_DO_GRUPO,
  type GrupoDeMaquina,
  type SituacaoDaMaquina,
} from '@/lib/producao/estado-maquina'
import { OpDetailSheet } from '@/app/(app)/producao/op-detail-sheet'
import { ParadaDialog } from '@/components/maquinas/parada-dialog'
import {
  marcarEco,
  useRecargaAoVivo,
} from '@/components/realtime/use-recarga-ao-vivo'
import { useDuracaoDesde } from '@/components/maquinas/use-duracao-desde'
import {
  duracaoEmPalavras,
  oQueParou,
  rotuloDoMotivo,
} from '@/lib/producao/parada-de-maquina'
import { tituloDaOp } from '@/lib/producao/rotulo-da-op'
import { cn } from '@/lib/utils'

type Props = {
  maquinas: MaquinaListItem[]
  /**
   * Escrita na área `maquinas`: cadastro, desativação, exclusão — e também
   * registrar e encerrar parada.
   *
   * ⚠️ O OPERADOR NÃO REGISTRA PARADA AQUI. Ele registra no tablet da
   * estação (/producao), que é onde está de pé quando a máquina para, com a
   * trava de PIN dizendo quem foi. Esta tela é da gerência; enquanto ela
   * também aceitava o operador pela estação, a mesma parada tinha duas portas
   * com regras diferentes, e só uma delas sabia quem estava tocando.
   */
  podeEditar: boolean
  /**
   * Quem enxerga a área `ordens` pode abrir a ficha da OP pelo número.
   */
  podeVerOrdens: boolean
  /**
   * O que a ficha da OP deixa fazer. Sem escrita no kanban, tudo falso — a
   * ficha abre só pra leitura.
   */
  fichaDaOp: { gestor: boolean; podeMover: boolean; podeEditarOrdens: boolean }
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
  fichaDaOp,
}: Props) {
  const [excluindo, setExcluindo] = useState<MaquinaListItem | null>(null)
  // UMA FICHA pra grade inteira, e não uma por cartão: são 18 cartões e só
  // uma OP aberta de cada vez.
  const [opAberta, setOpAberta] = useState<string | null>(null)
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
                    onAbrirOp={podeVerOrdens ? setOpAberta : null}
                    onExcluir={() => setExcluindo(m)}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      <ExcluirDialog maquina={excluindo} onClose={() => setExcluindo(null)} />
      <OpDetailSheet
        ordemId={opAberta}
        onClose={() => setOpAberta(null)}
        gestor={fichaDaOp.gestor}
        podeMover={fichaDaOp.podeMover}
        podeEditarOrdens={fichaDaOp.podeEditarOrdens}
      />
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
//
// Agrupado, espalhado, parado com a aba escondida e sem eco — ver
// src/components/realtime/use-recarga-ao-vivo.ts.
const TABELAS_DA_FABRICA = ['ordens_producao', 'maquinas'] as const

function useAtualizacaoAoVivo(): boolean {
  const router = useRouter()
  return useRecargaAoVivo({
    canal: 'maquinas-realtime',
    tabelas: TABELAS_DA_FABRICA,
    reacaoNaVolta: 'tela',
    decidir: () => 'tela',
    executar: () => router.refresh(),
  })
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
  onAbrirOp,
  onExcluir,
}: {
  maquina: MaquinaListItem
  podeEditar: boolean
  /** Null pra quem não enxerga a área `ordens`: o número fica só texto. */
  onAbrirOp: ((ordemId: string) => void) | null
  onExcluir: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  // 'abrir' pergunta o motivo; 'fechar' oferece a observação do que foi
  // feito. Os dois moram no mesmo diálogo porque são o mesmo gesto visto dos
  // dois lados.
  const [dialogoDeParada, setDialogoDeParada] = useState<
    'abrir' | 'fechar' | null
  >(null)
  const [verHistorico, setVerHistorico] = useState(false)

  // ⚠️ A MESMA FUNÇÃO DA TELA DO OPERADOR e do seletor do kanban
  // (src/lib/producao/estado-maquina.ts). Enquanto cada tela respondia por
  // conta própria, esta aqui lia só `maquinas.status` e dizia "Operando" nas
  // 18 máquinas com a fábrica parada.
  const s = situacaoDaMaquina(maquina.status, maquina.op !== null)
  const desativada = s.disponibilidade === 'desativada'
  // "VOLTOU" SERVE AO SETUP TAMBÉM. Os dois são a máquina parada esperando
  // alguém dizer que acabou; a desativada não — reativar é decisão de
  // cadastro, e mora no menu.
  const podeVoltar =
    s.disponibilidade === 'manutencao' || s.disponibilidade === 'em_setup'
  const desde = useDuracaoDesde(maquina.paradaAberta?.iniciadaEm ?? null)
  const parada = maquina.paradaAberta

  function definirStatus(novo: 'operando' | 'manutencao' | 'desativada') {
    startTransition(async () => {
      marcarEco(maquina.id)
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
            {/* ⚠️ A MESMA MANCHETE DO TABLET, montada pela mesma função
                (`oQueParou`): "Parada: falta de fio · há 2 h". O gerente e o
                operador leem a mesma frase sobre a mesma máquina. Setup,
                desativada e a manutenção marcada pelo cadastro não têm
                motivo e ficam com o rótulo de sempre.

                UMA LINHA, cortada com reticências: o "Outro" traz o texto que
                alguém digitou, e o inteiro está no diálogo do "Voltou". */}
            <div
              className={cn(
                'truncate text-xs',
                s.tom === 'producao' && 'font-medium text-emerald-700 dark:text-emerald-400',
                s.tom === 'atencao' && 'font-medium text-orange-700 dark:text-orange-400',
                (s.tom === 'livre' || s.tom === 'inativa') && 'text-muted-foreground',
              )}
            >
              {parada && parada.motivo !== null
                ? `Parada: ${oQueParou(parada)}`
                : s.rotulo}
              {/* ⚠️ O TEMPO ENTRA NA LINHA QUE JÁ EXISTE, não numa nova. O
                  cartão tem altura padrão (`min-h-44`) calibrada pro cartão
                  ocupado; uma linha a mais aqui faria a fileira inteira
                  crescer de novo, que foi o "um card ficou maior que o
                  outro". */}
              {desde && (
                <span className="text-muted-foreground font-normal">
                  {' · há '}
                  {desde}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ⚠️ EDITAR, DESATIVAR E EXCLUIR SAÍRAM DO CARTÃO pra dentro do
            menu. O cartão é de CONSULTA — o que se faz aqui o dia inteiro é
            olhar o que está rodando, não administrar cadastro. Dois ícones
            soltos ao lado do nome convidavam ao toque errado, e a lixeira
            ficava a um dedo de distância da informação mais lida da tela. */}
        {/* O MENU É DE QUEM TEM ESCRITA NA ÁREA — a mesma pessoa que
            registra a parada, e que por isso precisa poder conferir o que já
            foi registrado ali. */}
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
              <DropdownMenuItem onClick={() => setVerHistorico(true)}>
                <History />
                Histórico de paradas
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() =>
                  definirStatus(desativada ? 'operando' : 'desativada')
                }
                disabled={isPending}
              >
                <Power />
                {desativada ? 'Ativar máquina' : 'Desativar máquina'}
              </DropdownMenuItem>
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
            {/* O NÚMERO ABRE A FICHA DA OP, ali mesmo, quando a pessoa pode
                ver a área `ordens`. Antes levava pra /ordens filtrada: saía
                da fábrica pra ler uma OP e voltava pra achar o cartão de
                novo. A ficha é a mesma do kanban e de /remessas, e sem
                escrita no kanban ela abre só pra leitura. */}
            {onAbrirOp ? (
              <button
                type="button"
                onClick={() => onAbrirOp(maquina.op!.id)}
                className="text-muted-foreground hover:text-foreground shrink-0 tabular-nums underline underline-offset-2"
              >
                {maquina.op.numero}
              </button>
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
      {/* A AÇÃO DA PARADA FICA VISÍVEL, sozinha. É a do dia a dia — a
          máquina parou agora e alguém precisa registrar —, e enterrá-la no
          menu custaria um toque em cima da urgência. Desativar é decisão,
          não rotina: aquela pode esperar o menu, e a desativada não tem botão
          aqui.

          OS MESMOS VERBOS DO TABLET: "Registrar parada" na apta, "Voltou" na
          parada. Antes era um "Manutenção" que ligava e desligava — o
          gerente e o operador davam dois nomes pro mesmo gesto.

          "VOLTOU" NÃO DECLARA PRODUÇÃO: grava 'operando', que significa só
          "apta". A manchete é recalculada da OP — se o trabalho continua lá,
          volta a "Em produção"; se não, "Livre". */}
      {podeEditar && !desativada && (
        <div className="mt-auto flex gap-1.5">
          {podeVoltar ? (
            <Button
              size="sm"
              className="w-full"
              disabled={isPending}
              onClick={() => setDialogoDeParada('fechar')}
            >
              Voltou
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              disabled={isPending}
              onClick={() => setDialogoDeParada('abrir')}
            >
              <Wrench />
              Registrar parada
            </Button>
          )}
        </div>
      )}

      <ParadaDialog
        maquina={maquina}
        modo={dialogoDeParada}
        onClose={() => setDialogoDeParada(null)}
        // O que o "Voltou" encerra, inteiro — é onde o texto de um "Outro",
        // cortado na manchete, aparece por completo.
        paradaAberta={parada}
      />
      <HistoricoSheet
        maquina={verHistorico ? maquina : null}
        onClose={() => setVerHistorico(false)}
      />
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
// Histórico de paradas
// -----------------------------------------------------------------

function HistoricoSheet({
  maquina,
  onClose,
}: {
  maquina: MaquinaListItem | null
  onClose: () => void
}) {
  return (
    <Sheet open={maquina !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {/* Só monta o conteúdo quando abre — assim a consulta sai UMA vez, por
            máquina aberta, e não dezoito vezes ao carregar a tela. */}
        {maquina && <HistoricoConteudo maquina={maquina} />}
      </SheetContent>
    </Sheet>
  )
}

function HistoricoConteudo({ maquina }: { maquina: MaquinaListItem }) {
  const [itens, setItens] = useState<ParadaDoHistorico[] | null>(null)

  useEffect(() => {
    let vivo = true
    historicoDeParadas(maquina.id).then((r) => {
      if (vivo) setItens(r)
    })
    return () => {
      vivo = false
    }
  }, [maquina.id])

  return (
    <>
      <SheetHeader>
        <SheetTitle>
          <span className="tabular-nums">{maquina.codigo}</span>
          <span className="text-muted-foreground font-normal">
            {' · '}
            {maquina.nome}
          </span>
        </SheetTitle>
        <SheetDescription>
          Cada vez que a máquina parou: por quê, quanto tempo e quem registrou.
        </SheetDescription>
      </SheetHeader>

      <div className="px-4 pb-4">
        {itens === null ? (
          <p className="text-muted-foreground text-sm">Carregando…</p>
        ) : itens.length === 0 ? (
          // ⚠️ O VAZIO PRECISA DIZER QUE É NOVO. Sem esta frase, uma máquina
          // que quebra toda semana aparece com histórico limpo e a conclusão
          // natural é "nunca parou" — quando o certo é "ninguém registrou
          // ainda, porque isto começou agora".
          <p className="text-muted-foreground text-sm">
            Nenhuma parada registrada. O registro começou junto com esta tela:
            paradas anteriores não existem no sistema.
          </p>
        ) : (
          <ol className="space-y-3">
            {itens.map((p) => (
              <LinhaDaParada key={p.id} parada={p} />
            ))}
          </ol>
        )}
      </div>
    </>
  )
}

function LinhaDaParada({ parada }: { parada: ParadaDoHistorico }) {
  const aberta = parada.encerradaEm === null
  const duracao = useDuracaoDesde(aberta ? parada.iniciadaEm : null)

  return (
    <li
      className={cn(
        'border-l-2 pl-3 text-sm',
        aberta ? 'border-orange-500' : 'border-border',
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="font-medium">{rotuloDoMotivo(parada.motivo)}</span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {aberta
            ? duracao && `em aberto · há ${duracao}`
            : `durou ${duracaoEmPalavras(parada.iniciadaEm, parada.encerradaEm!)}`}
        </span>
      </div>

      <div className="text-muted-foreground text-xs tabular-nums">
        {format(parada.iniciadaEm, "dd/MM/yy 'às' HH:mm", { locale: ptBR })}
        {/* O status só aparece quando NÃO é manutenção: "Quebra · manutenção"
            diria duas vezes a mesma coisa. O que interessa distinguir é a
            parada que veio do cadastro (setup, desativação). */}
        {parada.status !== 'manutencao' &&
          ` · ${ROTULO_DO_STATUS[parada.status]}`}
        {parada.abertaPorNome && ` · ${parada.abertaPorNome}`}
      </div>

      {parada.observacaoAbertura && (
        <p className="mt-0.5 text-xs">{parada.observacaoAbertura}</p>
      )}

      {parada.opNumero && (
        <p className="text-muted-foreground mt-0.5 text-xs tabular-nums">
          Com a OP {parada.opNumero} na máquina
        </p>
      )}

      {!aberta && (
        <div className="text-muted-foreground mt-0.5 text-xs">
          Liberada{parada.encerradaPorNome && ` por ${parada.encerradaPorNome}`}
          {parada.observacaoFechamento && (
            <span className="text-foreground">
              {' — '}
              {parada.observacaoFechamento}
            </span>
          )}
        </div>
      )}
    </li>
  )
}

// Só os três chegam aqui: o CHECK `maquina_paradas_status_ck` (57) recusa
// qualquer outro.
const ROTULO_DO_STATUS: Record<string, string> = {
  manutencao: 'manutenção',
  setup: 'setup',
  desativada: 'desativada',
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
