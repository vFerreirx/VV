'use client'

// QUEM ESTÁ NO TABLET — a trava por inatividade e a troca de operador.
//
// Os dois vivem no mesmo arquivo porque são a mesma ideia vista de dois
// lados: o tablet é compartilhado, e o registro tem que sair no nome de quem
// fez. O PIN torna provar quem é barato; a trava lembra de provar. Separados,
// cada um resolve metade e a metade que falta é a que estraga o dado.

import { Delete, LockKeyhole, UserRound } from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react'
import { toast } from 'sonner'

import {
  confirmarMeuPinAction,
  definirMeuPinAction,
  listarOperadoresParaTroca,
  logoutAction,
  trocarOperadorAction,
  type OperadorParaTroca,
} from '@/app/(auth)/login/actions'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { TeclaNumerica } from '@/components/ui/tecla-numerica'
import {
  COOKIE_ATIVIDADE,
  horaNoServidor,
  LIMITE_MS,
  offsetDoRelogio,
} from '@/lib/auth/inatividade'
import { cn } from '@/lib/utils'

// -----------------------------------------------------------------
// A trava do tablet
// -----------------------------------------------------------------
//
// Depois de 30 minutos sem toque o tablet TRAVA — não desloga. A grade segue
// visível e atualizando, Fila e Terminadas abrem, e tocar numa ação que grava
// pergunta "Quem é você?". A regra inteira, e por que o servidor é quem manda,
// está em src/lib/auth/inatividade.ts.
//
// ⚠️ SÓ TOQUE CONTA COMO PRESENÇA. `pointerdown` e `keydown`, e nada mais —
// nem timer, nem render, nem request. A tela escuta realtime, então uma OP
// que o COLEGA move dispara `router.refresh()` aqui; se isso contasse, o
// tablet de quem já foi embora ficaria vivo pelo trabalho de outra pessoa.
//
// ⚠️ TRAVADO, O TOQUE NÃO RENOVA NADA. Esta é a metade do cliente da regra:
// sem ela, rolar a grade reescreveria o cookie de atividade e destravaria o
// servidor sem PIN. E o toque que acorda o tablet depois do limite TRAVA em
// vez de renovar — é o caso do tablet que dormiu com a página aberta, ou da
// aba que voltou do bfcache, em que o timer não correu.
//
// ⚠️ TUDO EM HORÁRIO DE SERVIDOR. O cookie é gravado e a decisão de travar é
// tomada em `horaNoServidor(...)`, com o offset calculado do horário que veio
// com a página. Um tablet com relógio errado sem isto travaria a cada toque
// (atrasado) ou nunca (adiantado).
//
// SEM CONTAGEM REGRESSIVA. A faixa vermelha "Saindo em Xs" existia pra ninguém
// perder o que tinha digitado num logout. Travar não apaga nada — o rascunho
// do concluir continua no localStorage —, então ela avisava de um prazo que
// não existe mais. E faixa fixa no lugar dela ocuparia, o dia inteiro, a
// altura calibrada pra caber nove máquinas: 30 minutos sem toque é o normal
// numa estação. A trava aparece no CABEÇALHO, que já é sticky: o nome ganha
// "(travado)" e "Trocar operador" vira "Destravar".

type Trava = {
  travado: boolean
  /**
   * Roda `continuar` com a identidade garantida: destravado, na hora;
   * travado, depois do "Quem é você?".
   */
  exigirIdentidade: (continuar: () => void) => void
  /**
   * O SERVIDOR recusou com a frase da trava antes de a tela perceber — os
   * segundos entre o cookie e o timer daqui. Trava a tela e pergunta.
   */
  travarEPerguntar: (continuar: () => void) => void
  /** Abre o "Quem é você?" sem ação pendente (o botão "Destravar"). */
  destravar: () => void
  /** O `Date.now()` no relógio do servidor. Função estável. */
  agoraNoServidor: () => number
}

const TravaContext = createContext<Trava | null>(null)

export function useTravaDoTablet(): Trava {
  const trava = useContext(TravaContext)
  if (!trava) {
    throw new Error('useTravaDoTablet fora do <TravaDoTablet>')
  }
  return trava
}

// Reescrever o cookie a cada toque seria escrita à toa; de 30 em 30 segundos
// basta, porque a janela é de 30 minutos.
const INTERVALO_DE_GRAVACAO_MS = 30_000

export function TravaDoTablet({
  horaDoServidor,
  travadoNoServidor,
  operadorAtualId,
  children,
}: {
  /** `Date.now()` do servidor quando a página foi montada. */
  horaDoServidor: number
  /** O servidor já considera esta sessão travada (cookie ou atividade vencida). */
  travadoNoServidor: boolean
  operadorAtualId: string
  children: ReactNode
}) {
  const router = useRouter()
  const [travado, setTravado] = useState(travadoNoServidor)
  const [perguntando, setPerguntando] = useState(false)
  const [pendente, setPendente] = useState<(() => void) | null>(null)

  // O servidor passou a achar travado (a página recarregou depois do limite,
  // ou o proxy marcou numa request de realtime): a tela acompanha. Ajuste de
  // estado DURANTE o render, e não num efeito — é o padrão do React pra estado
  // que segue prop, e setState dentro de efeito é cascata que o lint recusa.
  const [servidorVisto, setServidorVisto] = useState(travadoNoServidor)
  if (travadoNoServidor !== servidorVisto) {
    setServidorVisto(travadoNoServidor)
    if (travadoNoServidor) setTravado(true)
  }

  const offset = useRef(0)
  const ultimoToque = useRef(0)
  const gravadoEm = useRef(0)

  // Recalculado a cada horário novo que chega com a página (cada
  // `router.refresh()` traz um): se alguém acertar o relógio do tablet no
  // meio do turno, o offset acompanha.
  useEffect(() => {
    offset.current = offsetDoRelogio(horaDoServidor, Date.now())
  }, [horaDoServidor])

  const agoraNoServidor = useCallback(
    () => horaNoServidor(Date.now(), offset.current),
    [],
  )

  useEffect(() => {
    // TRAVADO NÃO ESCUTA: nem renova o cookie, nem conta tempo. Quem sai
    // daqui é o PIN (`aoConfirmar`).
    if (travado) return

    function gravar(t: number) {
      gravadoEm.current = t
      document.cookie = `${COOKIE_ATIVIDADE}=${t}; path=/; SameSite=Lax; max-age=86400`
    }

    function marcar() {
      const t = agoraNoServidor()
      // O TOQUE QUE ACORDA DEPOIS DO LIMITE TRAVA. O timer não corre com o
      // tablet dormindo; é este toque que descobre que o tempo passou.
      if (ultimoToque.current !== 0 && t - ultimoToque.current > LIMITE_MS) {
        setTravado(true)
        return
      }
      ultimoToque.current = t
      if (t - gravadoEm.current > INTERVALO_DE_GRAVACAO_MS) gravar(t)
    }

    window.addEventListener('pointerdown', marcar)
    window.addEventListener('keydown', marcar)
    // Ao montar (ou logo depois do PIN) conta como toque. Travado no servidor
    // nunca chega aqui: o estado inicial já veio travado.
    marcar()

    const t = setInterval(() => {
      // Guarda: sem toque registrado, NÃO trava. O padrão em caso de dúvida é
      // sempre deixar trabalhando — ver src/lib/auth/inatividade.ts.
      if (ultimoToque.current === 0) return
      if (agoraNoServidor() - ultimoToque.current > LIMITE_MS) setTravado(true)
    }, 5_000)

    return () => {
      window.removeEventListener('pointerdown', marcar)
      window.removeEventListener('keydown', marcar)
      clearInterval(t)
    }
  }, [travado, agoraNoServidor])

  const exigirIdentidade = useCallback(
    (continuar: () => void) => {
      if (!travado) {
        continuar()
        return
      }
      setPendente(() => continuar)
      setPerguntando(true)
    },
    [travado],
  )

  const travarEPerguntar = useCallback((continuar: () => void) => {
    setTravado(true)
    setPendente(() => continuar)
    setPerguntando(true)
  }, [])

  const destravar = useCallback(() => {
    setPendente(null)
    setPerguntando(true)
  }, [])

  function aoConfirmar() {
    // O PIN (ou a troca) já apagou a trava e gravou a atividade no servidor.
    // O relógio daqui recomeça junto — senão o primeiro toque ainda veria o
    // último toque de antes da trava e travaria de novo.
    const t = agoraNoServidor()
    ultimoToque.current = t
    gravadoEm.current = t
    setTravado(false)
    setPerguntando(false)
    const acao = pendente
    setPendente(null)
    router.refresh()
    // A AÇÃO TOCADA SEGUE. Ela abre o diálogo dela, ou regrava o que o
    // servidor recusou — já com a sessão de quem confirmou.
    acao?.()
  }

  return (
    <TravaContext.Provider
      value={{
        travado,
        exigirIdentidade,
        travarEPerguntar,
        destravar,
        agoraNoServidor,
      }}
    >
      {children}
      {perguntando && (
        <TrocaDialog
          modo="identidade"
          operadorAtualId={operadorAtualId}
          onConfirmado={aoConfirmar}
          onClose={() => {
            setPerguntando(false)
            setPendente(null)
          }}
        />
      )}
    </TravaContext.Provider>
  )
}

// -----------------------------------------------------------------
// Trocar operador / Destravar
// -----------------------------------------------------------------

// O MESMO LUGAR DO CABEÇALHO, E UMA DE DUAS COISAS. Destravado, é a troca de
// turno de sempre; travado, é a porta de entrada — e trocar de operador com o
// tablet travado já é, por definição, destravar.
export function TrocarOperadorBotao({ temPin }: { temPin: boolean }) {
  const { travado, destravar } = useTravaDoTablet()
  const [aberto, setAberto] = useState(false)
  const [criandoPin, setCriandoPin] = useState(false)

  if (travado) {
    return (
      <Button className="h-11 text-base" onClick={destravar}>
        <LockKeyhole className="size-5" />
        Destravar
      </Button>
    )
  }

  return (
    <>
      <Button
        variant="outline"
        className="h-11 text-base"
        onClick={() => setAberto(true)}
      >
        <UserRound className="size-5" />
        Trocar operador
      </Button>

      {aberto && (
        <TrocaDialog
          modo="troca"
          onClose={() => setAberto(false)}
          onCriarPin={() => {
            setAberto(false)
            setCriandoPin(true)
          }}
          euTenhoPin={temPin}
        />
      )}
      {criandoPin && <CriarPinDialog onClose={() => setCriandoPin(false)} />}
    </>
  )
}

// DOIS MODOS, UMA LISTA.
//
//   troca       — "Quem vai assumir?". Escolher alguém troca a sessão e
//                 recarrega a tela, como sempre foi.
//   identidade  — "Quem é você?", com o tablet travado. Escolher o PRÓPRIO nome
//                 só confirma o PIN e destrava; escolher outra pessoa troca a
//                 sessão SEM recarregar, pra ação tocada seguir. "Criar meu
//                 PIN" some: com o tablet travado, quem está tocando não é
//                 necessariamente o dono da conta.
//
// ⚠️ A LISTA É A MESMA, e as condições também: só operadores da estação de
// quem está logado, e só com sessão de operador ativa
// (src/app/(auth)/login/actions.ts). O modo muda a pergunta, não a porta.
function TrocaDialog(
  props:
    | {
        modo: 'troca'
        onClose: () => void
        onCriarPin: () => void
        euTenhoPin: boolean
      }
    | {
        modo: 'identidade'
        operadorAtualId: string
        onConfirmado: () => void
        onClose: () => void
      },
) {
  const { onClose } = props
  const identidade = props.modo === 'identidade'
  const [operadores, setOperadores] = useState<OperadorParaTroca[] | null>(null)
  const [escolhido, setEscolhido] = useState<OperadorParaTroca | null>(null)

  useEffect(() => {
    let vivo = true
    listarOperadoresParaTroca().then((r) => vivo && setOperadores(r))
    return () => {
      vivo = false
    }
  }, [])

  if (escolhido) {
    return (
      <PinDialog
        operador={escolhido}
        onVoltar={() => setEscolhido(null)}
        onClose={onClose}
        confirmacao={
          identidade
            ? {
                ehQuemEstaLogado: escolhido.id === props.operadorAtualId,
                onConfirmado: props.onConfirmado,
              }
            : null
        }
      />
    )
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            {identidade ? 'Quem é você?' : 'Quem vai assumir?'}
          </DialogTitle>
          <DialogDescription className="text-base">
            {identidade
              ? 'O tablet travou depois de 30 minutos parado. Toque no seu nome e digite o PIN.'
              : 'Operadores desta estação. O registro sai no nome de quem está logado — por isso a troca.'}
          </DialogDescription>
        </DialogHeader>

        {operadores === null && (
          <p className="text-muted-foreground py-8 text-center text-lg">
            Carregando…
          </p>
        )}

        {operadores && (
          <div className="max-h-[45vh] space-y-2 overflow-y-auto">
            {operadores.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setEscolhido(o)}
                className="hover:border-primary hover:bg-primary/5 focus-visible:ring-ring flex w-full items-center justify-between gap-3 rounded-xl border-2 p-4 text-left focus-visible:ring-2 focus-visible:outline-none"
              >
                <span className="text-xl font-semibold">{o.nome}</span>
                {/* SEM PIN NÃO É ERRO, É UM ESTADO. Ele entra pela senha,
                    como sempre entrou — e a tarja explica por que o caminho
                    curto não vale pra ele ainda. */}
                {!o.temPin && (
                  <span className="text-muted-foreground bg-muted rounded px-2 py-0.5 text-sm">
                    sem PIN — entra por senha
                  </span>
                )}
              </button>
            ))}
            {operadores.length === 0 && (
              <p className="text-muted-foreground py-8 text-center text-lg">
                Nenhum operador nesta estação.
              </p>
            )}
          </div>
        )}

        {/* O CAMINHO DE SAÍDA COMPLETO continua aqui. Se quem assume não é
            desta estação, esqueceu o PIN ou ainda não tem um, sair e entrar
            pela senha é sempre possível — o PIN encurta um caminho, não
            substitui. */}
        <Button
          variant="outline"
          className="h-14 text-lg"
          onClick={() => void logoutAction()}
        >
          Sair e entrar com senha
        </Button>

        {props.modo === 'troca' && !props.euTenhoPin && (
          <Button
            variant="secondary"
            className="h-14 text-lg"
            onClick={props.onCriarPin}
          >
            Criar meu PIN
          </Button>
        )}

        <Button variant="ghost" className="h-12" onClick={onClose}>
          Cancelar
        </Button>
      </DialogContent>
    </Dialog>
  )
}

// -----------------------------------------------------------------
// O teclado de PIN
// -----------------------------------------------------------------

function TecladoDePin({
  valor,
  onDigitar,
  onApagar,
  desabilitado,
}: {
  valor: string
  onDigitar: (d: string) => void
  onApagar: () => void
  desabilitado?: boolean
}) {
  return (
    <>
      {/* Quatro casas em bolinhas: mostra o progresso sem mostrar o número.
          Alguém sempre está atrás no chão de fábrica. */}
      <div className="flex justify-center gap-4 py-2">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              'size-5 rounded-full border-2',
              i < valor.length ? 'bg-primary border-primary' : 'border-muted',
            )}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <TeclaNumerica
            key={d}
            onClick={() => onDigitar(d)}
            disabled={desabilitado}
          >
            {d}
          </TeclaNumerica>
        ))}
        <span />
        <TeclaNumerica onClick={() => onDigitar('0')} disabled={desabilitado}>
          0
        </TeclaNumerica>
        <TeclaNumerica
          onClick={onApagar}
          disabled={desabilitado}
          aria-label="Apagar"
        >
          <Delete className="size-7" />
        </TeclaNumerica>
      </div>
    </>
  )
}

function PinDialog({
  operador,
  onVoltar,
  onClose,
  confirmacao,
}: {
  operador: OperadorParaTroca
  onVoltar: () => void
  onClose: () => void
  /**
   * Presente só no "Quem é você?". Sem ela, é a troca de sempre, que
   * redireciona sozinha.
   */
  confirmacao: { ehQuemEstaLogado: boolean; onConfirmado: () => void } | null
}) {
  const [isPending, startTransition] = useTransition()
  const [pin, setPin] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  function digitar(d: string) {
    if (pin.length >= 4 || isPending) return
    const novo = pin + d
    setErro(null)
    setPin(novo)
    // ENVIA SOZINHO NO QUARTO DÍGITO. Um botão "Entrar" depois de quatro
    // toques é um quinto toque que não decide nada.
    if (novo.length === 4) enviar(novo)
  }

  function enviar(valor: string) {
    startTransition(async () => {
      // TRÊS CAMINHOS, a mesma conferência de PIN no servidor:
      //   - é quem já está logado → só destrava, sem trocar a sessão;
      //   - é outra pessoa, com o tablet travado → troca SEM redirecionar, e
      //     a ação tocada segue;
      //   - é a troca de turno comum → troca e redireciona.
      const r = confirmacao
        ? confirmacao.ehQuemEstaLogado
          ? await confirmarMeuPinAction(valor)
          : await trocarOperadorAction(operador.id, valor, {
              seguirNaTela: true,
            })
        : await trocarOperadorAction(operador.id, valor)

      if (r && !r.success) {
        setErro(r.error)
        setPin('')
        return
      }
      // Sem confirmação, o sucesso já redirecionou e nem chega aqui.
      confirmacao?.onConfirmado()
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-2xl">{operador.nome}</DialogTitle>
          <DialogDescription className="text-base">
            {operador.temPin
              ? 'Digite o PIN de 4 números.'
              : 'Este operador ainda não criou um PIN — use "Sair e entrar com senha".'}
          </DialogDescription>
        </DialogHeader>

        {operador.temPin && (
          <TecladoDePin
            valor={pin}
            onDigitar={digitar}
            onApagar={() => {
              setErro(null)
              setPin((p) => p.slice(0, -1))
            }}
            desabilitado={isPending}
          />
        )}

        {erro && (
          <p
            role="alert"
            className="border-destructive/50 bg-destructive/10 text-destructive rounded-lg border-2 p-3 text-center text-lg font-medium"
          >
            {erro}
          </p>
        )}
        {isPending && (
          <p className="text-muted-foreground text-center text-base">
            Entrando…
          </p>
        )}

        <Button
          variant="ghost"
          className="h-12"
          onClick={onVoltar}
          disabled={isPending}
        >
          Voltar
        </Button>
      </DialogContent>
    </Dialog>
  )
}

// -----------------------------------------------------------------
// Criar o próprio PIN
// -----------------------------------------------------------------

// ⚠️ SÓ O PRÓPRIO. A action não aceita id de outra pessoa, e isso não é
// descuido de escopo: quem já está autenticado como ele mesmo não ganha
// privilégio nenhum criando um atalho pra própria conta. Criar o PIN de
// OUTRO seria criar uma chave pra porta alheia — e é por isso que, com o
// tablet travado, este diálogo nem é oferecido, e a action recusa.
function CriarPinDialog({ onClose }: { onClose: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [pin, setPin] = useState('')
  const [confirmacao, setConfirmacao] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const emConfirmacao = confirmacao !== null
  const atual = emConfirmacao ? confirmacao : pin

  function digitar(d: string) {
    if (atual.length >= 4 || isPending) return
    const novo = atual + d
    setErro(null)
    if (emConfirmacao) {
      setConfirmacao(novo)
      if (novo.length === 4) {
        // DIGITA DUAS VEZES. Um PIN errado no cadastro só aparece na próxima
        // troca de turno, quando quem precisa entrar não é quem cadastrou.
        if (novo !== pin) {
          setErro('Os dois PINs não bateram. Comece de novo.')
          setPin('')
          setConfirmacao(null)
          return
        }
        salvar(novo)
      }
      return
    }
    setPin(novo)
    if (novo.length === 4) setConfirmacao('')
  }

  function salvar(valor: string) {
    startTransition(async () => {
      const r = await definirMeuPinAction(valor)
      if (!r.success) {
        setErro(r.error)
        setPin('')
        setConfirmacao(null)
        return
      }
      toast.success('PIN criado. Use ele pra assumir o tablet.')
      onClose()
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            {emConfirmacao ? 'Digite de novo' : 'Crie seu PIN'}
          </DialogTitle>
          <DialogDescription className="text-base">
            {emConfirmacao
              ? 'Só pra confirmar que não errou.'
              : '4 números, só seus. É o que você vai digitar pra assumir o tablet.'}
          </DialogDescription>
        </DialogHeader>

        <TecladoDePin
          valor={atual}
          onDigitar={digitar}
          onApagar={() => {
            setErro(null)
            if (emConfirmacao) setConfirmacao((c) => (c ?? '').slice(0, -1))
            else setPin((p) => p.slice(0, -1))
          }}
          desabilitado={isPending}
        />

        {erro && (
          <p
            role="alert"
            className="border-destructive/50 bg-destructive/10 text-destructive rounded-lg border-2 p-3 text-center text-lg font-medium"
          >
            {erro}
          </p>
        )}

        <Button
          variant="ghost"
          className="h-12"
          onClick={onClose}
          disabled={isPending}
        >
          Agora não
        </Button>
      </DialogContent>
    </Dialog>
  )
}
