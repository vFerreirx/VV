'use client'

import { CalendarClock, Check, Trash2, TriangleAlert, Undo2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  desfazerRecebimentoAction,
  gerarParcelasAction,
  marcarRecebidaAction,
  removerParcelaAction,
  salvarParcelaAction,
  type Parcela,
} from '../parcelas-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { decimalParaMoeda, mascararMoeda, moedaParaDecimal } from '@/lib/moeda'
import type { FormaPagamento } from '@/lib/pagamento'
import {
  INTERVALO_PADRAO_DIAS,
  rotuloDaSituacao,
  situacaoDaParcela,
} from '@/lib/parcela-estado'
import { cn } from '@/lib/utils'

const reais = (centavos: number) =>
  (centavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })

/** '2026-09-11' → '11/09/2026'. Texto pra texto: a data nunca vira `Date`. */
const dataBR = (iso: string) =>
  `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

/** Hora da baixa, curta — o dia basta pra conferir "foi hoje mesmo?". */
const dataHoraBR = (d: Date) =>
  new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

/**
 * Os VENCIMENTOS deste pedido, e o lembrete de conferir se o dinheiro caiu.
 *
 * Irmão do PagamentoPainel e do FretePainel — mesma largura, mesmo peso
 * visual, `print:hidden`: é controle de tela, e o que vai pro cliente é o
 * documento lá em cima.
 *
 * ⚠️ APARECE COM BOLETO/CHEQUE, mas TAMBÉM sempre que já houver parcela
 * gravada, qualquer que seja a forma. Esconder dado que alguém digitou só
 * porque a forma mudou depois seria apagar trabalho da vista sem apagar do
 * banco — a pessoa procuraria o que sumiu.
 *
 * ⚠️ A SOMA PODE NÃO BATER COM O TOTAL, e a tela MOSTRA a diferença em vez de
 * bloquear: tem entrada, tem sinal, tem acerto de última hora. Travar o
 * cadastro obrigaria a mentir num dos dois números.
 */
export function ParcelasPainel({
  orcamentoId,
  parcelas,
  forma,
  totalFinal,
  sugestaoPrimeiroVencimento,
  podeEditar,
}: {
  orcamentoId: string
  parcelas: Parcela[]
  forma: FormaPagamento | null
  /** O que o cliente paga (mercadoria − desconto + frete), em reais. */
  totalFinal: number
  /** 'YYYY-MM-DD' — hoje + 30, calculado no servidor (fuso de Brasília). */
  sugestaoPrimeiroVencimento: string
  podeEditar: boolean
}) {
  const router = useRouter()
  const [agindo, startAcao] = useTransition()

  const pedeParcelas = forma === 'boleto' || forma === 'cheque'
  // Fora dos dois casos, o bloco some — MENOS se já houver parcela.
  if (!pedeParcelas && parcelas.length === 0) return null

  const totalCentavos = Math.round(totalFinal * 100)
  const somaCentavos = parcelas.reduce(
    (s, p) => s + Math.round(Number(p.valor) * 100),
    0,
  )
  const diferenca = totalCentavos - somaCentavos

  function rodar(fn: () => Promise<{ success: boolean; error?: string; message?: string }>) {
    startAcao(async () => {
      const r = await fn()
      if (!r.success) {
        toast.error(r.error ?? 'Não deu certo')
        return
      }
      toast.success(r.message ?? 'Pronto')
      router.refresh()
    })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 print:hidden">
      <div className="rounded-lg border p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <CalendarClock className="size-4" />
          Vencimentos
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          Quando cada parcela vence. É daqui que sai o lembrete no sino pra
          conferir se o dinheiro caiu — ele some sozinho quando você dá baixa.
        </p>

        {parcelas.length === 0 ? (
          /* O AVISO É O PRIMEIRO LEMBRETE, e ele mora na própria tela: forma
             de boleto/cheque sem vencimento nenhum é um pedido que ninguém
             vai lembrar de cobrar. O gerador fica ali do lado pra resolver
             sem sair da página. */
          <div className="mt-3 space-y-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
            <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
              <TriangleAlert className="mt-px size-3.5 shrink-0" />
              <span>
                Vencimentos não informados. Sem eles não há como lembrar de
                conferir o recebimento.
              </span>
            </div>
            {podeEditar && (
              <Gerador
                totalCentavos={totalCentavos}
                sugestao={sugestaoPrimeiroVencimento}
                desabilitado={agindo}
                onGerar={(e) =>
                  rodar(() => gerarParcelasAction(orcamentoId, e))
                }
              />
            )}
          </div>
        ) : (
          <>
            <ul className="mt-3 divide-y rounded-md border">
              {parcelas.map((p) => (
                <LinhaParcela
                  key={p.id}
                  parcela={p}
                  podeEditar={podeEditar}
                  desabilitado={agindo}
                  onSalvar={(d) =>
                    rodar(() => salvarParcelaAction(p.id, d))
                  }
                  onRemover={() => rodar(() => removerParcelaAction(p.id))}
                  onReceber={() => rodar(() => marcarRecebidaAction(p.id))}
                  onDesfazer={() =>
                    rodar(() => desfazerRecebimentoAction(p.id))
                  }
                />
              ))}
            </ul>

            <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs">
              <span className="text-muted-foreground tabular-nums">
                Soma das parcelas: {reais(somaCentavos)} · total do pedido:{' '}
                {reais(totalCentavos)}
              </span>
              {/* DIFERENÇA É AVISO, NÃO ERRO. Entrada, sinal e acerto fazem a
                  soma legitimamente não fechar. */}
              {diferenca !== 0 && (
                <span className="font-medium text-amber-700 dark:text-amber-300">
                  {diferenca > 0
                    ? `faltam ${reais(diferenca)} em parcelas`
                    : `${reais(-diferenca)} a mais que o total`}
                </span>
              )}
            </div>

            {podeEditar && (
              <details className="mt-3">
                <summary className="text-muted-foreground cursor-pointer text-xs">
                  Gerar de novo
                </summary>
                <div className="mt-2 rounded-md border p-3">
                  <p className="text-muted-foreground mb-2 text-xs">
                    Substitui todas as parcelas. Recusa se alguma já tiver sido
                    recebida.
                  </p>
                  <Gerador
                    totalCentavos={totalCentavos}
                    sugestao={sugestaoPrimeiroVencimento}
                    desabilitado={agindo}
                    onGerar={(e) =>
                      rodar(() => gerarParcelasAction(orcamentoId, e))
                    }
                  />
                </div>
              </details>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------
// O gerador
// -----------------------------------------------------------------

// Três campos e um botão: nº de parcelas, 1º vencimento e intervalo. A
// divisão do valor é do SERVIDOR (centavos inteiros, resto na primeira) —
// aqui só se mostra a prévia, pra ninguém gerar às cegas.
function Gerador({
  totalCentavos,
  sugestao,
  desabilitado,
  onGerar,
}: {
  totalCentavos: number
  sugestao: string
  desabilitado: boolean
  onGerar: (e: {
    quantidade: number
    primeiroVencimento: string
    intervaloDias: number
  }) => void
}) {
  const [quantidade, setQuantidade] = useState('1')
  const [primeiro, setPrimeiro] = useState(sugestao)
  const [intervalo, setIntervalo] = useState(String(INTERVALO_PADRAO_DIAS))

  const n = Math.max(1, Math.floor(Number(quantidade) || 0))
  // Mesma conta do servidor, só pra prévia. Se divergirem, o servidor manda.
  const base = Math.floor(totalCentavos / n)
  const resto = totalCentavos - base * n

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="parc-qtd">Parcelas</Label>
        <Input
          id="parc-qtd"
          inputMode="numeric"
          value={quantidade}
          onChange={(e) => setQuantidade(e.target.value.replace(/\D/g, ''))}
          disabled={desabilitado}
          className="h-9 w-20 text-right tabular-nums"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="parc-primeiro">1º vencimento</Label>
        <Input
          id="parc-primeiro"
          type="date"
          value={primeiro}
          onChange={(e) => setPrimeiro(e.target.value)}
          disabled={desabilitado}
          className="h-9 w-40"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="parc-intervalo">Intervalo (dias)</Label>
        <Input
          id="parc-intervalo"
          inputMode="numeric"
          value={intervalo}
          onChange={(e) => setIntervalo(e.target.value.replace(/\D/g, ''))}
          disabled={desabilitado}
          className="h-9 w-24 text-right tabular-nums"
        />
      </div>
      <Button
        onClick={() =>
          onGerar({
            quantidade: n,
            primeiroVencimento: primeiro,
            intervaloDias: Math.max(0, Math.floor(Number(intervalo) || 0)),
          })
        }
        loading={desabilitado}
        disabled={desabilitado || !primeiro}
      >
        Gerar
      </Button>
      {totalCentavos > 0 && (
        <p className="text-muted-foreground pb-2 text-xs tabular-nums">
          {n}× de {reais(base)}
          {resto > 0 && ` (a 1ª com ${reais(base + resto)})`}
        </p>
      )}
    </div>
  )
}

// -----------------------------------------------------------------
// A linha
// -----------------------------------------------------------------

function LinhaParcela({
  parcela: p,
  podeEditar,
  desabilitado,
  onSalvar,
  onRemover,
  onReceber,
  onDesfazer,
}: {
  parcela: Parcela
  podeEditar: boolean
  desabilitado: boolean
  onSalvar: (d: {
    vencimento: string
    valor: string
    observacao: string | null
  }) => void
  onRemover: () => void
  onReceber: () => void
  onDesfazer: () => void
}) {
  const [editando, setEditando] = useState(false)
  const [vencimento, setVencimento] = useState(p.vencimento)
  const [valor, setValor] = useState(decimalParaMoeda(p.valor))
  const [observacao, setObservacao] = useState(p.observacao ?? '')

  // A MESMA regra do sino (src/lib/parcela-estado.ts): se as duas telas
  // classificassem por conta própria, uma diria "vence hoje" e a outra
  // "atrasada há 1 dia" sobre a mesma linha.
  const situacao = situacaoDaParcela(p.vencimento, p.recebidoEm)

  if (editando) {
    return (
      <li className="flex flex-wrap items-end gap-3 p-3">
        <div className="space-y-1.5">
          <Label htmlFor={`venc-${p.id}`}>Vencimento</Label>
          <Input
            id={`venc-${p.id}`}
            type="date"
            value={vencimento}
            onChange={(e) => setVencimento(e.target.value)}
            disabled={desabilitado}
            className="h-9 w-40"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`val-${p.id}`}>Valor</Label>
          <Input
            id={`val-${p.id}`}
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(mascararMoeda(e.target.value))}
            disabled={desabilitado}
            className="h-9 w-28 text-right tabular-nums"
          />
        </div>
        <div className="min-w-40 flex-1 space-y-1.5">
          <Label htmlFor={`obs-${p.id}`}>Nº do boleto / cheque</Label>
          <Input
            id={`obs-${p.id}`}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="opcional"
            disabled={desabilitado}
            className="h-9"
          />
        </div>
        <Button
          size="sm"
          onClick={() => {
            onSalvar({
              vencimento,
              valor: moedaParaDecimal(valor),
              observacao: observacao || null,
            })
            setEditando(false)
          }}
          disabled={desabilitado}
        >
          Salvar
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setVencimento(p.vencimento)
            setValor(decimalParaMoeda(p.valor))
            setObservacao(p.observacao ?? '')
            setEditando(false)
          }}
          disabled={desabilitado}
        >
          Cancelar
        </Button>
      </li>
    )
  }

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm">
      <span className="text-muted-foreground w-6 tabular-nums">{p.numero}ª</span>
      <span className="tabular-nums">{dataBR(p.vencimento)}</span>
      <span className="font-medium tabular-nums">
        {reais(Math.round(Number(p.valor) * 100))}
      </span>

      {/* O ESTADO EM PALAVRAS. Vermelho só em atrasada e vence hoje — se todo
          estado tivesse cor, nenhum chamaria atenção. */}
      <span
        className={cn(
          'text-xs',
          situacao.estado === 'recebida' &&
            'font-medium text-emerald-700 dark:text-emerald-400',
          situacao.cobravel && 'text-destructive font-medium',
          situacao.estado === 'pendente' && 'text-muted-foreground',
        )}
      >
        {p.recebidoEm
          ? `recebida em ${dataHoraBR(p.recebidoEm)}${p.recebidoPorNome ? ` por ${p.recebidoPorNome}` : ''}`
          : rotuloDaSituacao(situacao)}
      </span>

      {p.observacao && (
        <span className="text-muted-foreground truncate text-xs">
          {p.observacao}
        </span>
      )}

      {podeEditar && (
        <span className="ml-auto flex items-center gap-1">
          {p.recebidoEm ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={onDesfazer}
              disabled={desabilitado}
            >
              <Undo2 />
              Desfazer
            </Button>
          ) : (
            <Button size="sm" onClick={onReceber} disabled={desabilitado}>
              <Check />
              Recebido
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditando(true)}
            disabled={desabilitado}
          >
            Editar
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={onRemover}
            disabled={desabilitado}
            aria-label={`Remover ${p.numero}ª parcela`}
          >
            <Trash2 />
          </Button>
        </span>
      )}
    </li>
  )
}
