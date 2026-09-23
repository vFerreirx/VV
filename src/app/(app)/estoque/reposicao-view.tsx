'use client'

import { PackageSearch, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  chegouDoParceiroAction,
  descartarReposicaoAction,
  pedirAoParceiroAction,
  type ItemDeReposicao,
} from './actions'
import { MarcarPecasDialog } from './marcar-pecas-dialog'
import type { ProdutoComVariacoesParaForm } from '@/app/(app)/ordens/actions'
import { useDuracaoDesde } from '@/components/maquinas/use-duracao-desde'
import { NovaOpDialog } from '@/components/ordens/nova-op-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ColorSwatch } from '@/components/ui/color-swatch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import {
  DIAS_DE_ATENDIDOS,
  ESTADOS_ATIVOS_DE_REPOSICAO,
  ROTULO_DA_SITUACAO,
  acaoDaReposicao,
} from '@/lib/producao/reposicao'
import { tituloDaOp } from '@/lib/producao/rotulo-da-op'
import { cn } from '@/lib/utils'
import { STATUS_LABEL_CURTO } from '@/lib/validators/ordens'

type Aba = 'fila' | 'atendidos'

export function ReposicaoView({
  fila,
  atendidos,
  produtos,
  podeMarcar,
  podeProduzir,
  abaInicial,
}: {
  fila: ItemDeReposicao[]
  atendidos: ItemDeReposicao[]
  produtos: ProdutoComVariacoesParaForm[]
  podeMarcar: boolean
  podeProduzir: boolean
  abaInicial: Aba
}) {
  const [aba, setAba] = useState<Aba>(abaInicial)
  const [marcando, setMarcando] = useState(false)
  const [produzindo, setProduzindo] = useState<ItemDeReposicao | null>(null)
  const [descartando, setDescartando] = useState<ItemDeReposicao | null>(null)

  const lista = aba === 'fila' ? fila : atendidos

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="bg-muted inline-flex rounded-lg p-0.5 text-sm">
          {(
            [
              ['fila', `Fila (${fila.length})`],
              ['atendidos', `Atendidos (${atendidos.length})`],
            ] as const
          ).map(([valor, rotulo]) => (
            <button
              key={valor}
              type="button"
              onClick={() => setAba(valor)}
              aria-pressed={aba === valor}
              className={cn(
                'rounded-md px-3 py-1.5 transition-colors',
                aba === valor
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {rotulo}
            </button>
          ))}
        </div>
        {podeMarcar && (
          <Button onClick={() => setMarcando(true)}>
            <Plus />
            Marcar peças acabando
          </Button>
        )}
      </div>

      {lista.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title={
            aba === 'fila'
              ? 'Nenhuma peça na fila de reposição'
              : 'Nada atendido nos últimos 30 dias'
          }
          description={
            aba === 'fila'
              ? podeMarcar
                ? 'Quando uma peça estiver acabando, marque aqui pra ela virar OP.'
                : 'Quando alguém avisar que uma peça está acabando, ela aparece aqui.'
              : `Peças repostas nos últimos ${DIAS_DE_ATENDIDOS} dias aparecem aqui.`
          }
        />
      ) : (
        <ul className="space-y-2">
          {lista.map((item) => (
            <ItemDaFila
              key={item.id}
              item={item}
              podeProduzir={podeProduzir}
              onProduzir={() => setProduzindo(item)}
              onDescartar={() => setDescartando(item)}
            />
          ))}
        </ul>
      )}

      {marcando && (
        <MarcarPecasDialog
          produtos={produtos}
          fila={fila}
          onClose={() => setMarcando(false)}
        />
      )}
      {produzindo && (
        <NovaOpDialog
          produtos={produtos}
          reposicao={{ id: produzindo.id, variacaoId: produzindo.variacaoId }}
          onClose={() => setProduzindo(null)}
        />
      )}
      <DescartarDialog
        item={descartando}
        onClose={() => setDescartando(null)}
      />
    </div>
  )
}

// O mesmo título do cartão, do tablet e da Nova OP (`tituloDaOp`).
function TituloDoItem({ item }: { item: ItemDeReposicao }) {
  const t = tituloDaOp(item.produtoNome, {
    cor: item.variacaoCor,
    modelo: item.variacaoModelo,
    tamanho: item.variacaoTamanho,
  })
  return (
    <span className="truncate">
      <span className="font-medium">{t.familia}</span>
      {t.variacao && <span className="text-muted-foreground"> · {t.variacao}</span>}
    </span>
  )
}

function HaQuanto({ desde }: { desde: Date | null }) {
  const texto = useDuracaoDesde(desde)
  return texto ? <>há {texto}</> : null
}

function ItemDaFila({
  item,
  podeProduzir,
  onProduzir,
  onDescartar,
}: {
  item: ItemDeReposicao
  podeProduzir: boolean
  onProduzir: () => void
  onDescartar: () => void
}) {
  const acabou = item.situacao === 'acabou'
  const emEspera = (ESTADOS_ATIVOS_DE_REPOSICAO as readonly string[]).includes(
    item.estado,
  )
  // Produto comprado de parceiro não vira OP: o botão é "Pedir ao parceiro".
  const acao = acaoDaReposicao(item.produtoOrigem)

  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  function passoDoParceiro(passo: 'pedir' | 'chegou') {
    startTransition(async () => {
      const r =
        passo === 'pedir'
          ? await pedirAoParceiroAction(item.id)
          : await chegouDoParceiroAction(item.id)
      if (!r.success) {
        toast.error(r.error)
        return
      }
      toast.success(r.message ?? 'Salvo')
      router.refresh()
    })
  }

  return (
    <li className="flex flex-wrap items-start gap-3 rounded-xl border p-3">
      <ColorSwatch hex={item.corHex} hex2={item.corHex2} tamanho="lg" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <TituloDoItem item={item} />
          {/* "Acabou" em vermelho, "Acabando" em âmbar — só enquanto espera. */}
          {emEspera && (
            <Badge
              className={cn(
                'shrink-0',
                acabou
                  ? 'bg-destructive/15 text-destructive'
                  : 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
              )}
            >
              {ROTULO_DA_SITUACAO[item.situacao]}
            </Badge>
          )}
          {item.foraDoCatalogo && (
            <Badge variant="secondary" className="shrink-0">
              fora do catálogo
            </Badge>
          )}
          {acao === 'pedir_parceiro' && (
            <Badge variant="outline" className="shrink-0 font-normal">
              parceiro
            </Badge>
          )}
        </div>
        {item.variacaoModelo && (
          <p className="text-muted-foreground text-xs">{item.variacaoModelo}</p>
        )}

        <p className="text-muted-foreground text-sm">
          Marcado por {item.marcadoPorNome ?? 'alguém'}{' '}
          <HaQuanto desde={item.marcadoEm} />
        </p>
        {item.observacao && <p className="text-sm">{item.observacao}</p>}

        {item.estado === 'em_producao' && item.opNumero && (
          <p className="text-sm font-medium tabular-nums">
            Em produção · {item.opNumero}
            {item.opStatus && (
              <span className="text-muted-foreground font-normal">
                {' · '}
                {STATUS_LABEL_CURTO[item.opStatus]}
              </span>
            )}
          </p>
        )}
        {item.estado === 'pedido_parceiro' && (
          <p className="text-sm font-medium">
            Pedido ao parceiro
            <span className="text-muted-foreground font-normal">
              {' · '}por {item.pedidoParceiroPorNome ?? 'alguém'}{' '}
              <HaQuanto desde={item.pedidoParceiroEm} />
            </span>
          </p>
        )}
        {item.estado === 'reposto' && (
          <p className="text-sm tabular-nums text-emerald-700 dark:text-emerald-400">
            Reposto <HaQuanto desde={item.repostoEm} />
            {item.opNumero
              ? ` · ${item.opNumero}`
              : item.pedidoParceiroEm && ' · chegou do parceiro'}
          </p>
        )}
        {item.estado === 'descartado' && (
          <p className="text-muted-foreground text-sm">
            Descartado por {item.descartadoPorNome ?? 'alguém'}{' '}
            <HaQuanto desde={item.descartadoEm} />
            {item.motivoDescarte && ` · ${item.motivoDescarte}`}
          </p>
        )}
      </div>

      {/* Descartado de antes de descartar passar a apagar: só dá pra apagar. */}
      {item.estado === 'descartado' && podeProduzir && (
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          onClick={onDescartar}
        >
          Apagar
        </Button>
      )}

      {item.estado === 'aberto' && podeProduzir && (
        <div className="flex shrink-0 gap-2">
          {acao === 'pedir_parceiro' ? (
            // Comprado de parceiro: não vira OP. Pede-se, e "Chegou" fecha
            // (src/lib/producao/reposicao.ts, `proximoEstadoDoParceiro`).
            <Button
              size="sm"
              onClick={() => passoDoParceiro('pedir')}
              loading={isPending}
              disabled={isPending || item.foraDoCatalogo}
            >
              Pedir ao parceiro
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={onProduzir}
              // Variação fora do catálogo não vira OP: `criarOrdemAction`
              // recusaria. Descartar resolve.
              disabled={item.foraDoCatalogo}
            >
              Produzir
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={onDescartar}
            disabled={isPending}
          >
            Descartar
          </Button>
        </div>
      )}

      {item.estado === 'pedido_parceiro' && podeProduzir && (
        <Button
          size="sm"
          className="shrink-0"
          onClick={() => passoDoParceiro('chegou')}
          loading={isPending}
          disabled={isPending}
        >
          Chegou
        </Button>
      )}
    </li>
  )
}

// Confirmação, porque apaga: o item some da fila e não vai pra "Atendidos".
function DescartarDialog({
  item,
  onClose,
}: {
  item: ItemDeReposicao | null
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  function fechar() {
    setErro(null)
    onClose()
  }

  function descartar() {
    if (!item) return
    startTransition(async () => {
      const r = await descartarReposicaoAction(item.id)
      if (!r.success) {
        setErro(r.error)
        return
      }
      toast.success(r.message ?? 'Item descartado')
      router.refresh()
      fechar()
    })
  }

  return (
    <Dialog open={item !== null} onOpenChange={(o) => !o && !isPending && fechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {item?.estado === 'descartado' ? 'Apagar de Atendidos?' : 'Descartar da fila?'}
          </DialogTitle>
          <DialogDescription>
            {item?.estado === 'descartado'
              ? 'O registro deste descarte é apagado.'
              : 'O item é apagado: sai da fila sem virar OP e não aparece em Atendidos. Use quando o aviso foi engano.'}
          </DialogDescription>
        </DialogHeader>
        {item && (
          <p className="text-sm">
            <TituloDoItem item={item} />
          </p>
        )}
        {erro && <p className="text-destructive text-sm">{erro}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={fechar} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            loading={isPending}
            onClick={descartar}
            disabled={isPending}
          >
            {item?.estado === 'descartado' ? 'Apagar' : 'Descartar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
