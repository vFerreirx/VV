import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Activity,
  AlertTriangle,
  CircleAlert,
  Factory,
  Package,
} from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import {
  listarOpsPorCanal,
  listarOpsUrgentes,
  listarProducaoUltimosDias,
  listarTopProdutosMes,
  obterKPIs,
  type DashboardKPIs,
} from './actions'
import { FullsProgresso } from '../ordens/fulls-progresso'
import { listarFullsProgresso } from '../ordens/remessas-actions'
import { CanaisChart } from '@/components/charts/canais-chart'
import { ProducaoChart } from '@/components/charts/producao-chart'
import { TopProdutosChart } from '@/components/charts/top-produtos-chart'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CountUp } from '@/components/ui/count-up'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { requireAuth } from '@/lib/auth/require-auth'
import { cn } from '@/lib/utils'
import {
  PRIORIDADE_LABEL,
  STATUS_LABEL_CURTO,
  prioridadeValues,
  statusValues,
} from '@/lib/validators/ordens'

export const metadata: Metadata = { title: 'Dashboard — Vanvest' }

const STATUS_COLOR: Record<(typeof statusValues)[number], string> = {
  aguardando_materia_prima: 'bg-zinc-500',
  programado: 'bg-blue-500',
  em_producao: 'bg-emerald-500',
  acabamento: 'bg-cyan-600',
  embalagem: 'bg-violet-500',
  pronto_envio: 'bg-amber-500',
  enviado: 'bg-emerald-700',
  cancelado: 'bg-muted-foreground',
}

const PRIORIDADE_BADGE: Record<(typeof prioridadeValues)[number], string> = {
  baixa: 'bg-muted text-muted-foreground',
  normal: 'bg-secondary text-secondary-foreground',
  alta: 'bg-orange-500/15 text-orange-600',
  urgente: 'bg-destructive/15 text-destructive',
}

export default async function DashboardPage() {
  const user = await requireAuth()

  // Fulls só pra quem tem acesso a ordens (senão a action redirecionaria).
  const nivelOrdens = await nivelDaAreaPara(user.role, 'ordens')

  const [kpis, opsUrgentes, producao14d, canais, topProdutos, fulls] =
    await Promise.all([
      obterKPIs(),
      listarOpsUrgentes(5),
      listarProducaoUltimosDias(14),
      listarOpsPorCanal(),
      listarTopProdutosMes(5),
      nivelOrdens !== 'nenhum' ? listarFullsProgresso() : Promise.resolve([]),
    ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Bem-vindo, {user.nome.split(' ')[0]}.
        </p>
      </div>

      {/* KPI cards */}
      <div className="vv-stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          label="OPs ativas"
          value={kpis.opsAtivas}
          icon={Package}
          accent="text-blue-600"
        />
        <KPICard
          label="Em produção"
          value={kpis.opsEmProducao}
          icon={Activity}
          accent="text-emerald-600"
        />
        <KPICard
          label="Atrasadas"
          value={kpis.opsAtrasadas}
          icon={AlertTriangle}
          accent={kpis.opsAtrasadas > 0 ? 'text-destructive' : 'text-muted-foreground'}
          alerta={kpis.opsAtrasadas > 0}
        />
        <KPICard
          label="Máquinas operando"
          value={`${kpis.maquinasOperando} / ${kpis.maquinasTotal}`}
          icon={Factory}
          accent="text-cyan-600"
          subtitle={
            kpis.maquinasTotal > 0
              ? `${Math.round((kpis.maquinasOperando / kpis.maquinasTotal) * 100)}% em uso`
              : undefined
          }
        />
      </div>

      {/* Fulls em andamento (quem tem acesso a ordens) */}
      <FullsProgresso fulls={fulls} />

      {/* Produção dos últimos 14 dias */}
      <Card>
        <CardHeader>
          <CardTitle>Produção dos últimos 14 dias</CardTitle>
        </CardHeader>
        <CardContent>
          <ProducaoChart data={producao14d} />
        </CardContent>
      </Card>

      {/* Distribuição por status */}
      <Card>
        <CardHeader>
          <CardTitle>Fluxo do kanban</CardTitle>
        </CardHeader>
        <CardContent>
          <DistribuicaoStatus kpis={kpis} />
        </CardContent>
      </Card>

      {/* Canais + Top produtos */}
      <div className="vv-stagger grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>OPs por canal de destino</CardTitle>
          </CardHeader>
          <CardContent>
            <CanaisChart data={canais} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Top produtos do mês</CardTitle>
          </CardHeader>
          <CardContent>
            <TopProdutosChart data={topProdutos} />
          </CardContent>
        </Card>
      </div>

      {/* OPs urgentes */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>OPs urgentes / atrasadas</CardTitle>
            <Link
              href="/ordens"
              className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
            >
              Ver todas →
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {opsUrgentes.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhuma OP urgente.</p>
          ) : (
            <ul className="divide-y">
              {opsUrgentes.map((op) => (
                <li key={op.id} className="flex items-center gap-3 py-2.5">
                  <Link
                    href={`/ordens/${op.id}`}
                    className="font-mono text-xs hover:underline"
                  >
                    {op.numero}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {op.produtoNome}
                    </div>
                    <div className="text-muted-foreground truncate text-xs">
                      {[op.variacaoCor, op.variacaoTamanho]
                        .filter(Boolean)
                        .join(' / ') || op.produtoSku}
                      {op.maquinaNome && (
                        <>
                          {' · '}
                          <span>{op.maquinaNome}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <Badge
                    className={cn(
                      'shrink-0',
                      PRIORIDADE_BADGE[op.prioridade],
                      op.prioridade === 'urgente' && 'pulse-urgente',
                    )}
                  >
                    {PRIORIDADE_LABEL[op.prioridade]}
                  </Badge>
                  <Badge variant="secondary" className="shrink-0">
                    {STATUS_LABEL_CURTO[op.status]}
                  </Badge>
                  {op.dataPrevistaFim && (
                    <span
                      className={cn(
                        'hidden shrink-0 items-center gap-1 tabular-nums text-xs sm:inline-flex',
                        op.atrasada
                          ? 'text-destructive font-medium'
                          : 'text-muted-foreground',
                      )}
                    >
                      {op.atrasada && <CircleAlert className="size-3.5" />}
                      {format(new Date(op.dataPrevistaFim), 'dd/MM/yy', {
                        locale: ptBR,
                      })}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// -----------------------------------------------------------------
// Componentes locais
// -----------------------------------------------------------------

function KPICard({
  label,
  value,
  icon: Icon,
  accent,
  subtitle,
  alerta,
}: {
  label: string
  value: number | string
  icon: typeof Activity
  accent: string
  subtitle?: string
  alerta?: boolean
}) {
  return (
    <Card className="vv-lift">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            {label}
          </CardTitle>
          <Icon className={cn('size-4', accent)} />
        </div>
      </CardHeader>
      <CardContent>
        <div
          className={cn(
            'text-3xl font-semibold tabular-nums',
            alerta && 'text-destructive',
          )}
        >
          {typeof value === 'number' ? <CountUp value={value} /> : value}
        </div>
        {subtitle && (
          <div className="text-muted-foreground mt-0.5 text-xs">{subtitle}</div>
        )}
      </CardContent>
    </Card>
  )
}

function DistribuicaoStatus({ kpis }: { kpis: DashboardKPIs }) {
  const max = Math.max(1, ...kpis.distribuicaoStatus.map((d) => d.total))

  return (
    <div className="space-y-3">
      {kpis.distribuicaoStatus.map((d) => {
        const pct = (d.total / max) * 100
        return (
          <div key={d.status} className="grid grid-cols-[10rem_1fr_2.5rem] items-center gap-3 text-sm">
            <div className="text-muted-foreground truncate">
              {STATUS_LABEL_CURTO[d.status]}
            </div>
            <div className="bg-muted relative h-3 overflow-hidden rounded-full">
              <div
                className={cn(
                  'absolute inset-y-0 left-0 rounded-full transition-all',
                  STATUS_COLOR[d.status],
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="text-right tabular-nums font-medium">{d.total}</div>
          </div>
        )
      })}
    </div>
  )
}
