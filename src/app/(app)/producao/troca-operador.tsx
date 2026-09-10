'use client'

// QUEM ESTÁ NO TABLET — a troca de operador e o relógio de inatividade.
//
// Os dois vivem no mesmo arquivo porque são a mesma ideia vista de dois
// lados: o tablet é compartilhado, e o registro tem que sair no nome de quem
// fez. O PIN torna trocar barato; a inatividade lembra de trocar. Separados,
// cada um resolve metade e a metade que falta é a que estraga o dado.

import { Delete, UserRound } from 'lucide-react'
import { useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
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
  LIMITE_MS,
  MINUTOS_DE_INATIVIDADE,
  SEGUNDOS_DE_AVISO,
} from '@/lib/auth/inatividade'
import { cn } from '@/lib/utils'

// -----------------------------------------------------------------
// O relógio de inatividade
// -----------------------------------------------------------------

// ⚠️ SÓ TOQUE CONTA COMO PRESENÇA. `pointerdown` e `keydown`, e nada mais —
// nem timer, nem render, nem request. A tela escuta realtime, então uma OP
// que o COLEGA move dispara `router.refresh()` aqui; se isso contasse, o
// tablet de quem já foi embora ficaria vivo pelo trabalho de outra pessoa.
//
// O aviso aparece 60s antes e mostra o contador. Server Actions passam pelo
// proxy, então uma sessão que expira com o operador no diálogo de concluir e
// os números já digitados viraria redirect pro login com o preenchimento
// perdido — o aviso existe pra que isso não aconteça sem ele ver.
export function RelogioDeInatividade() {
  const [segundosRestantes, setSegundosRestantes] = useState<number | null>(
    null,
  )
  // Zero até o efeito rodar: `Date.now()` no corpo do render é impuro (o
  // React recusa) e, pior, um valor de render descartado poderia servir de
  // base pro contador. O efeito chama `marcar()` antes de ligar o intervalo.
  const ultimoToque = useRef(0)
  const gravadoEm = useRef(0)

  useEffect(() => {
    function marcar() {
      const agora = Date.now()
      ultimoToque.current = agora
      setSegundosRestantes(null)
      // O cookie é o que o proxy lê. Reescrever a cada toque seria escrita à
      // toa; de 30 em 30 segundos basta, porque a janela é de 30 minutos.
      if (agora - gravadoEm.current > 30_000) {
        gravadoEm.current = agora
        document.cookie = `${COOKIE_ATIVIDADE}=${agora}; path=/; SameSite=Lax; max-age=86400`
      }
    }
    window.addEventListener('pointerdown', marcar)
    window.addEventListener('keydown', marcar)
    marcar()

    const t = setInterval(() => {
      // Guarda: sem toque registrado ainda, NÃO derruba. O padrão em caso de
      // dúvida é sempre deixar trabalhando — ver src/lib/auth/inatividade.ts.
      if (ultimoToque.current === 0) return
      const parado = Date.now() - ultimoToque.current
      const faltam = Math.ceil((LIMITE_MS - parado) / 1000)
      if (faltam <= 0) {
        void logoutAction()
        return
      }
      setSegundosRestantes(faltam <= SEGUNDOS_DE_AVISO ? faltam : null)
    }, 1000)

    return () => {
      window.removeEventListener('pointerdown', marcar)
      window.removeEventListener('keydown', marcar)
      clearInterval(t)
    }
  }, [])

  if (segundosRestantes === null) return null

  return (
    // Faixa no rodapé, cobrindo a largura toda: o aviso não pode depender de
    // ele estar olhando pro topo da tela.
    <div className="bg-destructive text-destructive-foreground fixed inset-x-0 bottom-0 z-50 flex flex-wrap items-center justify-center gap-3 p-4 text-lg font-medium">
      <span>
        Saindo em {segundosRestantes}s por inatividade ({MINUTOS_DE_INATIVIDADE}{' '}
        min parado)
      </span>
      <Button
        variant="secondary"
        className="h-12 text-base"
        // O próprio toque no botão já zera o relógio pelo listener global.
        onClick={() => setSegundosRestantes(null)}
      >
        Continuar trabalhando
      </Button>
    </div>
  )
}

// -----------------------------------------------------------------
// Trocar operador
// -----------------------------------------------------------------

export function TrocarOperadorBotao({ temPin }: { temPin: boolean }) {
  const [aberto, setAberto] = useState(false)
  const [criandoPin, setCriandoPin] = useState(false)

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

function TrocaDialog({
  onClose,
  onCriarPin,
  euTenhoPin,
}: {
  onClose: () => void
  onCriarPin: () => void
  euTenhoPin: boolean
}) {
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
      />
    )
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl">Quem vai assumir?</DialogTitle>
          <DialogDescription className="text-base">
            Operadores desta estação. O registro sai no nome de quem está
            logado — por isso a troca.
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
                Nenhum outro operador nesta estação.
              </p>
            )}
          </div>
        )}

        {/* O CAMINHO DE SAÍDA COMPLETO continua aqui. Se quem assume não é
            desta estação, ou esqueceu o PIN, sair e entrar pela senha é
            sempre possível — o PIN encurta um caminho, não substitui. */}
        <Button
          variant="outline"
          className="h-14 text-lg"
          onClick={() => void logoutAction()}
        >
          Sair e entrar com senha
        </Button>

        {!euTenhoPin && (
          <Button
            variant="secondary"
            className="h-14 text-lg"
            onClick={onCriarPin}
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
}: {
  operador: OperadorParaTroca
  onVoltar: () => void
  onClose: () => void
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
      const r = await trocarOperadorAction(operador.id, valor)
      // Sucesso redireciona — só voltamos aqui com erro.
      if (r && !r.success) {
        setErro(r.error)
        setPin('')
      }
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
// OUTRO seria criar uma chave pra porta alheia.
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
