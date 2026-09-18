'use client'

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Fragment, useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  historicoRecente,
  obterVendaDoDia,
  salvarVendaDiaAction,
  type VendaDia,
} from './actions'
import { ImportarCSVDialog } from './importar-csv-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  CONTA_ATACADO_MANUAL,
  CONTA_ATACADO_PEDIDOS,
  somarContasParaExibicao,
} from '@/lib/vendas/contas'
import {
  avisoDeAtacadoDuplo,
  contasParadas,
  diasEmAberto,
  foraDoNormal,
  referenciaDaConta,
  somarDias,
  type Anomalia,
  type LinhaDoHistorico,
} from '@/lib/vendas/conferencia'
import { formatarNumeroPedido } from '@/lib/validators/orcamentos'
import {
  CONTAS_MARKETPLACE,
  MARKETPLACE_LABEL,
  MARKETPLACES_AGRUPADOS,
  contaEhManual,
  marketplaceDaConta,
  type ContaKey,
  type Marketplace,
} from '@/lib/validators/vendas'

type Props = {
  data: string
  /** Hoje em Brasília, do servidor: a faixa de dias em aberto sai daqui. */
  hoje: string
  vendaDoDia: VendaDia | null
  /** 35 dias terminando no dia aberto — ver `historicoRecente`. */
  historico: LinhaDoHistorico[]
  recentes: VendaDia[]
  podeEditar: boolean
}

function hojeISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Soma/subtrai dias de uma data YYYY-MM-DD sem fuso (meio-dia UTC).
function addDias(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n, 12))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

function formatarData(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    timeZone: 'UTC',
  })
}

function formatarDataCurta(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  })
}

function formatarReais(v: string | number | null): string {
  if (v == null) return '—'
  const n = Number(v)
  if (Number.isNaN(n)) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Máscara de moeda BRL: digita os números e eles preenchem da direita
// (centavos). Ex.: "123456" → "1.234,56".
function mascararMoeda(valor: string): string {
  const digits = valor.replace(/\D/g, '')
  if (!digits) return ''
  return (Number(digits) / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

// Converte a máscara ("1.234,56") no decimal que o servidor espera ("1234.56").
function moedaParaDecimal(masked: string): string | undefined {
  const digits = masked.replace(/\D/g, '')
  if (!digits) return undefined
  return (Number(digits) / 100).toFixed(2)
}

// Converte o decimal salvo ("1234.56") na máscara de exibição.
function decimalParaMoeda(dec: string | null): string {
  if (dec == null || dec === '') return ''
  const cents = Math.round(Number(dec) * 100)
  if (!Number.isFinite(cents)) return ''
  return mascararMoeda(String(cents))
}

// Ordem dos marketplaces e das contas vem do catálogo (igual à aba Mensal).
const ORDEM_MK = Object.keys(MARKETPLACE_LABEL) as Marketplace[]
const LABEL_CONTA: Record<string, string> = Object.fromEntries(
  CONTAS_MARKETPLACE.map((c) => [c.key, c.label]),
)
const ORDEM_CONTA: Record<string, number> = Object.fromEntries(
  CONTAS_MARKETPLACE.map((c, i) => [c.key, i]),
)

// O DIA DA SEMANA POR EXTENSO, pro aviso falar a língua de quem confere:
// "o normal nesta quinta", e não "o normal no dia 4 da semana".
const DIA_SEMANA = [
  'domingo',
  'segunda',
  'terça',
  'quarta',
  'quinta',
  'sexta',
  'sábado',
]

function diaDaSemanaPorExtenso(iso: string): string {
  const [ano, mes, dia] = iso.split('-').map(Number)
  return DIA_SEMANA[new Date(Date.UTC(ano!, mes! - 1, dia!)).getUTCDay()] ?? ''
}

/**
 * O texto do aviso. Diz o que foi digitado, o que é normal e termina em
 * PERGUNTA — a conferência avisa, nunca bloqueia: o número estranho pode ser
 * um dia de campanha, e quem sabe é quem está com o painel aberto do lado.
 */
function textoDoAviso(
  anomalia: Anomalia,
  digitado: number | null,
  mediana: number,
  dia: string,
): string {
  const normal = `o normal nesta ${diaDaSemanaPorExtenso(dia)} é ~${Math.round(mediana)}`
  if (anomalia === 'zerado') {
    return `Sem número, e ${normal}. Faltou lançar?`
  }
  const valor = (digitado ?? 0).toLocaleString('pt-BR')
  return anomalia === 'alto'
    ? `${valor} peças, e ${normal}. Confere?`
    : `${valor} peças, e ${normal}. Confere?`
}

// Agrupa as contas do dia por marketplace (na ordem do catálogo), com
// subtotal por marketplace — mesmo formato da aba Mensal.
function agruparContasDoDia(venda: VendaDia | null) {
  const linhas = somarContasParaExibicao(
    (venda?.contas ?? []).map((c) => ({
      ...c,
      marketplace: marketplaceDaConta(c.conta) ?? '',
    })),
  ).map((c) => ({ ...c, faturamento: Number(c.faturamento ?? 0) }))
  return ORDEM_MK.map((mk) => {
    const contas = linhas
      .filter((c) => c.marketplace === mk)
      .sort(
        (a, b) => (ORDEM_CONTA[a.conta] ?? 99) - (ORDEM_CONTA[b.conta] ?? 99),
      )
    return {
      marketplace: mk,
      contas,
      subQtd: contas.reduce((s, c) => s + c.quantidade, 0),
      subFat: contas.reduce((s, c) => s + c.faturamento, 0),
    }
  }).filter((g) => g.contas.length > 0)
}

export function VendasView({
  data,
  hoje: hojeDoServidor,
  vendaDoDia,
  historico,
  recentes,
  podeEditar,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  // Dialog de registro/edição: guarda o dia-alvo e a venda existente (ou
  // null pra um registro novo). null = fechado.
  const [registro, setRegistro] = useState<{
    data: string
    venda: VendaDia | null
  } | null>(null)

  const hoje = hojeDoServidor || hojeISO()
  const ehHoje = data === hoje
  const grupos = agruparContasDoDia(vendaDoDia)

  // OS DIAS EM ABERTO APARECEM NA PRÓPRIA TELA, e não no sino: quem lança
  // vendas abre esta tela justamente pra isso, e um sino aceso em toda tela
  // do sistema cobraria a fábrica inteira por um trabalho que é de uma
  // pessoa. `recentes` já vem carregado e ordenado por data desc.
  //
  // ⚠️ SÓ DEPOIS DE 3 DIAS. O ritmo da casa é lançar a quarta na quinta (pra
  // o dia fechar inteiro) e lançar sexta, sábado e domingo todos na segunda.
  // Cobrar a sexta na segunda é cobrar quem está em dia — e a faixa acenderia
  // toda semana. A folga está em `diasEmAberto`.
  const emAberto = diasEmAberto(
    recentes.map((r) => r.data),
    hoje,
  )

  // O MESMO DIA DA SEMANA PASSADA, ao lado do total: 200 peças só quer dizer
  // alguma coisa comparado com a quinta passada. Sai do histórico que já foi
  // carregado — sem consulta nova.
  const diaAnterior = somarDias(data, -7)
  const semanaPassada = historico
    .filter((l) => l.data === diaAnterior)
    .reduce(
      (acc, l) => ({
        quantidade: acc.quantidade + l.quantidade,
        faturamento: acc.faturamento + (l.faturamento ?? 0),
      }),
      { quantidade: 0, faturamento: 0 },
    )
  const temSemanaPassada = historico.some((l) => l.data === diaAnterior)

  // "Registrar venda" (topo) sempre lança um dia NOVO: o dia seguinte ao
  // último dia com venda lançada (recentes vem ordenado por data desc).
  // Sem nenhuma venda ainda, cai pra hoje.
  const proximoDiaSemDados =
    recentes.length > 0 ? addDias(recentes[0]!.data, 1) : hoje

  const seletorDiaRef = useRef<HTMLInputElement>(null)

  function irPara(novaData: string) {
    // Sempre fixa ?data: sem ele, a página abriria no último dia com
    // vendas, então "Voltar pra hoje" precisa do parâmetro explícito.
    const params = new URLSearchParams(searchParams.toString())
    params.set('data', novaData)
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  // Abre o calendário nativo do input escondido (fallback: foco).
  function abrirSeletorDia() {
    const el = seletorDiaRef.current
    if (!el) return
    try {
      el.showPicker()
    } catch {
      el.focus()
    }
  }

  return (
    <div className="space-y-6">
      {podeEditar && (
        <div className="flex justify-end gap-2">
          <Button
            onClick={() =>
              setRegistro({ data: proximoDiaSemDados, venda: null })
            }
            disabled={isPending}
          >
            <Plus />
            Registrar venda
          </Button>
          <ImportarCSVDialog />
        </div>
      )}

      {emAberto.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm">
          <span className="font-medium">
            {emAberto.length === 1
              ? '1 dia sem lançamento: '
              : `${emAberto.length} dias sem lançamento: `}
          </span>
          {emAberto.map((d, i) => (
            <Fragment key={d}>
              {i > 0 && <span className="text-muted-foreground">, </span>}
              <button
                type="button"
                className="underline underline-offset-2"
                onClick={() => irPara(d)}
                disabled={isPending}
              >
                {formatarDataCurta(d)}
              </button>
            </Fragment>
          ))}
          <p className="text-muted-foreground mt-1 text-xs">
            Só aparece o que passou de 3 dias. Lançar a sexta na segunda, ou a
            quarta na quinta, continua sendo estar em dia.
          </p>
        </div>
      )}

      {/* Navegação de dia */}
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => irPara(addDias(data, -1))}
          disabled={isPending}
          aria-label="Dia anterior"
        >
          <ChevronLeft />
        </Button>

        <div className="flex flex-col items-center gap-1">
          <div className="text-sm font-medium capitalize">
            {formatarData(data)}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
              onClick={abrirSeletorDia}
              disabled={isPending}
            >
              <CalendarDays className="size-3.5" />
              Selecionar dia
            </button>
            {!ehHoje && (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground text-xs underline"
                onClick={() => irPara(hoje)}
                disabled={isPending}
              >
                Voltar pra hoje
              </button>
            )}
          </div>
          {/* Input escondido que dispara o date picker nativo. */}
          <input
            ref={seletorDiaRef}
            type="date"
            value={data}
            max={hoje}
            onChange={(e) => e.target.value && irPara(e.target.value)}
            disabled={isPending}
            tabIndex={-1}
            aria-hidden
            className="sr-only"
          />
        </div>

        <Button
          variant="outline"
          size="icon"
          onClick={() => irPara(addDias(data, 1))}
          disabled={isPending || ehHoje}
          aria-label="Próximo dia"
        >
          <ChevronRight />
        </Button>
      </div>

      {/* Card do dia */}
      <div className="rounded-xl border p-6">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="text-muted-foreground text-xs tracking-wide uppercase">
              Quantidade de vendas
            </div>
            <div className="mt-1 text-3xl font-semibold tabular-nums">
              {vendaDoDia?.quantidade ?? 0}
            </div>
            {temSemanaPassada && (
              <div className="text-muted-foreground mt-1 text-xs tabular-nums">
                {semanaPassada.quantidade} na semana passada
              </div>
            )}
          </div>
          <div>
            <div className="text-muted-foreground text-xs tracking-wide uppercase">
              Faturamento
            </div>
            <div className="mt-1 text-3xl font-semibold tabular-nums">
              {formatarReais(vendaDoDia?.faturamento ?? null)}
            </div>
            {temSemanaPassada && (
              <div className="text-muted-foreground mt-1 text-xs tabular-nums">
                {formatarReais(semanaPassada.faturamento || null)} na semana
                passada
              </div>
            )}
          </div>
        </div>

        {grupos.length > 0 && (
          <div className="mt-6 border-t pt-4">
            <div className="text-muted-foreground mb-2 text-xs tracking-wide uppercase">
              Por marketplace / conta
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Marketplace / conta</TableHead>
                    <TableHead className="text-right">Vendas</TableHead>
                    <TableHead className="text-right">Faturamento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grupos.map((g) => (
                    <Fragment key={g.marketplace}>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableCell className="font-semibold">
                          {MARKETPLACE_LABEL[g.marketplace]}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {g.subQtd}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatarReais(g.subFat || null)}
                        </TableCell>
                      </TableRow>
                      {g.contas.map((c) => (
                        <TableRow key={c.conta}>
                          <TableCell className="text-muted-foreground pl-6">
                            {LABEL_CONTA[c.conta] ?? c.conta}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {c.quantidade}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatarReais(c.faturamento || null)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </Fragment>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-medium">Total</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {vendaDoDia?.quantidade ?? 0}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatarReais(vendaDoDia?.faturamento ?? null)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </div>
        )}

        {/* DETALHE dos pedidos que compõem parte da conta "Pedidos
            finalizados". A conta também pode conter vendas manuais; este
            bloco não é uma segunda parcela a somar no total.

            Só leitura: quem escreve estas linhas é o pedido, ao ser marcado
            como finalizado (src/lib/vendas/lancamento-pedido.ts). */}
        {(vendaDoDia?.pedidos.length ?? 0) > 0 && (
          <div className="mt-6 border-t pt-4">
            <div className="text-muted-foreground mb-2 text-xs tracking-wide uppercase">
              Pedidos finalizados
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Unidades</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vendaDoDia!.pedidos.map((p) => (
                    <TableRow key={p.orcamentoId}>
                      <TableCell className="font-medium tabular-nums">
                        <Link
                          href={`/pedidos/${p.orcamentoId}`}
                          className="hover:underline"
                        >
                          nº {formatarNumeroPedido(p.numero)}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {p.cliente}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.unidades}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatarReais(p.faturamento)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-muted-foreground mt-2 text-xs">
              Lançados automaticamente quando o pedido foi marcado como
              finalizado — valor dos produtos menos o desconto, sem o frete.
              Cada pedido conta como UMA venda, de quantas peças for: os{' '}
              {vendaDoDia!.pedidos.length} pedido(s) acima são{' '}
              {vendaDoDia!.pedidos.length} na coluna Vendas. Já estão somados
              na linha &ldquo;Pedidos finalizados&rdquo; da tabela; não são um
              valor a mais.
            </p>
          </div>
        )}

        {vendaDoDia?.observacao && (
          <p className="text-muted-foreground mt-4 text-sm">
            {vendaDoDia.observacao}
          </p>
        )}

        {podeEditar && (
          <div className="mt-6">
            <Button
              onClick={() => setRegistro({ data, venda: vendaDoDia })}
              disabled={isPending}
            >
              {vendaDoDia ? (
                <>
                  <Pencil />
                  Editar
                </>
              ) : (
                <>
                  <Plus />
                  Registrar venda do dia
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Dias recentes */}
      {recentes.length > 0 && (
        <div>
          <h2 className="text-muted-foreground mb-2 text-sm font-medium">
            Dias recentes
          </h2>
          <div className="divide-y rounded-lg border">
            {recentes.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => irPara(v.data)}
                disabled={isPending}
                className="hover:bg-muted/50 flex w-full items-center justify-between gap-4 px-4 py-2.5 text-left text-sm"
              >
                <span className="font-medium tabular-nums">
                  {formatarDataCurta(v.data)}
                </span>
                <span className="text-muted-foreground flex items-center gap-4 tabular-nums">
                  <span>{v.quantidade} vendas</span>
                  <span className="w-24 text-right">
                    {formatarReais(v.faturamento)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <EditarDialog
        open={registro !== null}
        onClose={() => setRegistro(null)}
        data={registro?.data ?? data}
        venda={registro?.venda ?? null}
        historico={historico}
        historicoDe={data}
      />
    </div>
  )
}

// -----------------------------------------------------------------
// Dialog: registrar/editar venda do dia (detalhe por conta)
// -----------------------------------------------------------------

type CampoConta = { q: string; f: string }

// O estado do salvamento contínuo, pro indicador do rodapé.
type EstadoDoSalvamento =
  | { tipo: 'limpo' }
  | { tipo: 'salvando' }
  | { tipo: 'salvo'; hora: string }
  | { tipo: 'erro'; mensagem: string }

// A assinatura do que está na tela. Salvar só acontece quando ela MUDA — sem
// isso, abrir e fechar o formulário abriria uma transação por foco perdido.
function assinatura(
  valores: Record<string, CampoConta>,
  observacao: string,
): string {
  const contas = Object.entries(valores)
    .map(([k, v]) => `${k}:${v.q.trim()}:${v.f.trim()}`)
    .sort()
    .join('|')
  return `${contas}#${observacao.trim()}`
}

function EditarDialog({
  open,
  onClose,
  data,
  venda,
  historico,
  historicoDe,
}: {
  open: boolean
  onClose: () => void
  data: string
  venda: VendaDia | null
  historico: LinhaDoHistorico[]
  /** O dia em que o histórico da página está ancorado. */
  historicoDe: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [valores, setValores] = useState<Record<string, CampoConta>>({})
  const [observacao, setObservacao] = useState('')
  const [dataEdit, setDataEdit] = useState(data)
  const [mostrarParadas, setMostrarParadas] = useState(false)
  const [salvamento, setSalvamento] = useState<EstadoDoSalvamento>({
    tipo: 'limpo',
  })
  // A assinatura do que já está GRAVADO. Começa nula: enquanto for nula, o
  // salvamento contínuo não encosta no banco (ver `useEffect` abaixo).
  const gravadoRef = useRef<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // QUAL DIA ESTÁ NOS CAMPOS. Trocar a data no campo acima trocava o alvo do
  // salvamento sem trocar o conteúdo: o formulário continuava com o dia
  // anterior na tela (ou vazio), acusava todas as contas como "faltou
  // lançar" e o botão gravaria isso POR CIMA do dia escolhido. Agora a troca
  // de data recarrega o dia.
  const [carregado, setCarregado] = useState<{
    dia: string
    venda: VendaDia | null
  } | null>(null)

  // Sincroniza os campos com a venda atual sempre que o dialog abre.
  const [abertoPara, setAbertoPara] = useState<string | null>(null)
  if (open && abertoPara !== data) {
    setAbertoPara(data)
    setDataEdit(data)
    // SÓ AS CONTAS MANUAIS entram nos campos. A linha espelho dos pedidos
    // finalizados ('atacado_pedidos') não tem input nenhum aqui — carregá-la
    // faria o total do rodapé contar um valor que não aparece em campo
    // algum, e o `salvar()` a devolveria pra uma action que a descarta.
    // Ela entra no total logo abaixo, como linha própria e não editável.
    const init: Record<string, CampoConta> = {}
    for (const c of venda?.contas ?? []) {
      if (!contaEhManual(c.conta)) continue
      init[c.conta] = {
        q: c.quantidade ? String(c.quantidade) : '',
        f: decimalParaMoeda(c.faturamento),
      }
    }
    setValores(init)
    setObservacao(venda?.observacao ?? '')
    setMostrarParadas(false)
    setSalvamento({ tipo: 'limpo' })
    setCarregado({ dia: data, venda })
    // A BASE DE COMPARAÇÃO É O QUE ESTÁ GRAVADO. Só a partir daqui o
    // salvamento contínuo sabe distinguir "o usuário mexeu" de "o formulário
    // acabou de carregar" — e é essa distinção que impede uma gravação vazia
    // por cima de um dia cheio.
    gravadoRef.current = assinatura(init, venda?.observacao ?? '')
  }
  if (!open && abertoPara !== null) {
    setAbertoPara(null)
    setCarregado(null)
    gravadoRef.current = null
  }

  // TROCOU A DATA: busca o dia escolhido e reseeda os campos. Enquanto a
  // busca não volta, `gravadoRef` fica nulo — ou seja, o salvamento contínuo
  // não grava nada, pelo mesmo motivo de sempre: formulário que ainda não
  // sabe o que está no banco não pode escrever no banco.
  useEffect(() => {
    if (!open || carregado === null || dataEdit === carregado.dia) return
    let vivo = true
    gravadoRef.current = null
    obterVendaDoDia(dataEdit)
      .then((v) => {
        if (!vivo) return
        const init: Record<string, CampoConta> = {}
        for (const c of v?.contas ?? []) {
          if (!contaEhManual(c.conta)) continue
          init[c.conta] = {
            q: c.quantidade ? String(c.quantidade) : '',
            f: decimalParaMoeda(c.faturamento),
          }
        }
        setValores(init)
        setObservacao(v?.observacao ?? '')
        setCarregado({ dia: dataEdit, venda: v })
        setSalvamento({ tipo: 'limpo' })
        gravadoRef.current = assinatura(init, v?.observacao ?? '')
      })
      .catch(() => {
        // Não deu pra ler o dia: o formulário fica como está e o automático
        // segue travado (gravadoRef nulo). O botão diz o erro se ele tentar.
        if (vivo) toast.error('Não deu pra carregar esse dia. Tente de novo.')
      })
    return () => {
      vivo = false
    }
  }, [open, dataEdit, carregado])

  // Derivado, não estado: "os campos ainda são de outro dia". Guardar isso em
  // estado obrigaria a um setState dentro do efeito, que é justamente o tipo
  // de render em cascata que o lint barra.
  const carregandoDia = carregado !== null && carregado.dia !== dataEdit

  function set(conta: string, campo: keyof CampoConta, valor: string) {
    const v = campo === 'f' ? mascararMoeda(valor) : valor
    setValores((prev) => {
      const atual = prev[conta] ?? { q: '', f: '' }
      return { ...prev, [conta]: { ...atual, [campo]: v } }
    })
  }

  const totalQtd = Object.values(valores).reduce(
    (s, v) => s + (Number(v.q) || 0),
    0,
  )
  const totalFat = Object.values(valores).reduce(
    (s, v) => s + Number(moedaParaDecimal(v.f) ?? 0),
    0,
  )

  // Os pedidos finalizados do dia sobrevivem a este salvamento (a action
  // preserva a linha espelho), então eles fazem parte do total do dia mesmo
  // sem campo aqui. Só valem enquanto a data não muda: mudando o dia, o que
  // será preservado é o lançamento do OUTRO dia, que esta tela não conhece.
  const pedidos =
    carregado?.dia === dataEdit ? (carregado.venda?.pedidos ?? []) : []
  // UMA VENDA POR PEDIDO, de quantas peças for — é `length`, não a soma de
  // `unidades`. Os campos acima também são vendas, então os dois somam na
  // mesma unidade de medida. Ver src/lib/vendas/lancamento-pedido.ts.
  const pedidosQtd = pedidos.length
  const pedidosFat = pedidos.reduce((s, p) => s + Number(p.faturamento), 0)

  // O HISTÓRICO SÓ VALE PRO DIA EM QUE FOI ANCORADO. Abrindo o formulário
  // num dia diferente do que a página carregou (o botão "Registrar venda"
  // abre o dia seguinte ao último), ele é buscado de novo — uma consulta,
  // e só quando o dia muda de verdade.
  const [hist, setHist] = useState<LinhaDoHistorico[]>(historico)
  const [histDe, setHistDe] = useState(historicoDe)
  useEffect(() => {
    if (!open) return
    if (dataEdit === histDe) return
    let vivo = true
    historicoRecente(dataEdit)
      .then((h) => {
        if (!vivo) return
        setHist(h)
        setHistDe(dataEdit)
      })
      // Sem histórico a tela continua inteira: some a referência, não o
      // formulário.
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [open, dataEdit, histDe])

  const historicoDoDia = histDe === dataEdit ? hist : []

  // CONTAS PARADAS SAEM DO FORMULÁRIO. Das 13 contas, 8 estão vivas: a
  // shein_5 parou em julho, e ela aparecia entre a shein_1 e o TikTok como se
  // esperasse número todo dia. Some a LINHA, não a conta: o catálogo não muda
  // e ela volta sozinha assim que voltar a vender.
  const contasManuais = MARKETPLACES_AGRUPADOS.flatMap((g) =>
    g.contas.map((c) => c.key as string),
  )
  const paradas = new Set(
    contasParadas(historicoDoDia, contasManuais, dataEdit),
  )
  // Conta com algo digitado agora nunca some no meio da digitação.
  for (const [conta, v] of Object.entries(valores)) {
    if (v.q.trim() !== '' || v.f.trim() !== '') paradas.delete(conta)
  }

  // A LINHA ESPELHO DOS PEDIDOS, pra mostrar a origem ao lado do campo
  // manual do atacado. Ela não tem input: quem escreve é o pedido.
  const espelho =
    carregado?.dia === dataEdit
      ? (carregado.venda?.contas.find(
          (c) => c.conta === CONTA_ATACADO_PEDIDOS,
        ) ?? null)
      : null
  const manualAtacado = valores[CONTA_ATACADO_MANUAL]
  const atacadoDuplo = avisoDeAtacadoDuplo(
    manualAtacado
      ? {
          quantidade: Number(manualAtacado.q) || 0,
          faturamento: Number(moedaParaDecimal(manualAtacado.f) ?? 0),
        }
      : null,
    espelho
      ? {
          quantidade: espelho.quantidade,
          faturamento: Number(espelho.faturamento ?? 0),
        }
      : null,
  )

  // ⚠️ FORMULÁRIO EM BRANCO NÃO SE CONFERE. Num dia que ninguém começou a
  // lançar, TODAS as contas estão vazias — acusar cada uma com "faltou
  // lançar?" é dizer o óbvio treze vezes e enterrar o aviso que importa. O
  // 'zerado' existe pra conta PULADA no meio do preenchimento, então ele só
  // começa a valer depois do primeiro número digitado.
  const comecouAPreencher = Object.values(valores).some(
    (v) => v.q.trim() !== '' || v.f.trim() !== '',
  )

  // OS AVISOS DA CONFERÊNCIA, por conta visível. Nunca bloqueiam nada: são
  // uma pergunta ("confere?"), e quem sabe a resposta é quem tem o painel do
  // marketplace aberto do lado.
  const avisos: { conta: string; label: string; texto: string }[] = []
  for (const grupo of MARKETPLACES_AGRUPADOS) {
    for (const conta of grupo.contas) {
      if (paradas.has(conta.key)) continue
      const ref = referenciaDaConta(
        historicoDoDia,
        conta.key,
        dataEdit,
        'quantidade',
      )
      const v = valores[conta.key]
      const digitado = v && v.q.trim() !== '' ? Number(v.q) : null
      const anomalia = comecouAPreencher
        ? foraDoNormal(digitado, ref, 'quantidade')
        : null
      if (!anomalia) continue
      avisos.push({
        conta: conta.key,
        label: `${grupo.label} · ${conta.label}`,
        texto: textoDoAviso(anomalia, digitado, ref.mediana, dataEdit),
      })
    }
  }

  /** O payload do dia, do jeito que a action espera. */
  function contasParaSalvar() {
    return Object.entries(valores)
      .map(([conta, v]) => ({
        conta: conta as ContaKey,
        quantidade: v.q.trim() === '' ? 0 : v.q,
        faturamento: moedaParaDecimal(v.f),
      }))
      .filter((c) => Number(c.quantidade) > 0 || c.faturamento !== undefined)
  }

  // SALVAMENTO CONTÍNUO — o trabalho é abrir os painéis dos marketplaces, não
  // digitar. Entre uma conta e outra a pessoa sai da tela, atende telefone,
  // troca de aba; o formulário tem que aguentar sair e voltar.
  //
  // ⚠️ QUATRO TRAVAS, porque esta action SUBSTITUI o dia inteiro e uma
  // gravação indevida apaga lançamento de verdade:
  //
  //   1. Só depois de carregado (`gravadoRef` preenchido). Antes disso o
  //      formulário está vazio, e gravar vazio por cima de um dia cheio seria
  //      apagar tudo em silêncio.
  //   2. Só se ALGO MUDOU de verdade (assinatura diferente da gravada) — nada
  //      de uma transação por foco perdido.
  //   3. Só no dia em que o formulário abriu. Trocar a data no campo e deixar
  //      o relógio salvar escreveria o conteúdo deste dia POR CIMA de outro.
  //      Com a data trocada, só o botão grava.
  //   4. Nunca esvazia sozinho: se o dia tem lançamento e a tela ficou sem
  //      nenhum campo preenchido, o automático não grava. Apagar um dia é
  //      decisão, e decisão passa pelo botão.
  const mudou =
    gravadoRef.current !== null &&
    assinatura(valores, observacao) !== gravadoRef.current
  const esvaziando =
    contasParaSalvar().length === 0 &&
    (carregado?.venda?.contas.length ?? 0) > 0
  // O dia nos campos tem que ser o dia do salvamento: trava contra gravar o
  // conteúdo de um dia por cima de outro.
  const podeSalvarSozinho =
    mudou && carregado?.dia === dataEdit && !carregandoDia && !esvaziando

  useEffect(() => {
    if (!open || !podeSalvarSozinho) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      void gravar({ automatico: true })
    }, 1500)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // A assinatura é o que dispara: qualquer tecla muda ela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, podeSalvarSozinho, assinatura(valores, observacao)])

  async function gravar({ automatico }: { automatico: boolean }) {
    const contas = contasParaSalvar()
    const assinaturaEnviada = assinatura(valores, observacao)
    setSalvamento({ tipo: 'salvando' })

    const result = await salvarVendaDiaAction({
      data: dataEdit,
      observacao: observacao.trim() || undefined,
      contas,
    })

    if (!result.success) {
      setSalvamento({ tipo: 'erro', mensagem: result.error })
      // No automático o toast não aparece: o indicador do rodapé já diz, e um
      // toast de erro a cada 1,5 s durante uma queda de rede seria pior que o
      // problema. No manual, ele aparece porque houve um clique esperando
      // resposta.
      if (!automatico) toast.error(result.error)
      return false
    }

    gravadoRef.current = assinaturaEnviada
    setSalvamento({
      tipo: 'salvo',
      hora: new Date().toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    })
    router.refresh()
    return true
  }

  // O BOTÃO CONTINUA EXISTINDO, como rede: é ele que fecha o dia, é ele que
  // grava quando a data foi trocada, e é por ele que se esvazia um dia de
  // propósito — os três casos que o automático não faz.
  function salvar() {
    if (timerRef.current) clearTimeout(timerRef.current)
    startTransition(async () => {
      const ok = await gravar({ automatico: false })
      if (!ok) return
      toast.success('Vendas do dia salvas')
      onClose()
    })
  }

  return (
    <Dialog
      open={open}
      // Fecha só pelo "X" (close-press) ou "Cancelar" (onClose direto):
      // clique fora e Esc são ignorados.
      disablePointerDismissal
      onOpenChange={(o, details) => {
        if (!o && details.reason === 'close-press') onClose()
      }}
    >
      <DialogContent className="max-h-[90vh] gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b p-6">
          <DialogTitle>Venda do dia</DialogTitle>
          <DialogDescription className="capitalize">
            {formatarData(dataEdit)}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] space-y-5 overflow-y-auto p-6">
          <div className="space-y-1.5">
            <Label htmlFor="v-data">Data</Label>
            <Input
              id="v-data"
              type="date"
              value={dataEdit}
              max={hojeISO()}
              onChange={(e) => setDataEdit(e.target.value || data)}
              disabled={isPending}
              className="h-9"
            />
          </div>

          {MARKETPLACES_AGRUPADOS.map((grupo) => {
            const visiveis = grupo.contas.filter(
              (c) => mostrarParadas || !paradas.has(c.key),
            )
            if (visiveis.length === 0) return null
            return (
              <div key={grupo.marketplace} className="space-y-2">
                <div className="text-sm font-semibold">{grupo.label}</div>
                {grupo.marketplace === 'vendas_atacado' && (
                  <p className="text-muted-foreground text-xs">
                    Informe somente vendas ainda não lançadas por um pedido. Os
                    pedidos finalizados são somados automaticamente a esta
                    conta.
                  </p>
                )}
                <div className="space-y-2">
                  {visiveis.map((conta) => {
                    const v = valores[conta.key] ?? { q: '', f: '' }
                    const ref = referenciaDaConta(
                      historicoDoDia,
                      conta.key,
                      dataEdit,
                      'quantidade',
                    )
                    const digitado = v.q.trim() === '' ? null : Number(v.q)
                    const anomalia = comecouAPreencher
                      ? foraDoNormal(digitado, ref, 'quantidade')
                      : null
                    const ehAtacadoManual = conta.key === CONTA_ATACADO_MANUAL
                    return (
                      <div key={conta.key} className="space-y-1">
                        <div className="grid grid-cols-[1fr_5.5rem_7rem] items-center gap-2">
                          <Label
                            htmlFor={`q-${conta.key}`}
                            className="text-muted-foreground text-sm font-normal"
                          >
                            {conta.label}
                            {/* A REFERÊNCIA FICA DO LADO DO CAMPO, discreta:
                                é o número que ele usaria pra conferir de
                                cabeça, e de cabeça ninguém lembra o que a
                                Conta 1 fez na quinta passada. */}
                            {ref.amostras >= 3 && ref.mediana > 0 && (
                              <span className="text-muted-foreground/70 ml-1 text-xs tabular-nums">
                                (~{Math.round(ref.mediana)})
                              </span>
                            )}
                          </Label>
                          <Input
                            id={`q-${conta.key}`}
                            inputMode="numeric"
                            placeholder="qtd"
                            value={v.q}
                            onChange={(e) =>
                              set(
                                conta.key,
                                'q',
                                e.target.value.replace(/\D/g, ''),
                              )
                            }
                            disabled={isPending}
                            className={cn(
                              'h-9',
                              anomalia && 'border-amber-500/60',
                            )}
                          />
                          <div className="relative">
                            <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-xs">
                              R$
                            </span>
                            <Input
                              aria-label={`Faturamento ${grupo.label} ${conta.label}`}
                              inputMode="decimal"
                              placeholder="0,00"
                              value={v.f}
                              onChange={(e) => set(conta.key, 'f', e.target.value)}
                              disabled={isPending}
                              className="h-9 pl-7 text-right"
                            />
                          </div>
                        </div>

                        {anomalia && (
                          <p className="text-xs text-amber-600 dark:text-amber-400">
                            {textoDoAviso(
                              anomalia,
                              digitado,
                              ref.mediana,
                              dataEdit,
                            )}
                          </p>
                        )}

                        {/* A ORIGEM À VISTA. O campo manual continua aberto —
                            nem todo pedido de atacado passa pelo sistema, e
                            fechá-lo apagaria faturamento real do mês. O que
                            faltava era saber o que JÁ veio pelos pedidos. */}
                        {ehAtacadoManual && espelho && (
                          <p className="text-muted-foreground text-xs">
                            Dos pedidos finalizados: {espelho.quantidade} venda
                            {espelho.quantidade === 1 ? '' : 's'} ·{' '}
                            {formatarReais(espelho.faturamento)}
                            {pedidos.length > 0 && (
                              <>
                                {' '}
                                (
                                {pedidos.reduce((t, x) => t + x.unidades, 0)}{' '}
                                peças)
                              </>
                            )}{' '}
                            — lançado pelo pedido, não editável aqui.
                          </p>
                        )}
                        {ehAtacadoManual && atacadoDuplo && (
                          <p className="text-xs text-amber-600 dark:text-amber-400">
                            As duas origens têm número neste dia. Se este
                            pedido já entrou pelo sistema, o dia conta a venda
                            duas vezes.
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {paradas.size > 0 && (
            // CONTA PARADA NÃO É CONTA APAGADA. Ela sai da lista pra não
            // pedir número todo dia, e volta sozinha quando voltar a vender.
            <button
              type="button"
              className="text-muted-foreground text-xs underline underline-offset-2"
              onClick={() => setMostrarParadas((v) => !v)}
            >
              {mostrarParadas
                ? 'esconder contas paradas'
                : `mostrar contas paradas (${paradas.size})`}
            </button>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="v-obs">Observação (opcional)</Label>
            <Textarea
              id="v-obs"
              rows={2}
              placeholder="Algo que valha registrar sobre o dia…"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              disabled={isPending}
            />
          </div>
        </div>

        {avisos.length > 0 && (
          // O MESMO AVISO, JUNTO, ANTES DE SALVAR: numa lista de 26 campos o
          // aviso da terceira linha some da vista quando se chega na última.
          <div className="border-t bg-amber-500/5 px-6 py-3">
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
              {avisos.length === 1
                ? '1 conta pra conferir'
                : `${avisos.length} contas pra conferir`}
            </p>
            <ul className="mt-1 space-y-0.5">
              {avisos.map((a) => (
                <li
                  key={a.conta}
                  className="text-xs text-amber-700 dark:text-amber-400"
                >
                  {a.label}: {a.texto}
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground mt-1 text-xs">
              Isto não impede de salvar — é só uma conferida.
            </p>
          </div>
        )}

        <DialogFooter className="flex-row items-center justify-between border-t p-6 sm:justify-between">
          <div className="text-sm leading-tight">
            {pedidos.length > 0 && (
              <div className="text-muted-foreground text-xs">
                inclui {pedidos.length} pedido(s) finalizado(s) ={' '}
                <span className="tabular-nums">
                  {pedidosQtd} venda(s) · {formatarReais(pedidosFat || null)}
                </span>{' '}
                — lançados pelo pedido, não editáveis aqui
              </div>
            )}
            {/* O INDICADOR DO SALVAMENTO CONTÍNUO. Sem ele, "salva sozinho"
                vira fé: a pessoa fecha a aba sem saber se o que digitou está
                gravado. */}
            <div className="text-muted-foreground text-xs">
              {/* "salvando…" enquanto houver mudança pendente: o que a
                  pessoa precisa saber é se o que ela digitou já está gravado,
                  e entre a tecla e a gravação vão 1,5 s. */}
              {carregandoDia && 'carregando o dia…'}
              {!carregandoDia &&
                (salvamento.tipo === 'salvando' || podeSalvarSozinho) &&
                'salvando…'}
              {!carregandoDia &&
                salvamento.tipo === 'salvo' &&
                !podeSalvarSozinho &&
                `salvo às ${salvamento.hora}`}
              {salvamento.tipo === 'erro' && !podeSalvarSozinho && (
                <span className="text-destructive">
                  não salvou — {salvamento.mensagem}
                </span>
              )}
              {!carregandoDia &&
                salvamento.tipo === 'limpo' &&
                esvaziando &&
                'sem nenhum campo: salve no botão pra esvaziar o dia'}
            </div>
            <div>
              <span className="text-muted-foreground">Total: </span>
              <span className="font-semibold tabular-nums">
                {totalQtd + pedidosQtd} vendas
              </span>
              <span className="text-muted-foreground"> · </span>
              <span className="font-semibold tabular-nums">
                {formatarReais(totalFat + pedidosFat || null)}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={isPending}>
              Cancelar
            </Button>
            <Button loading={isPending} onClick={salvar} disabled={isPending}>
              {'Salvar'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
