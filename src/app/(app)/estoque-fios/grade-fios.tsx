'use client'

import { useMemo, useState } from 'react'

import type { LoteFioItem } from './actions'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { coresDaGrade, ordenarParaGrade, totalDaGrade } from '@/lib/fios/saldo'
import { cn } from '@/lib/utils'

// A visão de estoque, no formato da planilha que a fábrica usava: uma linha
// por lote, cor repetindo, colunas com os nomes dela. É SÓ LEITURA — quem
// cadastra lote e quem lança retirada são os formulários da aba "Entradas
// de lote". Célula editável aqui apagaria o histórico de movimentações, que
// é imobilizado de propósito (ver o comentário de `movimentacoesFio` no
// schema).

const TODAS = '__todas__'

// Milhar com ponto e decimal com vírgula, como a planilha. Inteiro sai sem
// casa decimal (384, não 384,00) e quebrado mostra só o que tem (2.725,5).
function num(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

// Zero existe e precisa aparecer: a coluna RETIRADA em branco leria como
// "não sei", e o que se quer dizer é "não saiu nada".
// A largura fixa nas colunas de número deixa a sobra toda pra COR e
// PARTIDA. Sem ela a tabela distribui o espaço proporcionalmente e abre um
// vão entre a partida e os valores — o oposto da densidade de planilha.
const COLUNAS = [
  { chave: 'cor', rotulo: 'COR', numerica: false, largura: '' },
  { chave: 'partida', rotulo: 'PARTIDA (LOTE)', numerica: false, largura: '' },
  { chave: 'caixas', rotulo: 'CAIXAS', numerica: true, largura: 'w-24' },
  { chave: 'retirada', rotulo: 'RETIRADA', numerica: true, largura: 'w-24' },
  { chave: 'total', rotulo: 'TOTAL CAIXA', numerica: true, largura: 'w-28' },
  { chave: 'kg', rotulo: 'QUANTIDADE (KG)', numerica: true, largura: 'w-36' },
] as const

// Densidade de planilha: bem menos respiro que as tabelas de cadastro, e
// grade nos DOIS eixos — a linha vertical é o que faz o olho seguir a
// coluna numa tela de 51 linhas.
const CELULA = 'border-r px-2 py-1 last:border-r-0'
const NUMERO = 'text-right tabular-nums'

// A primeira coluna trava na horizontal pra não se perder a referência ao
// rolar de lado no celular. Precisa de fundo OPACO: sem ele o conteúdo das
// outras colunas passa por baixo e some atrás do texto.
const COR_FIXA = 'sticky left-0 z-10'

export function GradeFios({ lotes }: { lotes: LoteFioItem[] }) {
  const [cor, setCor] = useState<string>(TODAS)

  const ordenados = useMemo(() => ordenarParaGrade(lotes), [lotes])
  const cores = useMemo(() => coresDaGrade(lotes), [lotes])
  const visiveis = useMemo(
    () => (cor === TODAS ? ordenados : ordenados.filter((l) => l.corFornecedorNome === cor)),
    [ordenados, cor],
  )
  // Somado das linhas VISÍVEIS, como o subtotal de uma planilha filtrada.
  const total = useMemo(() => totalDaGrade(visiveis), [visiveis])

  if (lotes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-12 text-center">
        <p className="text-muted-foreground text-sm">Nenhum lote de fio em estoque.</p>
        <p className="text-muted-foreground mt-1 text-xs">
          Importe a planilha ou cadastre uma entrada na aba &quot;Entradas de lote&quot;.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={cor} onValueChange={(v) => setCor(v ?? TODAS)}>
          <SelectTrigger size="sm" className="w-56" aria-label="Filtrar por cor">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>Todas as cores</SelectItem>
            {cores.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground text-xs tabular-nums">
          {visiveis.length === ordenados.length
            ? `${ordenados.length} lotes`
            : `${visiveis.length} de ${ordenados.length} lotes`}
        </span>
      </div>

      {/* Este div é quem rola, nos DOIS eixos: a página nunca anda de lado.
          É ele também que ancora o cabeçalho e o rodapé grudados.

          O `overflow-visible` no container interno do <Table> não é
          enfeite: aquele wrapper vem com `overflow-x-auto`, e um elemento
          com overflow no eixo X passa a rolar no Y também — o que criaria
          um segundo scroller entre a célula e este div e mataria o
          `sticky top`. Neutralizar ali é o que deixa reaproveitar o
          primitivo em vez de reescrever a tabela. */}
      <div
        data-grade-fios
        className="max-h-[70vh] overflow-auto rounded-lg border [&_[data-slot=table-container]]:overflow-visible"
      >
        <Table className="border-separate border-spacing-0 text-xs">
          <TableHeader className="[&_tr]:border-b-0">
            <TableRow className="hover:bg-transparent">
              {COLUNAS.map((c) => (
                <TableHead
                  key={c.chave}
                  scope="col"
                  className={cn(
                    'bg-muted sticky top-0 z-20 h-8 border-b',
                    CELULA,
                    c.largura,
                    c.numerica && NUMERO,
                    c.chave === 'cor' && `${COR_FIXA} z-30`,
                  )}
                >
                  {c.rotulo}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>

          <TableBody>
            {visiveis.map((l) => (
              <TableRow key={l.id} className="group border-b-0">
                <TableCell
                  className={cn(
                    'bg-background group-hover:bg-muted/50 border-b font-medium',
                    CELULA,
                    COR_FIXA,
                  )}
                >
                  {l.corFornecedorNome}
                </TableCell>
                <TableCell className={cn('border-b', CELULA)}>
                  {l.numeroLote ?? <span className="text-muted-foreground italic">sem lote</span>}
                </TableCell>
                <TableCell className={cn('border-b', CELULA, NUMERO)}>{num(l.caixas)}</TableCell>
                <TableCell
                  className={cn(
                    'border-b',
                    CELULA,
                    NUMERO,
                    l.caixas - l.saldoCaixas === 0 && 'text-muted-foreground',
                  )}
                >
                  {num(l.caixas - l.saldoCaixas)}
                </TableCell>
                <TableCell
                  className={cn(
                    'border-b',
                    CELULA,
                    NUMERO,
                    l.saldoCaixas === 0 && 'text-muted-foreground',
                  )}
                >
                  {num(l.saldoCaixas)}
                </TableCell>
                <TableCell
                  className={cn(
                    'border-b',
                    CELULA,
                    NUMERO,
                    l.saldoPesoKg === 0 && 'text-muted-foreground',
                  )}
                >
                  {num(l.saldoPesoKg)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>

          {/* Rodapé grudado: com 51 linhas e crescendo, o total tem que
              estar à vista enquanto se rola, não no fim da rolagem.
              `tfoot` de verdade — é a semântica certa e imprime junto. */}
          <tfoot>
            <TableRow className="hover:bg-transparent">
              <TableCell
                className={cn(
                  'bg-muted sticky bottom-0 z-30 border-t font-semibold',
                  CELULA,
                  COR_FIXA,
                )}
              >
                TOTAL
              </TableCell>
              <TableCell
                className={cn(
                  'bg-muted text-muted-foreground sticky bottom-0 z-20 border-t',
                  CELULA,
                )}
              >
                {cor === TODAS ? '' : cor}
              </TableCell>
              <TableCell
                className={cn(
                  'bg-muted sticky bottom-0 z-20 border-t font-semibold',
                  CELULA,
                  NUMERO,
                )}
              >
                {num(total.caixas)}
              </TableCell>
              <TableCell
                className={cn(
                  'bg-muted sticky bottom-0 z-20 border-t font-semibold',
                  CELULA,
                  NUMERO,
                )}
              >
                {num(total.retiradaCaixas)}
              </TableCell>
              <TableCell
                className={cn(
                  'bg-muted sticky bottom-0 z-20 border-t font-semibold',
                  CELULA,
                  NUMERO,
                )}
              >
                {num(total.saldoCaixas)}
              </TableCell>
              <TableCell
                className={cn(
                  'bg-muted sticky bottom-0 z-20 border-t font-semibold',
                  CELULA,
                  NUMERO,
                )}
              >
                {num(total.saldoPesoKg)}
              </TableCell>
            </TableRow>
          </tfoot>
        </Table>
      </div>
    </div>
  )
}
