// A OP COMO O CHÃO DE FÁBRICA LÊ — a linha, o prazo e o selo, num lugar só.
//
// Moravam dentro de producao/painel-operador.tsx, onde o tablet usa. Saíram
// de lá quando /ordens passou a mostrar a mesma linha pro gerente: gerente e
// operador vendo "076 - Peseira 3D - CASAL - CAQUI" do mesmo jeito é o que
// evita o "qual peseira?" no corredor — e duas cópias do desenho divergiriam
// no primeiro ajuste de uma delas.

import { CircleAlert } from 'lucide-react'

import { ehDestaque, PRIORIDADE_BADGE, PRIORIDADE_LABEL, type PrioridadeNivel } from '@/lib/prioridade'
import { linhaDaOp, type Prazo } from '@/lib/producao/rotulo-da-op'
import { cn } from '@/lib/utils'

// A PEÇA COMO O CHÃO DE FÁBRICA LÊ — a linha do Trello, igual em todo lugar:
// "059 - Peseira LINKS - QUEEN - AREIA". As partes vêm de `linhaDaOp`
// (src/lib/producao/rotulo-da-op.ts); aqui só se decide o peso.
//
// O CÓDIGO EM NEGRITO E PRIMEIRO: é o número do programa, o que ele digita na
// busca e o que confere contra a máquina. O resto em peso normal, na ordem de
// sempre. Sem código (produto novo, sem programa), a linha começa direto no
// produto — sem traço sobrando.
//
// A QUANTIDADE fica fora por padrão: o cartão tem "Meta: X peças" e as listas
// têm a quantidade no canto. Os diálogos, que não têm esse lugar, pedem
// `comQuantidade`.
export type OpDaLinha = {
  produtoCodigo: string | null
  produtoNome: string
  variacaoTamanho: string | null
  variacaoCor: string | null
  quantidade: number
  tamanhoUnico: boolean
}

export function LinhaDaPeca({
  op,
  comQuantidade = false,
}: {
  op: OpDaLinha
  comQuantidade?: boolean
}) {
  const l = linhaDaOp({
    codigo: op.produtoCodigo,
    produtoNome: op.produtoNome,
    tamanho: op.variacaoTamanho,
    cor: op.variacaoCor,
    quantidade: op.quantidade,
    tamanhoUnico: op.tamanhoUnico,
  })
  const resto = comQuantidade ? l.semCodigo : l.descricao
  return (
    <>
      {l.codigo && (
        <span className="font-bold tabular-nums">{l.codigo} - </span>
      )}
      <span className="font-normal">{resto}</span>
    </>
  )
}

// O PRAZO EM PALAVRAS. "vence HOJE" e "ATRASADA" vêm pintados; os outros, em
// texto normal. Se todo prazo gritasse, nenhum gritaria.
//
// Recebe o prazo JÁ decidido: o tablet usa `prazoEmPalavras` (só mostra OP a
// produzir), /ordens usa `prazoNaLista` (que cala o prazo da OP concluída).
//
// `comIcone`: na lista do gerente o vermelho ganha o ícone de alerta, porque
// na luz de galpão, e pra quem não distingue vermelho, a cor sozinha some.
//
// `suppressHydrationWarning`: o texto é calculado com o relógio, no servidor
// e de novo no navegador; na virada do dia os dois podem discordar por um
// instante, e o do navegador (o mais novo) é o certo.
export function TextoDoPrazo({
  prazo,
  comIcone = false,
}: {
  prazo: Prazo | null
  comIcone?: boolean
}) {
  if (!prazo) return null
  return (
    <span
      suppressHydrationWarning
      className={cn(
        prazo.urgente
          ? 'text-destructive font-semibold'
          : 'text-muted-foreground',
        comIcone && 'inline-flex items-center gap-1.5',
      )}
    >
      {comIcone && prazo.urgente && (
        <CircleAlert aria-hidden className="size-4 shrink-0" />
      )}
      {prazo.texto}
    </span>
  )
}

// Selo de prioridade. Só alta e urgente ganham um — a regra é do
// `ehDestaque` em src/lib/prioridade.ts: um selo em cada linha vira ruído, e
// o ruído esconde justamente o urgente.
export function SeloDePrioridade({
  prioridade,
  className,
}: {
  prioridade: PrioridadeNivel
  className?: string
}) {
  if (!ehDestaque(prioridade)) return null
  return (
    <span
      className={cn(
        'shrink-0 rounded px-2 py-0.5 text-sm font-medium',
        PRIORIDADE_BADGE[prioridade],
        className,
      )}
    >
      {PRIORIDADE_LABEL[prioridade]}
    </span>
  )
}
