import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { listarProdutosParaOrdem, obterOrdem } from '../actions'
import { HistoricoDaOp } from './historico-op'
import {
  OrdemForm,
  type OrdemFormDefaults,
} from '@/components/forms/ordem-form'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireRole } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Editar OP — Vanvest' }

export default async function EditarOrdemPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireRole(['admin', 'gerente_producao'])
  const { id } = await params

  const [ordem, produtos] = await Promise.all([
    obterOrdem(id),
    listarProdutosParaOrdem(),
  ])
  if (!ordem) notFound()

  const defaults: OrdemFormDefaults = {
    id: ordem.id,
    numero: ordem.numero,
    produtoId: ordem.produtoId,
    variacaoId: ordem.variacaoId,
    quantidade: ordem.quantidade,
    maquinaId: ordem.maquinaId,
    canalDestino: ordem.canalDestino,
    prioridade: ordem.prioridade,
    status: ordem.status,
    dataPrevistaInicio: ordem.dataPrevistaInicio,
    dataPrevistaFim: ordem.dataPrevistaFim,
    responsavelId: ordem.responsavelId,
    observacoes: ordem.observacoes,
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Button
          render={<Link href="/ordens" />}
          variant="ghost"
          size="icon-sm"
          aria-label="Voltar"
        >
          <ArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-mono text-2xl font-semibold">
            {ordem.numero}
          </h1>
          <p className="text-muted-foreground truncate text-sm">
            {ordem.produto.nome}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Resumo</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-2 text-sm md:grid-cols-4">
          <Info
            label="Quantidade"
            value={`${ordem.quantidade.toLocaleString('pt-BR')} un`}
          />
          <Info
            label="Criada em"
            value={format(new Date(ordem.createdAt), "dd/MM/yyyy 'às' HH:mm", {
              locale: ptBR,
            })}
          />
          <Info
            label="Início real"
            value={
              ordem.dataRealInicio
                ? format(new Date(ordem.dataRealInicio), 'dd/MM/yyyy', {
                    locale: ptBR,
                  })
                : '—'
            }
          />
          <Info
            label="Fim real"
            value={
              ordem.dataRealFim
                ? format(new Date(ordem.dataRealFim), 'dd/MM/yyyy', {
                    locale: ptBR,
                  })
                : '—'
            }
          />
          <Info label="Criada por" value={ordem.criador?.nome ?? '—'} />
          <Info
            label="Máquina"
            value={ordem.maquina ? ordem.maquina.nome : '—'}
          />
        </CardContent>
      </Card>

      <OrdemForm defaults={defaults} produtos={produtos} />

      <HistoricoDaOp ordemId={ordem.id} />
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs">{label}</div>
      <div className="text-foreground tabular-nums">{value}</div>
    </div>
  )
}
