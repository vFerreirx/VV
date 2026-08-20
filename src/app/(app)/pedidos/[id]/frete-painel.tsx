'use client'

import { Check, Package, Truck, TriangleAlert } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  cotarFreteAction,
  salvarFreteAction,
  type CotacaoFeita,
  type SituacaoFrete,
} from '../frete-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FRACAO_VALOR_DECLARADO, formatarKgFrete, valorDeclaradoCentavos } from '@/lib/frete'
import { freteEmCentavos, temFrete } from '@/lib/total-pedido'
import { cn } from '@/lib/utils'

const reais = (centavos: number) =>
  (centavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })

// 0.4 → "40%". Sai da constante em vez de ser digitado, senão mudar a fração
// deixaria a tela mentindo.
const pct = (fracao: number) =>
  `${(fracao * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`

const mascaraCep = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 8)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

export type FreteSalvo = {
  transportadora: string | null
  servico: string | null
  valor: string | null
  prazoDias: number | null
  cepDestino: string | null
  cotadoEm: Date | null
}

/**
 * Cotação de frete do pedido. NADA acontece ao abrir a tela — só no clique.
 *
 * A cotação falhar não pode derrubar a página: toda falha vira mensagem
 * dentro deste painel, e o documento do pedido continua ali do lado.
 */
export function FretePainel({
  orcamentoId,
  situacao,
  cepDoComprador,
  pesoGramas,
  itensSemPeso,
  totalCentavos,
  salvo,
  podeEditar,
}: {
  orcamentoId: string
  situacao: SituacaoFrete
  cepDoComprador: string | null
  pesoGramas: number
  itensSemPeso: string[]
  totalCentavos: number
  salvo: FreteSalvo
  podeEditar: boolean
}) {
  const router = useRouter()
  const [cotando, startCotar] = useTransition()
  const [salvando, startSalvar] = useTransition()
  const [cep, setCep] = useState(mascaraCep(cepDoComprador ?? ''))
  const [cotacao, setCotacao] = useState<CotacaoFeita | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const impedimentos = [
    ...situacao.impedimentos,
    ...(itensSemPeso.length > 0
      ? [
          `${itensSemPeso.length} item(ns) do pedido sem peso cadastrado: ${itensSemPeso.slice(0, 4).join('; ')}${itensSemPeso.length > 4 ? ` … e mais ${itensSemPeso.length - 4}` : ''}.`,
        ]
      : []),
  ]
  const bloqueado = impedimentos.length > 0

  function cotar() {
    setErro(null)
    startCotar(async () => {
      const r = await cotarFreteAction(orcamentoId, cep || null)
      if (!r.success) {
        setErro(r.error)
        setCotacao(null)
        return
      }
      setCotacao(r.data!)
      if (r.data!.servicos.length === 0) {
        setErro('Nenhuma transportadora atendeu esse trajeto.')
      }
    })
  }

  function escolher(s: CotacaoFeita['servicos'][number]) {
    if (!cotacao) return
    startSalvar(async () => {
      const r = await salvarFreteAction(orcamentoId, {
        transportadora: s.transportadora,
        servico: s.servico,
        precoCentavos: s.precoCentavos,
        prazoDias: s.prazoDias,
        cepDestino: cotacao.cepDestino,
      })
      if (!r.success) {
        toast.error(r.error)
        return
      }
      toast.success(r.message ?? 'Frete salvo')
      router.refresh()
    })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 print:hidden">
      <div className="rounded-lg border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium">
              <Truck className="size-4" />
              Frete
              {situacao.sandbox && (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                  sandbox
                </span>
              )}
            </div>
            {/* O valor declarado NÃO é o total do pedido, e a frase diz isso
                com os dois números na frente — quem cota precisa saber o que
                está declarando antes de mandar. */}
            <p className="text-muted-foreground mt-1 text-xs">
              {formatarKgFrete(pesoGramas)} · valor declarado{' '}
              <strong>{reais(valorDeclaradoCentavos(totalCentavos))}</strong> —{' '}
              {pct(FRACAO_VALOR_DECLARADO)} do total do pedido, que é {reais(totalCentavos)}. É o
              declarado que influencia o preço do frete e o que o seguro cobre.
              {situacao.origem && (
                <>
                  {' '}
                  Origem: {situacao.origem.cep}
                  {situacao.origem.cidade ? ` (${situacao.origem.cidade})` : ''}.
                </>
              )}
            </p>
          </div>
        </div>

        {/* Frete já escolhido: snapshot, e a tela diz isso. */}
        {salvo.transportadora && (
          <div className="mt-3 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 text-xs text-emerald-800 dark:text-emerald-300">
            <div className="font-medium">
              Frete combinado: {salvo.transportadora} · {salvo.servico} —{' '}
              {salvo.valor
                ? Number(salvo.valor).toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL',
                  })
                : '—'}
              {salvo.prazoDias != null && ` · ${salvo.prazoDias} dia(s)`}
            </div>
            <div className="mt-0.5 opacity-90">
              Para o CEP {salvo.cepDestino ?? '—'}
              {salvo.cotadoEm &&
                `, cotado em ${new Date(salvo.cotadoEm).toLocaleDateString('pt-BR')}`}
              . Recotar não altera este valor — só escolher outro altera.
            </div>
          </div>
        )}

        {/* Frete DIGITADO: tem valor e não tem procedência. A distinção não é
            decoração — sem ela ninguém sabe se aquele número é estimativa ou
            combinado com a transportadora. */}
        {!salvo.transportadora && temFrete(salvo.valor) && (
          <div className="mt-3 rounded-md border p-3 text-xs">
            <div className="font-medium">
              Frete informado à mão: {reais(freteEmCentavos(salvo.valor))}
            </div>
            <div className="text-muted-foreground mt-0.5">
              Digitado no pedido, sem cotação por trás. Escolher uma cotação abaixo substitui este
              valor; editar o pedido também.
            </div>
          </div>
        )}

        {bloqueado ? (
          <ul className="mt-3 list-disc space-y-1 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 pl-7 text-xs text-amber-700 dark:text-amber-300">
            {impedimentos.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        ) : (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="w-40 space-y-1.5">
              <Label htmlFor="frete-cep">CEP de destino</Label>
              <Input
                id="frete-cep"
                value={cep}
                onChange={(e) => setCep(mascaraCep(e.target.value))}
                placeholder="00000-000"
                inputMode="numeric"
                disabled={cotando}
                autoComplete="off"
              />
            </div>
            <Button onClick={cotar} loading={cotando} disabled={cotando}>
              <Truck />
              Cotar frete
            </Button>
            {!cepDoComprador && (
              <p className="text-muted-foreground pb-2 text-xs">
                Este pedido não tem cliente com CEP cadastrado.
              </p>
            )}
          </div>
        )}

        {erro && (
          <div className="border-destructive/40 bg-destructive/5 text-destructive mt-3 flex items-start gap-2 rounded-md border p-3 text-xs">
            <TriangleAlert className="mt-px size-3.5 shrink-0" />
            <span>{erro}</span>
          </div>
        )}

        {cotacao && (
          <div className="mt-4 space-y-3">
            {/* Os volumes: é aqui que se vê o pedido dividido em pacotes e o
                valor declarado rateado entre eles. */}
            <div className="text-muted-foreground text-xs">
              <div className="mb-1 flex items-center gap-1.5 font-medium">
                <Package className="size-3.5" />
                {cotacao.pacotes.length === 1
                  ? '1 volume'
                  : `${cotacao.pacotes.length} volumes`}{' '}
                para o CEP {mascaraCep(cotacao.cepDestino)}
              </div>
              <ul className="space-y-0.5 tabular-nums">
                {cotacao.pacotes.map((p, i) => (
                  <li key={i}>
                    {i + 1}. {formatarKgFrete(p.pesoGramas)} · {p.medidas} · declarado{' '}
                    {reais(p.valorDeclaradoCentavos)}
                  </li>
                ))}
              </ul>
            </div>

            {cotacao.servicos.length > 0 && (
              <div className="divide-y rounded-md border">
                {cotacao.servicos.map((s) => {
                  const escolhido =
                    salvo.transportadora === s.transportadora && salvo.servico === s.servico
                  return (
                    <div
                      key={`${s.transportadora}-${s.servico}-${s.id}`}
                      className="flex items-center justify-between gap-3 p-2.5 text-sm"
                    >
                      <div>
                        <div className="font-medium">
                          {s.transportadora} · {s.servico}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {s.prazoDias != null
                            ? `${s.prazoDias} dia(s) úteis`
                            : 'prazo não informado'}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-medium tabular-nums">{reais(s.precoCentavos)}</span>
                        {podeEditar && (
                          <Button
                            size="sm"
                            variant={escolhido ? 'outline' : 'default'}
                            onClick={() => escolher(s)}
                            disabled={salvando}
                          >
                            {escolhido && <Check />}
                            {escolhido ? 'Escolhido' : 'Usar este'}
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Serviço com erro NÃO some: some junto o motivo de o preço
                daquela transportadora não estar na lista. */}
            {cotacao.comErro.length > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300">
                <div className="mb-1 font-medium">
                  {cotacao.comErro.length} serviço(s) não cotaram:
                </div>
                <ul className={cn('list-disc space-y-0.5 pl-4')}>
                  {cotacao.comErro.map((e, i) => (
                    <li key={i}>
                      <strong>
                        {e.transportadora} · {e.servico}
                      </strong>
                      : {e.erro}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
