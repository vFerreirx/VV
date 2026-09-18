'use client'

import { PackageMinus } from 'lucide-react'
import { useMemo } from 'react'

import type { CorFornecedorItem, LoteFioItem } from './actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { resumoPorCor, type EstadoDaCor } from '@/lib/fios/saldo'
import { cn } from '@/lib/utils'

// A MANCHETE DA TELA: "quanto tem de cada cor?".
//
// Era a pergunta que a tela não respondia. Ela abria no livro de entradas —
// 51 linhas importadas num dia só, quatro colunas de travessão — e o saldo
// por cor só existia somado de cabeça, lote a lote, na grade. Quem chega
// aqui quer saber se tem Cáqui, e só depois em que partidas ele está.
//
// A grade continua logo abaixo, igual: é o espelho da planilha, e é por ela
// que se confere. As duas contas saem da MESMA lista de lotes, então a soma
// daqui bate com a linha de TOTAL do rodapé de lá — se um dia divergirem, é
// porque alguém passou listas diferentes pras duas.

const ROTULO: Record<EstadoDaCor, string> = {
  acabou: 'Acabou',
  abaixo: 'Abaixo do mínimo',
  ok: 'Ok',
}

function num(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

export function ResumoPorCor({
  lotes,
  coresFornecedor,
  corFiltrada,
  onFiltrarCor,
  podeEditar,
  onRegistrarRetirada,
  onIrParaCores,
}: {
  lotes: LoteFioItem[]
  coresFornecedor: CorFornecedorItem[]
  /** A cor do filtro da aba (compartilhado com a grade), ou null. */
  corFiltrada: string | null
  onFiltrarCor: (nome: string | null) => void
  podeEditar: boolean
  onRegistrarRetirada: () => void
  onIrParaCores: () => void
}) {
  // O mínimo vem do cadastro da cor, não dos lotes: cor zerada não tem lote
  // nenhum com saldo, e é justamente a que mais precisa aparecer.
  const minimos = useMemo(
    () =>
      new Map(coresFornecedor.map((c) => [c.id, c.minimoCaixas ?? null])),
    [coresFornecedor],
  )
  const linhas = useMemo(() => resumoPorCor(lotes, minimos), [lotes, minimos])

  const visiveis =
    corFiltrada === null
      ? linhas
      : linhas.filter((l) => l.corFornecedorNome === corFiltrada)

  const comMinimo = linhas.filter((l) => l.minimoCaixas !== null).length

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-medium">Quanto tem de cada cor</h2>
          <p className="text-muted-foreground text-xs">
            Saldo somado das partidas.{' '}
            {comMinimo === 0 ? (
              <>
                Nenhuma cor tem mínimo cadastrado —{' '}
                <button
                  type="button"
                  className="underline underline-offset-2"
                  onClick={onIrParaCores}
                >
                  defina em Cores do fornecedor
                </button>{' '}
                pra ser avisado quando faltar.
              </>
            ) : (
              <>
                {comMinimo} de {linhas.length}{' '}
                {linhas.length === 1 ? 'cor acompanhada' : 'cores acompanhadas'}{' '}
                por mínimo.
              </>
            )}
          </p>
        </div>
        {podeEditar && (
          <Button size="sm" onClick={onRegistrarRetirada}>
            <PackageMinus />
            Registrar retirada
          </Button>
        )}
      </div>

      {linhas.length === 0 ? (
        <div className="rounded-lg border border-dashed py-8 text-center">
          <p className="text-muted-foreground text-sm">
            Nenhum lote de fio cadastrado.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cor</TableHead>
                <TableHead className="w-28 text-right">Caixas</TableHead>
                <TableHead className="w-32 text-right">Kg</TableHead>
                <TableHead className="w-24 text-right">Mínimo</TableHead>
                <TableHead className="w-44">Situação</TableHead>
                <TableHead className="w-24 text-right">Partidas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.map((l) => (
                <TableRow
                  key={l.corFornecedorId}
                  // A linha filtra a grade de baixo: quem viu que o Cáqui
                  // está acabando quer ver EM QUE PARTIDAS ele está, e esse é
                  // o próximo passo, não uma tela nova.
                  onClick={() =>
                    onFiltrarCor(
                      corFiltrada === l.corFornecedorNome
                        ? null
                        : l.corFornecedorNome,
                    )
                  }
                  className={cn(
                    'hover:bg-accent/50 cursor-pointer',
                    l.estado === 'acabou' && 'bg-destructive/5',
                  )}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {l.corHex && (
                        <span
                          className="ring-foreground/10 size-3.5 shrink-0 rounded border ring-1"
                          style={{ backgroundColor: l.corHex }}
                        />
                      )}
                      <span>
                        {l.corFornecedorNome}
                        <span className="text-muted-foreground font-normal">
                          {' '}
                          → {l.corNome}
                        </span>
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {l.caixas}
                  </TableCell>
                  {/* O kg é REFERÊNCIA, não gatilho: o que se conta na
                      prateleira é caixa. */}
                  <TableCell className="text-muted-foreground text-right tabular-nums">
                    {num(l.pesoKg)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right tabular-nums">
                    {l.minimoCaixas == null ? '—' : l.minimoCaixas}
                  </TableCell>
                  <TableCell>
                    {l.estado === 'ok' ? (
                      <span className="text-muted-foreground text-xs">
                        {l.minimoCaixas == null ? 'sem mínimo' : ROTULO.ok}
                      </span>
                    ) : (
                      <Badge
                        variant={
                          l.estado === 'acabou' ? 'destructive' : 'secondary'
                        }
                      >
                        {ROTULO[l.estado]}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right tabular-nums">
                    {l.lotes}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  )
}
