'use client'

// A TAREFA FIXADA NUMA JANELINHA POR CIMA DE TUDO (Document
// Picture-in-Picture).
//
// PRA QUE SERVE: a tarefa é executada FORA daqui — no Mercado Livre, na
// Shopee —, e a instrução fica nesta tela, atrás do navegador. Ler, trocar de
// aba, esquecer metade, voltar. A janelinha põe a descrição inteira na frente
// do trabalho e deixa marcar como concluída ali mesmo, sem voltar pro sistema.
//
// UMA JANELA POR VEZ, e isso é da API, não escolha nossa: `requestWindow` com
// uma janela aberta não abre a segunda. Por isso fixar outra tarefa TROCA o
// conteúdo — e por isso o estado guarda `{ tipo, id }`, nunca a janela como
// "dona" de uma tarefa.
//
// ─────────────────────────────────────────────────────────────────────────
// POR QUE UM CONTEXTO, E NÃO PROPS
// ─────────────────────────────────────────────────────────────────────────
// O botão precisa aparecer em DUAS linhas que moram em árvores diferentes:
// `LinhaTarefa` (tarefas-view.tsx) e `LinhaDiaria`, que está dentro de
// `DiariasBloco` e recebe só `lista`. Por props, `DiariasBloco` teria que
// carregar três coisas que não usa pra nada só pra entregar na linha de
// baixo. Com o contexto, diarias-bloco.tsx muda em UM lugar — o botão.
//
// ─────────────────────────────────────────────────────────────────────────
// O ESTADO GUARDA A REFERÊNCIA, NUNCA O OBJETO
// ─────────────────────────────────────────────────────────────────────────
// `{ tipo, id }`, e o item é reencontrado nas props a cada render. É isso que
// faz a janela se atualizar sozinha quando a lista muda (o `createPortal`
// mantém tudo na MESMA árvore React), e é isso que faz a janela fechar quando
// o item some — tarefa excluída noutra aba não fica de pé numa janela por
// cima de tudo, afirmando uma pendência que não existe mais.

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  CalendarClock,
  Check,
  PictureInPicture2,
  Repeat,
  TriangleAlert,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'

import { concluirTarefaAction, type TarefaComContexto } from './actions'
import {
  concluirDiariaAction,
  type DiariaComContexto,
} from './diarias-actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { horaEmBrasilia, resumoDeDias } from '@/lib/dia-brasil'
import {
  PRIORIDADE_BADGE,
  PRIORIDADE_LABEL,
  ehDestaque,
} from '@/lib/prioridade'
import { cn } from '@/lib/utils'
import { estaVencida } from '@/lib/validators/tarefas'

export type TipoFixavel = 'tarefa' | 'diaria'

type Fixada = { tipo: TipoFixavel; id: string }

// O item RESOLVIDO das props de agora — união discriminada porque tarefa e
// diária mostram cabeçalhos diferentes e chamam actions diferentes.
type Alvo =
  | { tipo: 'tarefa'; tarefa: TarefaComContexto }
  | { tipo: 'diaria'; diaria: DiariaComContexto }

type Contexto = {
  suportado: boolean
  fixada: Fixada | null
  alternar: (tipo: TipoFixavel, id: string) => void
}

const PipContexto = createContext<Contexto | null>(null)

// Tamanho inicial da janela. Alta o bastante pra caber cabeçalho, um bom
// pedaço de descrição e o botão sem rolar no caso comum; o resto rola.
const LARGURA = 400
const ALTURA = 460

// O SUPORTE SÓ PODE SER DECIDIDO DEPOIS DE MONTAR:
// `'documentPictureInPicture' in window` não existe no servidor, e renderizar
// o botão direto faria o HTML do servidor (sem botão) discordar do primeiro
// render do cliente (com botão) — erro de hidratação.
//
// `useSyncExternalStore` em vez de `useState` + `useEffect`: é a API que o
// React tem pra ler valor EXTERNO e não-reativo com resposta própria no
// servidor. O snapshot do servidor é `false`, o do cliente é a verdade, e o
// React re-renderiza sozinho depois da hidratação — sem `setState` dentro de
// efeito, que o lint do compilador recusa (`react-hooks/set-state-in-effect`)
// justamente por causar o render em cascata que este arquivo faria.
//
// Fora do componente pra as três funções serem estáveis entre renders: um
// `subscribe` novo a cada render reinscreve a store a cada render.
const SEM_INSCRICAO = () => () => {}
const temPipNoCliente = () => 'documentPictureInPicture' in window
const semPipNoServidor = () => false

// -----------------------------------------------------------------
// Provider
// -----------------------------------------------------------------

export function PipTarefaProvider({
  tarefas,
  diarias,
  children,
}: {
  /** Pendentes E concluídas: dá pra fixar uma já feita, só pra ler. */
  tarefas: TarefaComContexto[]
  diarias: DiariaComContexto[]
  children: React.ReactNode
}) {
  const suportado = useSyncExternalStore(
    SEM_INSCRICAO,
    temPipNoCliente,
    semPipNoServidor,
  )
  const [fixada, setFixada] = useState<Fixada | null>(null)
  const [janela, setJanela] = useState<Window | null>(null)
  // A JANELA VIVE NOS DOIS, e cada um tem um papel:
  //   - o STATE dispara o render do portal, e é só LIDO;
  //   - o REF é por onde ela é ESCRITA e fechada.
  // A separação não é gosto: janela é sistema externo mutável, e mexer nela
  // pelo valor vindo de `useState` é o que o `react-hooks/immutability`
  // recusa. O ref também é o que faz o fechamento no unmount sobreviver ao
  // StrictMode — ver logo abaixo.
  const janelaRef = useRef<Window | null>(null)

  // FECHA A JANELA AO SAIR DA TELA. Sem isto ela sobrevive à navegação,
  // apontando pra uma árvore React que não existe mais.
  //
  // ⚠️ Pelo REF e com lista vazia, nunca `[janela]`: o StrictMode (padrão no
  // Next) monta → desmonta → monta em dev, e um cleanup dependente da janela
  // fecharia a janela recém-aberta. Neste formato o cleanup falso roda com o
  // ref ainda em `null` e não faz nada.
  useEffect(() => () => janelaRef.current?.close(), [])

  // O item de AGORA. Some da lista (excluído, ou a diária deixou de valer
  // hoje) ⇒ `null`, e o efeito logo abaixo fecha a janela.
  const alvo = useMemo<Alvo | null>(() => {
    if (!fixada) return null
    if (fixada.tipo === 'tarefa') {
      const t = tarefas.find((x) => x.id === fixada.id)
      return t ? { tipo: 'tarefa', tarefa: t } : null
    }
    const d = diarias.find((x) => x.id === fixada.id)
    return d ? { tipo: 'diaria', diaria: d } : null
  }, [fixada, tarefas, diarias])

  const fechar = useCallback(() => {
    janelaRef.current?.close()
    janelaRef.current = null
    setJanela(null)
    setFixada(null)
  }, [])

  // ITEM SUMIU DA LISTA (excluído noutra aba) ⇒ a janela fecha. Só o
  // `close()` mora aqui: quem limpa o estado é o `pagehide` que o próprio
  // fechamento dispara. É a forma que o React pede — o efeito fala com o
  // sistema externo, e a volta vem por callback dele, não por um `setState`
  // solto no corpo do efeito.
  useEffect(() => {
    if (fixada !== null && alvo === null) janelaRef.current?.close()
  }, [fixada, alvo])

  const abrir = useCallback(async (nova: Fixada) => {
    const api = window.documentPictureInPicture
    if (!api) return
    try {
      // `requestWindow` PRIMEIRO, sem nenhum `await` antes dela: a permissão
      // vem do gesto do usuário, e qualquer espera anterior gasta o gesto —
      // a chamada passa a ser recusada.
      const w = await api.requestWindow({ width: LARGURA, height: ALTURA })
      prepararJanela(w)
      // O usuário pode fechar pelo X da janela. Sem escutar isso, o estado
      // continuaria achando que ela está aberta e o botão ficaria aceso
      // apontando pra uma janela que não existe.
      w.addEventListener('pagehide', () => {
        janelaRef.current = null
        setJanela(null)
        setFixada(null)
      })
      janelaRef.current = w
      setJanela(w)
      setFixada(nova)
    } catch {
      // Recusada pelo navegador (ou já fechando). Nada de aviso: é o mesmo
      // silêncio da ausência de suporte — o botão simplesmente não fez efeito.
      setFixada(null)
    }
  }, [])

  const alternar = useCallback(
    (tipo: TipoFixavel, id: string) => {
      // O botão da que já está fixada desafixa.
      if (fixada?.tipo === tipo && fixada.id === id) {
        fechar()
        return
      }
      // Com a janela aberta, só TROCA o conteúdo — ver o cabeçalho.
      if (janelaRef.current) {
        setFixada({ tipo, id })
        return
      }
      void abrir({ tipo, id })
    },
    [fixada, fechar, abrir],
  )

  // TEMA (e a fonte junto). O next-themes escreve a classe `dark` e o
  // `color-scheme` no <html> do documento principal; a janela nasce sem nada
  // disso. Copiar o `className` INTEIRO leva de carona o
  // `--font-geist-mono`, o `h-full` e o `antialiased` que o RootLayout põe
  // ali — um copiar só resolve tema e tipografia.
  //
  // MutationObserver em vez de `useTheme()`: um mecanismo só pega a troca
  // manual do tema E a mudança de tema do sistema, sem depender de detalhe
  // interno do next-themes.
  //
  // ⚠️ A janela é ESCRITA pelo ref, e só LIDA pelo state. Uma janela é
  // sistema externo mutável, e mexer nela pelo valor que veio de `useState`
  // é o que o `react-hooks/immutability` recusa — com razão: state do React
  // é pra ser tratado como imutável. O state aqui serve só pra disparar o
  // render do portal; quem manda no DOM da janela é o ref.
  useEffect(() => {
    const w = janelaRef.current
    if (!w) return
    const raiz = document.documentElement
    const alvoRaiz = w.document.documentElement
    const sincronizar = () => {
      alvoRaiz.className = raiz.className
      alvoRaiz.style.colorScheme = raiz.style.colorScheme
    }
    sincronizar()
    const obs = new MutationObserver(sincronizar)
    obs.observe(raiz, { attributes: true, attributeFilter: ['class', 'style'] })
    return () => obs.disconnect()
  }, [janela])

  // O título da janelinha é o da tarefa: na barra do sistema operacional é o
  // único texto visível quando ela está minimizada.
  useEffect(() => {
    const w = janelaRef.current
    if (!w || !alvo) return
    w.document.title =
      alvo.tipo === 'tarefa' ? alvo.tarefa.titulo : alvo.diaria.titulo
  }, [janela, alvo])

  const valor = useMemo<Contexto>(
    () => ({ suportado, fixada, alternar }),
    [suportado, fixada, alternar],
  )

  return (
    <PipContexto.Provider value={valor}>
      {children}
      {/* MESMA ÁRVORE REACT, outro documento: é isto que faz a janela se
          atualizar sozinha quando a lista recarrega, sem nenhum estado
          duplicado do lado de lá. */}
      {janela !== null &&
        alvo !== null &&
        createPortal(
          <ConteudoPip alvo={alvo} aoFechar={fechar} />,
          janela.document.body,
        )}
    </PipContexto.Provider>
  )
}

// -----------------------------------------------------------------
// Preparar a janela recém-aberta
// -----------------------------------------------------------------

// A janela nasce SEM ESTILO NENHUM: nem folha, nem classe, nem fundo.
function prepararJanela(w: Window) {
  const doc = w.document

  // ⚠️ NADA DE `cloneNode` NOS <link>. O clone copia o ATRIBUTO `href`, que é
  // relativo à raiz ("/_next/static/css/…"), e o documento desta janela é
  // `about:blank` — resolvido contra isso, o arquivo não existe e a janela sai
  // sem CSS. Lendo a PROPRIEDADE `.href` (sempre absoluta) e montando um
  // <link> novo, não sobra base URL pra dar errado.
  //
  // Os dois tipos precisam estar cobertos: em dev o Next injeta <style>, em
  // produção serve <link>. Cobrir só um funciona no `npm run dev` e falha
  // depois do deploy — que é o pior jeito de descobrir.
  for (const no of document.querySelectorAll('style, link[rel="stylesheet"]')) {
    if (no instanceof HTMLLinkElement) {
      const link = doc.createElement('link')
      link.rel = 'stylesheet'
      link.href = no.href
      doc.head.appendChild(link)
    } else {
      const estilo = doc.createElement('style')
      estilo.textContent = no.textContent
      doc.head.appendChild(estilo)
    }
  }

  // `h-full` porque o corpo do conteúdo rola sozinho (`overflow-y-auto`): sem
  // a corrente de altura vinda do <html>, o `flex-1` não tem contra o que
  // medir e a descrição longa estoura a janela em vez de rolar dentro dela.
  doc.body.className = 'bg-background text-foreground h-full'

  // O <link> carrega ASSÍNCRONO, então há um instante sem CSS. Pintar o fundo
  // certo já de cara evita o flash branco — feio no claro, agressivo no
  // escuro. A cor definitiva entra junto com a folha.
  doc.documentElement.style.background =
    getComputedStyle(document.body).backgroundColor
}

// -----------------------------------------------------------------
// O botão de fixar (usado pelas duas linhas)
// -----------------------------------------------------------------

export function BotaoFixarTarefa({
  tipo,
  id,
  titulo,
}: {
  tipo: TipoFixavel
  id: string
  titulo: string
}) {
  const ctx = useContext(PipContexto)
  // SEM SUPORTE, SEM BOTÃO — e sem aviso nenhum. Um botão que abre um popup
  // de consolação explicando que não dá é pior do que não ter botão.
  if (!ctx?.suportado) return null

  const ativa = ctx.fixada?.tipo === tipo && ctx.fixada.id === id

  return (
    <Button
      size="icon-sm"
      variant="ghost"
      aria-pressed={ativa}
      aria-label={ativa ? `Desafixar ${titulo}` : `Fixar ${titulo} na tela`}
      title={ativa ? 'Desafixar' : 'Fixar na tela'}
      onClick={() => ctx.alternar(tipo, id)}
      className={cn(ativa && 'bg-muted text-primary')}
    >
      <PictureInPicture2 />
    </Button>
  )
}

// -----------------------------------------------------------------
// O conteúdo da janela
// -----------------------------------------------------------------

// "12/09/2026" — ano inteiro, ao contrário do "12/09/26" da lista. A janela é
// pequena e fica longe dos olhos, no meio de outra tela; aqui não sobra
// contexto pra completar um ano abreviado de cabeça.
function dataLonga(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

function ConteudoPip({
  alvo,
  aoFechar,
}: {
  alvo: Alvo
  aoFechar: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  const feita =
    alvo.tipo === 'tarefa'
      ? alvo.tarefa.concluidaEm !== null
      : alvo.diaria.feitaHoje

  const descricao =
    alvo.tipo === 'tarefa' ? alvo.tarefa.descricao : alvo.diaria.descricao

  function concluir() {
    setErro(null)
    startTransition(async () => {
      const r =
        alvo.tipo === 'tarefa'
          ? await concluirTarefaAction(alvo.tarefa.id)
          : await concluirDiariaAction(alvo.diaria.id)

      if (!r.success) {
        // O ERRO FICA AQUI DENTRO, e não num toast.
        //
        // O <Toaster> do sonner vive no documento PRINCIPAL, que a esta
        // altura está atrás do Mercado Livre — é justamente pra isso que a
        // janelinha existe. Um toast de erro apareceria numa tela que ninguém
        // está olhando, e como no erro a janela CONTINUA ABERTA, o efeito
        // prático seria um clique que parece não ter feito nada.
        setErro(r.error)
        return
      }
      // No SUCESSO o toast serve: a janela fecha e o aviso espera na tela
      // principal pra quando a pessoa voltar.
      toast.success(r.message ?? 'Pronto')
      aoFechar()
      router.refresh()
    })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b px-4 py-3">
        {alvo.tipo === 'tarefa' ? (
          <CabecalhoTarefa tarefa={alvo.tarefa} />
        ) : (
          <CabecalhoDiaria diaria={alvo.diaria} />
        )}
      </div>

      {/* A DESCRIÇÃO INTEIRA, rolando aqui dentro. `text-sm` contra o
          `text-xs` da lista: a janela é lida de longe, por cima de outra
          tela. Texto de instrução cortado é o oposto do objetivo. */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {descricao ? (
          <p className="text-sm leading-relaxed whitespace-pre-line">
            {descricao}
          </p>
        ) : (
          <p className="text-muted-foreground text-sm italic">
            Sem descrição.
          </p>
        )}
      </div>

      <div className="space-y-2 border-t px-4 py-3">
        {erro && (
          <p className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-xs font-medium">
            {erro}
          </p>
        )}
        {feita ? (
          <p className="text-muted-foreground text-center text-xs">
            {alvo.tipo === 'tarefa'
              ? `concluída por ${alvo.tarefa.concluidaPorNome ?? '—'} em ${format(
                  new Date(alvo.tarefa.concluidaEm!),
                  "dd/MM/yyyy 'às' HH:mm",
                  { locale: ptBR },
                )}`
              : `feita por ${alvo.diaria.concluidaPorNome ?? '—'} às ${horaEmBrasilia(
                  new Date(alvo.diaria.concluidaEm!),
                )}`}
          </p>
        ) : (
          <Button
            size="lg"
            className="h-11 w-full"
            loading={isPending}
            disabled={isPending}
            onClick={concluir}
          >
            {!isPending && <Check />}
            {alvo.tipo === 'tarefa' ? 'Concluir tarefa' : 'Feita hoje'}
          </Button>
        )}
      </div>
    </div>
  )
}

function CabecalhoTarefa({ tarefa: t }: { tarefa: TarefaComContexto }) {
  const vencida = t.concluidaEm === null && estaVencida(t.prazo)

  return (
    <>
      <h1 className="text-base leading-snug font-semibold">{t.titulo}</h1>

      {(ehDestaque(t.prioridadeEfetiva) || t.contaNome) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {ehDestaque(t.prioridadeEfetiva) && (
            <Badge
              className={cn(
                'h-6 px-2.5 text-[13px]',
                PRIORIDADE_BADGE[t.prioridadeEfetiva],
              )}
            >
              {t.escalou && <CalendarClock />}
              {PRIORIDADE_LABEL[t.prioridadeEfetiva]}
            </Badge>
          )}
          {t.contaNome && (
            <Badge variant="secondary" className="h-6 px-2.5 text-[13px]">
              {t.contaNome}
            </Badge>
          )}
        </div>
      )}

      {/* NA LISTA ISSO É UM `title=""`, e aqui vira texto. Ninguém passa o
          mouse numa janelinha de 400px posta por cima de outro trabalho — e
          sem a frase a janela parece afirmar que alguém marcou "Urgente"
          numa tarefa que ninguém tocou. */}
      {t.escalou && (
        <p className="text-muted-foreground text-xs">
          Subiu sozinha pelo prazo — marcada como{' '}
          {PRIORIDADE_LABEL[t.prioridade]}.
        </p>
      )}

      {t.prazo && (
        <p
          className={cn(
            'flex items-center gap-1.5 text-xs tabular-nums',
            vencida ? 'text-destructive font-medium' : 'text-muted-foreground',
          )}
        >
          {vencida ? (
            <TriangleAlert className="size-3.5" />
          ) : (
            <CalendarClock className="size-3.5" />
          )}
          {vencida ? 'venceu em ' : 'até '}
          {dataLonga(t.prazo)}
        </p>
      )}
    </>
  )
}

function CabecalhoDiaria({ diaria: d }: { diaria: DiariaComContexto }) {
  return (
    <>
      <h1 className="text-base leading-snug font-semibold">{d.titulo}</h1>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary" className="h-6 px-2.5 text-[13px]">
          <Repeat />
          {resumoDeDias(d.diasSemana)}
        </Badge>
      </div>
    </>
  )
}
