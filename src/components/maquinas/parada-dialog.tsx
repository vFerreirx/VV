'use client'

// REGISTRAR E ENCERRAR A PARADA — o mesmo diálogo na aba Máquinas (/fabrica)
// e no tablet da estação. Uma cópia em cada tela dava duas perguntas
// diferentes pro mesmo acontecimento, e o histórico recebia paradas
// registradas de dois jeitos.
//
// ⚠️ UM TOQUE PRA ABRIR, UM PRA ESCOLHER — e acabou. O motivo é lista e não
// campo de texto porque isto é operado de tablet, em pé, com a máquina
// parada esperando: digitar "quebrou a agulha" trinta vezes por semana é o
// tipo de atrito que faz o operador simplesmente não registrar, e um
// histórico com metade das paradas é pior que nenhum.
//
// "Outro" é a exceção e pede o texto, porque é o escape — e uma linha "Outro"
// sem explicação é a que ninguém consegue ler seis meses depois.
//
// O que muda entre as telas vem por prop, e só isso: QUAIS motivos (o
// operador não vê "preventiva" nem "sem operador"), a frase de abertura e o
// TAMANHO (no tablet, alvo e letra de quem está de pé).

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { trocarStatusAction } from '@/app/(app)/maquinas/actions'
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
import { Textarea } from '@/components/ui/textarea'
import { ERRO_TABLET_TRAVADO } from '@/lib/auth/inatividade'
import {
  MOTIVOS_DE_PARADA,
  exigeObservacao,
  rotuloDoMotivo,
  type MotivoDeParada,
  type ParadaAbertaResumo,
} from '@/lib/producao/parada-de-maquina'
import { cn } from '@/lib/utils'

export function ParadaDialog({
  maquina,
  modo,
  onClose,
  motivos = MOTIVOS_DE_PARADA,
  descricaoAoAbrir = 'Toque no motivo. A máquina fica marcada como parada até alguém liberar.',
  paradaAberta = null,
  variante = 'padrao',
  onTabletTravado,
}: {
  maquina: { id: string; codigo: string }
  modo: 'abrir' | 'fechar' | null
  onClose: () => void
  motivos?: readonly { valor: MotivoDeParada; rotulo: string }[]
  descricaoAoAbrir?: string
  /**
   * A parada que "Voltar a produzir" vai fechar. Mostrada inteira no
   * fechamento — é aqui que o texto de um "Outro", cortado na manchete do
   * cartão, aparece completo.
   */
  paradaAberta?: ParadaAbertaResumo | null
  variante?: 'padrao' | 'tablet'
  /**
   * O tablet travou com o diálogo aberto e o servidor recusou. Quem abriu o
   * diálogo pergunta "Quem é você?" e chama `tentarDeNovo` — o motivo e o
   * texto escolhidos não se perdem.
   */
  onTabletTravado?: (tentarDeNovo: () => void) => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [motivoOutro, setMotivoOutro] = useState(false)
  const [texto, setTexto] = useState('')
  const tablet = variante === 'tablet'

  function fechar() {
    setMotivoOutro(false)
    setTexto('')
    onClose()
  }

  function registrar(motivo?: MotivoDeParada) {
    const obs = texto.trim() === '' ? undefined : texto.trim()
    startTransition(async () => {
      marcarEco(maquina.id)
      const result = await trocarStatusAction(
        maquina.id,
        modo === 'abrir'
          ? { status: 'manutencao', motivo, observacaoAbertura: obs }
          : // 'operando' significa só APTA — não declara que está
            // produzindo. Quem diz isso é a OP.
            { status: 'operando', observacaoFechamento: obs },
      )
      if (!result.success) {
        if (result.error === ERRO_TABLET_TRAVADO && onTabletTravado) {
          onTabletTravado(() => registrar(motivo))
          return
        }
        toast.error(result.error)
        return
      }
      toast.success(modo === 'abrir' ? 'Parada registrada' : 'Máquina liberada')
      router.refresh()
      fechar()
    })
  }

  const abrindo = modo === 'abrir'

  return (
    <Dialog open={modo !== null} onOpenChange={(o) => !o && fechar()}>
      <DialogContent className={cn(tablet && 'sm:max-w-md')}>
        <DialogHeader>
          <DialogTitle className={cn(tablet && 'text-2xl')}>
            {abrindo
              ? `Por que a ${maquina.codigo} parou?`
              : `Liberar a ${maquina.codigo}`}
          </DialogTitle>
          <DialogDescription className={cn(tablet && 'text-base')}>
            {abrindo
              ? descricaoAoAbrir
              : 'A máquina volta a aceitar OP. A observação é opcional.'}
          </DialogDescription>
        </DialogHeader>

        {/* O QUE ESTÁ SENDO FECHADO. Sem isto, quem libera confirma às cegas
            — e é aqui que o "Outro" aparece por inteiro. */}
        {!abrindo && paradaAberta && paradaAberta.motivo !== null && (
          <div className="bg-muted/40 rounded-lg border p-3">
            <p className={cn('font-medium', tablet ? 'text-lg' : 'text-sm')}>
              {rotuloDoMotivo(paradaAberta.motivo)}
            </p>
            {paradaAberta.observacaoAbertura && (
              <p className={cn('mt-1', tablet ? 'text-lg' : 'text-sm')}>
                {paradaAberta.observacaoAbertura}
              </p>
            )}
          </div>
        )}

        {abrindo && !motivoOutro && (
          // Dois por linha, alvo grande: isto é tocado com o dedo, de pé.
          <div className="grid grid-cols-2 gap-2">
            {motivos.map((m) => (
              <Button
                key={m.valor}
                variant="outline"
                className={cn(
                  'h-auto whitespace-normal py-2',
                  tablet ? 'min-h-16 text-lg' : 'min-h-14',
                )}
                disabled={isPending}
                onClick={() =>
                  exigeObservacao(m.valor)
                    ? setMotivoOutro(true)
                    : registrar(m.valor)
                }
              >
                {m.rotulo}
              </Button>
            ))}
          </div>
        )}

        {(motivoOutro || !abrindo) && (
          <Textarea
            // Foco só quando o texto é OBRIGATÓRIO ("Outro"). No fechamento a
            // observação é opcional, e abrir o teclado do tablet por cima do
            // botão "Voltar a produzir" atrapalha quem só queria liberar.
            autoFocus={motivoOutro}
            rows={3}
            className={cn(tablet && 'text-lg')}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={
              abrindo ? 'O que aconteceu?' : 'O que foi feito? (opcional)'
            }
          />
        )}

        <DialogFooter>
          <Button
            variant="outline"
            className={cn(tablet && 'h-14 text-lg')}
            onClick={fechar}
            disabled={isPending}
          >
            Cancelar
          </Button>
          {motivoOutro && (
            <Button
              className={cn(tablet && 'h-14 text-lg')}
              loading={isPending}
              // O CHECK `maquina_paradas_outro_ck` recusaria no banco; o botão
              // desabilitado explica antes, em vez de virar "erro ao salvar".
              disabled={isPending || texto.trim() === ''}
              onClick={() => registrar('outro')}
            >
              Registrar parada
            </Button>
          )}
          {!abrindo && (
            <Button
              className={cn(tablet && 'h-14 text-lg')}
              loading={isPending}
              disabled={isPending}
              onClick={() => registrar()}
            >
              Voltar a produzir
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
