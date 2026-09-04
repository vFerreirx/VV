'use client'

import { CreditCard, Eraser } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { definirPagamentoAction } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DESCONTO_PIX_PADRAO,
  FORMAS_PAGAMENTO,
  ROTULO_FORMA,
  type FormaPagamento,
} from '@/lib/pagamento'
import {
  descontoEmCentavos,
  freteEmCentavos,
  temDesconto,
  temFrete,
  totalFinal,
} from '@/lib/total-pedido'

const reais = (centavos: number) =>
  (centavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })

// "5" / "5,5" → o que a coluna numeric(5,2) espera. Vazio continua vazio: é a
// ausência que significa "sem desconto".
const soPercentual = (v: string) => v.replace(/[^\d,.]/g, '').replace('.', ',')

/**
 * Como este pedido é pago: a forma e o desconto à vista combinados.
 *
 * Irmão do FretePainel — mesma largura, mesmo peso visual, `print:hidden`: é
 * controle de tela, e o que vai pro cliente é o documento acima.
 *
 * O DESCONTO SÓ MORDE OS PRODUTOS (src/lib/total-pedido.ts), e o resumo de
 * uma linha mostra as quatro parcelas justamente pra isso ficar visível antes
 * de alguém salvar.
 */
export function PagamentoPainel({
  orcamentoId,
  totalMercadoria,
  freteValor,
  forma: formaSalva,
  descontoPercentual: descontoSalvo,
  podeEditar,
}: {
  orcamentoId: string
  /** A MERCADORIA, em reais — a base do desconto. */
  totalMercadoria: number
  freteValor: string | null
  forma: FormaPagamento | null
  descontoPercentual: string | null
  podeEditar: boolean
}) {
  const router = useRouter()
  const [salvando, startSalvar] = useTransition()
  const [forma, setForma] = useState<FormaPagamento | null>(formaSalva)
  const [desconto, setDesconto] = useState(
    descontoSalvo == null ? '' : String(Number(descontoSalvo)).replace('.', ','),
  )

  const percentual = desconto === '' ? null : desconto.replace(',', '.')
  const descontoCentavos = descontoEmCentavos(totalMercadoria, percentual)
  const mercadoriaCentavos = Math.round(totalMercadoria * 100)

  /**
   * Escolher Pix preenche o desconto padrão SÓ COM O CAMPO VAZIO, e trocar de
   * forma nunca apaga o que já foi digitado. O número é uma sugestão — quem
   * negociou 7% no Pix, ou 5% no boleto, não pode ver a tela desfazer isso.
   */
  function escolher(f: FormaPagamento) {
    setForma(f)
    if (f === 'pix' && desconto.trim() === '') {
      setDesconto(String(DESCONTO_PIX_PADRAO))
    }
  }

  function salvar() {
    startSalvar(async () => {
      const r = await definirPagamentoAction(orcamentoId, {
        forma,
        descontoPercentual: percentual,
      })
      if (!r.success) {
        toast.error(r.error)
        return
      }
      toast.success(r.message ?? 'Pagamento salvo')
      router.refresh()
    })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 print:hidden">
      <div className="rounded-lg border p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <CreditCard className="size-4" />
          Pagamento
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          Forma e desconto à vista combinados com o cliente. O desconto incide
          só sobre os produtos — frete é custo repassado da transportadora.
          Sem forma e sem desconto, o documento não diz nada sobre pagamento.
        </p>

        {podeEditar ? (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label>Forma</Label>
              <div className="flex flex-wrap gap-2">
                {FORMAS_PAGAMENTO.map((f) => (
                  <Button
                    key={f}
                    size="sm"
                    variant={forma === f ? 'default' : 'outline'}
                    onClick={() => escolher(f)}
                    disabled={salvando}
                  >
                    {ROTULO_FORMA[f]}
                  </Button>
                ))}
                {/* Voltar a "não informado" é operação legítima: alguém
                    marcou por engano. Some junto o que estava marcado. */}
                {forma && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setForma(null)}
                    disabled={salvando}
                  >
                    <Eraser />
                    Limpar
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pag-desconto">Desconto</Label>
              <div className="relative">
                <Input
                  id="pag-desconto"
                  inputMode="decimal"
                  placeholder="0"
                  value={desconto}
                  onChange={(e) => setDesconto(soPercentual(e.target.value))}
                  disabled={salvando}
                  className="h-9 w-24 pr-7 text-right tabular-nums"
                />
                <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs">
                  %
                </span>
              </div>
            </div>

            <Button onClick={salvar} loading={salvando} disabled={salvando}>
              Salvar pagamento
            </Button>
          </div>
        ) : (
          <div className="mt-3 text-sm">
            {forma ? ROTULO_FORMA[forma] : 'Forma não informada'}
            {temDesconto(percentual) &&
              ` · desconto de ${desconto}% (${reais(descontoCentavos)})`}
          </div>
        )}

        {/* As quatro parcelas na mesma linha: é aqui que se confere que o
            desconto não encostou no frete antes de salvar. */}
        <div className="text-muted-foreground mt-3 border-t pt-3 text-xs">
          produtos{' '}
          <span className="tabular-nums">{reais(mercadoriaCentavos)}</span>
          {temDesconto(percentual) && (
            <>
              {' · desconto '}
              <span className="tabular-nums text-emerald-700 dark:text-emerald-400">
                −{reais(descontoCentavos)} ({desconto}%)
              </span>
            </>
          )}
          {temFrete(freteValor) && (
            <>
              {' · frete '}
              <span className="tabular-nums">
                {reais(freteEmCentavos(freteValor))}
              </span>
            </>
          )}
          {' · '}
          <span className="text-foreground font-semibold tabular-nums">
            Total{' '}
            {reais(
              Math.round(
                totalFinal(totalMercadoria, freteValor, percentual) * 100,
              ),
            )}
          </span>
        </div>
      </div>
    </div>
  )
}
