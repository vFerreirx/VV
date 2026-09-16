import { ViewTransition } from 'react'
import {
  AlertTriangle,
  Factory,
  PackageCheck,
  Wrench,
} from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import {
  listarOpsUrgentes,
  listarProducaoUltimosDias,
  listarTopProdutosMes,
  obterKPIs,
} from './actions'
import { OpsUrgentesLista } from './ops-urgentes-lista'
import { TarefasCard } from './tarefas-card'
import { listarRemessasAbertas, type RemessaAberta } from '../remessas/actions'
import {
  contarTarefasPendentes,
  listarTarefasDoPainel,
} from '../tarefas/actions'
import { ProducaoChart } from '@/components/charts/producao-chart'
import { TopProdutosChart } from '@/components/charts/top-produtos-chart'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CountUp } from '@/components/ui/count-up'
import { podeEscrever } from '@/lib/auth/permissoes'
import { destinoInicial, nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { isManager, requireAuth } from '@/lib/auth/require-auth'
import { cn } from '@/lib/utils'
import { CANAL_LABEL_CURTO } from '@/lib/validators/ordens'

export const metadata: Metadata = { title: 'Dashboard — Vanvest' }

export default async function DashboardPage() {
  const user = await requireAuth()

  // ⚠️ SÓ A GESTÃO. A área `dashboard` é travada em admin e gerente
  // (src/lib/auth/permissoes.ts); os outros cargos vão pra casa deles.
  // `requireArea` não serve aqui: ela redireciona pra /dashboard, e seria
  // loop. `destinoInicial` só devolve uma casa que o cargo consegue abrir.
  const [nivelDashboard, nivelRemessas, nivelOrdens, nivelKanban] =
    await Promise.all([
      nivelDaAreaPara(user.role, 'dashboard'),
      nivelDaAreaPara(user.role, 'remessas'),
      nivelDaAreaPara(user.role, 'ordens'),
      nivelDaAreaPara(user.role, 'kanban'),
    ])
  if (nivelDashboard === 'nenhum') redirect(await destinoInicial(user.role))

  // Tarefas são da administração: só admin. Pros demais cargos nem a
  // consulta acontece — a action redirecionaria.
  const ehAdmin = user.role === 'admin'

  const [
    kpis,
    opsUrgentes,
    producao14d,
    topProdutos,
    remessas,
    tarefas,
    tarefasPendentes,
  ] = await Promise.all([
    obterKPIs(),
    listarOpsUrgentes(5),
    listarProducaoUltimosDias(14),
    listarTopProdutosMes(5),
    nivelRemessas !== 'nenhum' ? listarRemessasAbertas() : Promise.resolve([]),
    ehAdmin ? listarTarefasDoPainel(5) : Promise.resolve([]),
    ehAdmin ? contarTarefasPendentes() : Promise.resolve(0),
  ])

  // Entrada do reveal de Suspense: par do exit no loading.tsx desta rota.
  // `default="none"` impede este ViewTransition de animar junto em qualquer
  // outra transicao da pagina.
  return (
    <ViewTransition enter="vt-entra-sobe" default="none">
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold">Dashboard</h1>
            <p className="text-muted-foreground text-sm">
              Bem-vindo, {user.nome.split(' ')[0]}.
            </p>
          </div>

          {/* OS QUATRO NÚMEROS, CADA UM LEVANDO PRA TELA ONDE SE RESOLVE.
              Número de painel que não leva a lugar nenhum é só leitura — e
              os de antes ("OPs ativas", "Em produção") nem pediam ação. */}
          <div className="vv-reveal grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KPICard
              href="/fabrica?situacao=livre"
              label="Máquinas produzindo"
              value={kpis.maquinasProduzindo}
              subtitle={`de ${kpis.maquinasAptas} apta${kpis.maquinasAptas === 1 ? '' : 's'}`}
              icon={Factory}
              accent="text-emerald-600"
            />
            <KPICard
              href="/fabrica?situacao=indisponivel"
              label="Paradas agora"
              value={kpis.paradasAgora}
              subtitle={
                kpis.motivoMaisComum
                  ? `mais comum: ${kpis.motivoMaisComum}`
                  : undefined
              }
              icon={Wrench}
              accent={
                kpis.paradasAgora > 0 ? 'text-amber-600' : 'text-muted-foreground'
              }
            />
            <KPICard
              href="/producao?filtro=atrasadas"
              label="Produção atrasada"
              value={kpis.producaoAtrasada}
              icon={AlertTriangle}
              accent={
                kpis.producaoAtrasada > 0
                  ? 'text-destructive'
                  : 'text-muted-foreground'
              }
              tom={kpis.producaoAtrasada > 0 ? 'vermelho' : undefined}
            />
            <KPICard
              href="/ordens?status=pronto_envio"
              label="Falta dar baixa"
              value={kpis.faltaBaixa}
              icon={PackageCheck}
              accent={
                kpis.faltaBaixa > 0 ? 'text-amber-600' : 'text-muted-foreground'
              }
              tom={kpis.faltaBaixa > 0 ? 'ambar' : undefined}
            />
          </div>

          {/* Tarefas da administração — SÓ admin. Pros demais cargos o card
              nem existe: nada de espaço vazio no lugar. */}
          {ehAdmin && <TarefasCard tarefas={tarefas} total={tarefasPendentes} />}

          {/* Remessas Full em risco/atrasadas (quem tem acesso à área) */}
          {nivelRemessas !== 'nenhum' && <RemessasAlerta remessas={remessas} />}

          <div className="vv-reveal grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Peças concluídas por dia</CardTitle>
                {/* O registro é feito só no fim: uma OP de três dias aparece
                    inteira no dia da conclusão, e sem esta linha o gráfico
                    parece dizer que a fábrica ficou dois dias parada. */}
                <p className="text-muted-foreground text-xs">
                  A OP conta no dia em que foi concluída.
                </p>
              </CardHeader>
              <CardContent>
                <ProducaoChart data={producao14d} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Top produtos do mês</CardTitle>
                <p className="text-muted-foreground text-xs">
                  Peças boas concluídas neste mês.
                </p>
              </CardHeader>
              <CardContent>
                <TopProdutosChart data={topProdutos} />
              </CardContent>
            </Card>
          </div>

          {/* OPs urgentes / atrasadas */}
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
              <OpsUrgentesLista
                ops={opsUrgentes}
                // As mesmas permissões da ficha em /remessas e /ordens.
                gestor={isManager(user.role)}
                podeMover={podeEscrever(nivelKanban)}
                podeEditarOrdens={podeEscrever(nivelOrdens)}
              />
            </CardContent>
          </Card>
        </div>
    </ViewTransition>
  )
}

// -----------------------------------------------------------------
// Componentes locais
// -----------------------------------------------------------------

function KPICard({
  href,
  label,
  value,
  icon: Icon,
  accent,
  subtitle,
  tom,
}: {
  href: string
  label: string
  value: number
  icon: typeof Factory
  accent: string
  subtitle?: string
  /** Vermelho é atraso; âmbar é pendência (a baixa). */
  tom?: 'vermelho' | 'ambar'
}) {
  return (
    <Link href={href} className="block rounded-xl">
      <Card className="vv-lift h-full">
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
              tom === 'vermelho' && 'text-destructive',
              tom === 'ambar' && 'text-amber-600',
            )}
          >
            <CountUp value={value} />
          </div>
          {subtitle && (
            <div className="text-muted-foreground mt-0.5 truncate text-xs">
              {subtitle}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}

function RemessasAlerta({ remessas }: { remessas: RemessaAberta[] }) {
  const emRisco = remessas.filter((r) => r.risco !== 'no_prazo')
  const atrasadas = emRisco.filter((r) => r.risco === 'atrasada')
  const risco = emRisco.filter((r) => r.risco === 'em_risco')
  // Envio passou e ainda há OP sem baixa, com a produção concluída: é
  // pendência de fechamento, não atraso — âmbar, contada à parte.
  const baixaPendente = emRisco.filter((r) => r.risco === 'baixa_pendente')

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Remessas Full</CardTitle>
          <Link
            href="/remessas"
            className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
          >
            Ver todas →
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {emRisco.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {remessas.length === 0
              ? 'Nenhuma remessa Full aberta no momento.'
              : 'Todas as remessas abertas estão no prazo.'}
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {atrasadas.length > 0 && (
                <span className="text-destructive">
                  {atrasadas.length} atrasada{atrasadas.length > 1 ? 's' : ''}
                </span>
              )}
              {atrasadas.length > 0 && risco.length > 0 && ' · '}
              {risco.length > 0 && (
                <span className="text-amber-600">
                  {risco.length} em risco
                </span>
              )}
              {(atrasadas.length > 0 || risco.length > 0) &&
                baixaPendente.length > 0 &&
                ' · '}
              {baixaPendente.length > 0 && (
                <span className="text-amber-600">
                  {baixaPendente.length} com baixa pendente
                </span>
              )}
            </p>
            <ul className="divide-y">
              {emRisco.slice(0, 5).map((r) => {
                const [, m, d] = r.dataEnvio.split('-')
                return (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-3 py-2 text-sm"
                  >
                    <span>
                      {CANAL_LABEL_CURTO[r.canal]} · {d}/{m}
                    </span>
                    <Badge
                      className={cn(
                        'text-[11px]',
                        r.risco === 'atrasada'
                          ? 'bg-destructive/15 text-destructive'
                          : 'bg-amber-500/15 text-amber-600',
                      )}
                    >
                      {r.risco === 'atrasada'
                        ? 'Atrasada'
                        : r.risco === 'baixa_pendente'
                          ? 'Falta dar baixa'
                          : 'Em risco'}
                    </Badge>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
