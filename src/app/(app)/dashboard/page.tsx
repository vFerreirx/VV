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
import {
  resumoDaReposicao,
  type ResumoDaReposicao,
} from '../estoque/actions'
import {
  obterRelatorioPeriodo,
  type RelatorioMensal,
} from '../relatorios/actions'
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
import {
  estadoDoBackup,
  quandoFoiOBackup,
  tamanhoDoBackup,
} from '@/lib/backup'
import type { BackupRegistro } from '@/lib/db/schema'
import { obterUltimoBackup } from '@/lib/db/ultimo-backup'
import { hojeEmBrasilia } from '@/lib/dia-brasil'
import { ROTULO_DA_SITUACAO } from '@/lib/producao/reposicao'
import { tituloDaOp } from '@/lib/producao/rotulo-da-op'
import { cn } from '@/lib/utils'
import { CANAL_LABEL_CURTO } from '@/lib/validators/ordens'

export const metadata: Metadata = { title: 'Dashboard — Vanvest' }

export default async function DashboardPage() {
  const user = await requireAuth()

  // ⚠️ SÓ A GESTÃO. A área `dashboard` é travada em admin e gerente
  // (src/lib/auth/permissoes.ts); os outros cargos vão pra casa deles.
  // `requireArea` não serve aqui: ela redireciona pra /dashboard, e seria
  // loop. `destinoInicial` só devolve uma casa que o cargo consegue abrir.
  const [
    nivelDashboard,
    nivelRemessas,
    nivelOrdens,
    nivelKanban,
    nivelVendas,
  ] = await Promise.all([
    nivelDaAreaPara(user.role, 'dashboard'),
    nivelDaAreaPara(user.role, 'remessas'),
    nivelDaAreaPara(user.role, 'ordens'),
    nivelDaAreaPara(user.role, 'kanban'),
    nivelDaAreaPara(user.role, 'vendas'),
  ])
  if (nivelDashboard === 'nenhum') redirect(await destinoInicial(user.role))

  // Tarefas são da administração: só admin. Pros demais cargos nem a
  // consulta acontece — a action redirecionaria.
  const ehAdmin = user.role === 'admin'

  // O BLOCO DE VENDAS SÓ PRA QUEM TEM A ÁREA — e a checagem vem ANTES da
  // chamada, não depois: `obterRelatorioPeriodo` tem `requireArea('vendas')`
  // dentro, que REDIRECIONA. Chamar e descartar o resultado jogaria pra fora
  // do dashboard quem não tem vendas. Mesmo cuidado que o sino toma com as
  // parcelas.
  //
  // DOIS PERÍODOS, não três: o mês corrente e o mês passado inteiro. Os
  // últimos 7 dias saem do `porDia` dos dois — a janela de 7 dias sempre cai
  // dentro deles —, então o dashboard não ganha uma terceira consulta.
  const hojeBr = hojeEmBrasilia()
  const inicioDoMes = `${hojeBr.slice(0, 7)}-01`
  const mesPassado = mesAnteriorDe(hojeBr)

  const [
    kpis,
    opsUrgentes,
    producao14d,
    topProdutos,
    remessas,
    tarefas,
    tarefasPendentes,
    reposicao,
    vendasDoMes,
    vendasMesPassado,
    ultimoBackup,
  ] = await Promise.all([
    obterKPIs(),
    listarOpsUrgentes(5),
    listarProducaoUltimosDias(14),
    listarTopProdutosMes(5),
    nivelRemessas !== 'nenhum' ? listarRemessasAbertas() : Promise.resolve([]),
    ehAdmin ? listarTarefasDoPainel(5) : Promise.resolve([]),
    ehAdmin ? contarTarefasPendentes() : Promise.resolve(0),
    // Volta vazio pra quem não tem escrita em Ordens.
    resumoDaReposicao(),
    nivelVendas !== 'nenhum'
      ? obterRelatorioPeriodo(inicioDoMes, hojeBr)
      : Promise.resolve(null),
    nivelVendas !== 'nenhum'
      ? obterRelatorioPeriodo(mesPassado.inicio, mesPassado.fim)
      : Promise.resolve(null),
    // BACKUP: `role === 'admin'`, checado ANTES da consulta — mesmo padrão
    // dos boletos no calendário. É o assunto do banco inteiro; o gerente,
    // que também abre o dashboard, não entra. `undefined` = não consultou.
    ehAdmin ? obterUltimoBackup() : Promise.resolve(undefined),
  ])
  const faltaDespachar = remessas.filter(
    (r) => r.risco === 'baixa_pendente',
  ).length

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
            {ultimoBackup !== undefined && (
              <BackupLinha ultimo={ultimoBackup} />
            )}
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
            {/* FALTA DESPACHAR = remessas com o envio vencido e a produção
                toda concluída — o 'baixa_pendente' de `riscoDaRemessa`, a
                MESMA regra do âmbar de /remessas e do card abaixo. Não conta
                OP pronta: desde que a OP fora de remessa finaliza na
                conclusão, o que fica pronto é o Full esperando a data dele,
                e isso é normal a semana inteira. */}
            <KPICard
              href="/remessas"
              label="Falta despachar"
              value={faltaDespachar}
              subtitle={faltaDespachar > 0 ? 'o envio já passou' : undefined}
              icon={PackageCheck}
              accent={
                faltaDespachar > 0 ? 'text-amber-600' : 'text-muted-foreground'
              }
              tom={faltaDespachar > 0 ? 'ambar' : undefined}
            />
          </div>

          {/* VENDAS NO PAINEL. O dashboard não citava faturamento em lugar
              nenhum, e é o número que a gestão abre a tela pra ver — ele
              existia só dentro de /vendas, atrás de duas abas. */}
          {vendasDoMes && (
            <VendasCard
              mes={vendasDoMes}
              mesPassado={vendasMesPassado}
              hoje={hojeBr}
            />
          )}

          {/* Tarefas da administração — SÓ admin. Pros demais cargos o card
              nem existe: nada de espaço vazio no lugar. */}
          {ehAdmin && <TarefasCard tarefas={tarefas} total={tarefasPendentes} />}

          {/* Remessas Full em risco/atrasadas (quem tem acesso à área) */}
          {nivelRemessas !== 'nenhum' && <RemessasAlerta remessas={remessas} />}

          {/* Reposição de estoque: pra quem decide produzir (escrita em
              Ordens). */}
          {podeEscrever(nivelOrdens) && <ReposicaoAlerta resumo={reposicao} />}

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
  /** Vermelho é atraso; âmbar é pendência (o despacho). */
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

// O BACKUP, NUMA LINHA SÓ. Discreta de propósito: em dia, é informação de
// canto; fora do dia, a cor muda e o sino já avisou. O estado sai de
// `estadoDoBackup` (src/lib/backup.ts), o mesmo do sino — os dois nunca
// discordam.
function BackupLinha({ ultimo }: { ultimo: BackupRegistro | null }) {
  const agora = new Date()
  const estado = estadoDoBackup(ultimo, agora)
  const cor =
    estado === 'em_dia'
      ? 'text-muted-foreground'
      : estado === 'sem_drive'
        ? 'text-amber-600'
        : 'text-destructive'
  return (
    <p className={cn('mt-1 text-xs tabular-nums', cor)}>
      {ultimo === null ? (
        'Nenhum backup registrado'
      ) : (
        <>
          Último backup: {quandoFoiOBackup(ultimo.feitoEm, agora)} ·{' '}
          {tamanhoDoBackup(ultimo.tamanhoBytes)} · Drive{' '}
          {ultimo.copiaDrive ? '✓' : '✗'}
          {estado === 'atrasado' && ' · atrasado'}
        </>
      )}
    </p>
  )
}

// AS PEÇAS QUE ESTÃO ACABANDO E AINDA NÃO VIRARAM OP. Mesmo desenho do alerta
// de remessas: a contagem numa linha e os primeiros itens embaixo, "Acabou"
// antes. As que já têm OP não aparecem — não pedem nada do gerente.
function ReposicaoAlerta({ resumo }: { resumo: ResumoDaReposicao }) {
  const total = resumo.acabou + resumo.acabando
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Reposição de estoque</CardTitle>
          <Link
            href="/estoque"
            className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
          >
            Ver fila →
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nada pendente de reposição.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {resumo.acabou > 0 && (
                <span className="text-destructive">{resumo.acabou} acabou</span>
              )}
              {resumo.acabou > 0 && resumo.acabando > 0 && ' · '}
              {resumo.acabando > 0 && (
                <span className="text-amber-600">
                  {resumo.acabando} acabando
                </span>
              )}
            </p>
            <ul className="divide-y">
              {resumo.itens.slice(0, 5).map((i) => {
                const t = tituloDaOp(i.produtoNome, {
                  cor: i.variacaoCor,
                  modelo: i.variacaoModelo,
                  tamanho: i.variacaoTamanho,
                })
                return (
                  <li
                    key={i.id}
                    className="flex items-center justify-between gap-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{t.familia}</span>
                      {t.variacao && (
                        <span className="text-muted-foreground"> · {t.variacao}</span>
                      )}
                    </span>
                    <Badge
                      className={cn(
                        'shrink-0 text-[11px]',
                        i.situacao === 'acabou'
                          ? 'bg-destructive/15 text-destructive'
                          : 'bg-amber-500/15 text-amber-600',
                      )}
                    >
                      {ROTULO_DA_SITUACAO[i.situacao]}
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

function RemessasAlerta({ remessas }: { remessas: RemessaAberta[] }) {
  const emRisco = remessas.filter((r) => r.risco !== 'no_prazo')
  const atrasadas = emRisco.filter((r) => r.risco === 'atrasada')
  const risco = emRisco.filter((r) => r.risco === 'em_risco')
  // Envio passou e ainda há OP não despachada, com a produção concluída: é
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
                  {baixaPendente.length} com despacho pendente
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
                          ? 'Falta despachar'
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

// -----------------------------------------------------------------
// Vendas
// -----------------------------------------------------------------

/** O mês anterior inteiro (primeiro e último dia), a partir de um YYYY-MM-DD. */
function mesAnteriorDe(iso: string): { inicio: string; fim: string } {
  const [ano, mes] = iso.split('-').map(Number)
  const anoAnt = mes === 1 ? ano! - 1 : ano!
  const mesAnt = mes === 1 ? 12 : mes! - 1
  const mm = String(mesAnt).padStart(2, '0')
  // Dia 0 do mês seguinte = último dia deste mês, sem tabela de 30/31.
  const ultimo = new Date(Date.UTC(anoAnt, mesAnt, 0)).getUTCDate()
  return { inicio: `${anoAnt}-${mm}-01`, fim: `${anoAnt}-${mm}-${ultimo}` }
}

function somarDiasIso(iso: string, n: number): string {
  const [ano, mes, dia] = iso.split('-').map(Number)
  return new Date(Date.UTC(ano!, mes! - 1, dia! + n)).toISOString().slice(0, 10)
}

const reaisCurtos = (v: number): string =>
  v.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  })

function VendasCard({
  mes,
  mesPassado,
  hoje,
}: {
  mes: RelatorioMensal
  mesPassado: RelatorioMensal | null
  hoje: string
}) {
  // ⚠️ A COMPARAÇÃO É ATÉ O MESMO DIA DO MÊS PASSADO. Comparar 18 dias contra
  // 31 diria "caiu 40%" todo mês, e a queda seria só o calendário.
  const diaDoMes = Number(hoje.slice(8, 10))
  const mesmoPeriodo = (mesPassado?.porDia ?? [])
    .filter((d) => Number(d.data.slice(8, 10)) <= diaDoMes)
    .reduce((s, d) => s + (d.faturamento ?? 0), 0)

  // Os últimos 7 dias, do `porDia` dos dois períodos já carregados: a janela
  // atravessa a virada do mês nos primeiros dias, e é por isso que o mês
  // passado entra na conta.
  const desde = somarDiasIso(hoje, -6)
  const ultimos7 = [...(mesPassado?.porDia ?? []), ...mes.porDia]
    .filter((d) => d.data >= desde && d.data <= hoje)
    .reduce(
      (acc, d) => ({
        faturamento: acc.faturamento + (d.faturamento ?? 0),
        unidades: acc.unidades + d.unidades,
      }),
      { faturamento: 0, unidades: 0 },
    )

  const variacao =
    mesmoPeriodo > 0
      ? ((mes.vendas.faturamento - mesmoPeriodo) / mesmoPeriodo) * 100
      : null

  return (
    <Card className="vv-reveal">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Vendas do mês</CardTitle>
          <Link
            href="/vendas"
            className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
          >
            Ver diário →
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <div className="text-muted-foreground text-xs tracking-wide uppercase">
              Faturamento do mês
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {reaisCurtos(mes.vendas.faturamento)}
            </div>
            <div className="text-muted-foreground text-xs tabular-nums">
              {mes.vendas.unidades.toLocaleString('pt-BR')} peças em{' '}
              {mes.vendas.dias} dia{mes.vendas.dias === 1 ? '' : 's'}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs tracking-wide uppercase">
              Até dia {diaDoMes} do mês passado
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {mesmoPeriodo > 0 ? reaisCurtos(mesmoPeriodo) : '—'}
            </div>
            {variacao !== null && (
              <div
                className={cn(
                  'text-xs tabular-nums',
                  variacao >= 0 ? 'text-emerald-600' : 'text-destructive',
                )}
              >
                {variacao >= 0 ? '+' : ''}
                {variacao.toFixed(1)}% neste mês
              </div>
            )}
          </div>
          <div>
            <div className="text-muted-foreground text-xs tracking-wide uppercase">
              Últimos 7 dias
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {reaisCurtos(ultimos7.faturamento)}
            </div>
            <div className="text-muted-foreground text-xs tabular-nums">
              {ultimos7.unidades.toLocaleString('pt-BR')} peças
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
