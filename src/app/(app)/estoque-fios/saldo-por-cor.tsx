'use client'

import { ChevronRight, Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { totalGeral, type SaldoDaCor } from '@/lib/fios/saldo'
import { cn } from '@/lib/utils'

// Cartão, não tabela: o galpão abre isso no celular, e uma tabela de 8
// colunas com rolagem horizontal é ilegível na mão de quem está com uma
// caixa de fio no outro braço. A linha inteira é o alvo de toque.

function kg(v: number | string | null | undefined): string {
  if (v == null || v === '') return '—'
  const n = Number(v)
  if (Number.isNaN(n)) return '—'
  return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg`
}

function data(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  if (!ano || !mes || !dia) return iso
  return `${dia}/${mes}/${ano}`
}

function normalizar(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

export function SaldoPorCor({ cores }: { cores: SaldoDaCor[] }) {
  const [busca, setBusca] = useState('')
  const [abertas, setAbertas] = useState<Set<string>>(new Set())

  const filtradas = useMemo(() => {
    const q = normalizar(busca)
    if (!q) return cores
    // Busca também pelo nome do FORNECEDOR e pelo número do lote: quem está
    // no galpão lê a etiqueta da caixa, que traz esses dois — não o nome da
    // cor no nosso catálogo.
    return cores.filter(
      (c) =>
        normalizar(c.corNome).includes(q) ||
        c.lotes.some(
          (l) =>
            normalizar(l.corFornecedorNome).includes(q) ||
            normalizar(l.numeroLote ?? '').includes(q),
        ),
    )
  }, [cores, busca])

  const total = useMemo(() => totalGeral(cores), [cores])

  function alternar(corId: string) {
    setAbertas((atual) => {
      const proximo = new Set(atual)
      if (proximo.has(corId)) proximo.delete(corId)
      else proximo.add(corId)
      return proximo
    })
  }

  if (cores.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-12 text-center">
        <p className="text-muted-foreground text-sm">
          Nenhum lote de fio em estoque.
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          Importe a planilha ou cadastre uma entrada na aba &quot;Entradas de
          lote&quot;.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar cor, fornecedor ou lote…"
          className="pl-9"
          autoComplete="off"
        />
      </div>

      {filtradas.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          Nenhuma cor encontrada para &quot;{busca}&quot;.
        </p>
      ) : (
        <ul className="space-y-2">
          {filtradas.map((cor) => {
            const aberta = abertas.has(cor.corId)
            const esgotada = cor.saldoCaixas <= 0
            return (
              <li key={cor.corId} className="overflow-hidden rounded-lg border">
                <button
                  type="button"
                  onClick={() => alternar(cor.corId)}
                  aria-expanded={aberta}
                  className={cn(
                    'hover:bg-muted/50 flex w-full items-center gap-3 p-3 text-left transition-colors',
                    esgotada && 'opacity-60',
                  )}
                >
                  <ChevronRight
                    className={cn(
                      'text-muted-foreground size-4 shrink-0 transition-transform',
                      aberta && 'rotate-90',
                    )}
                  />
                  {cor.corHex && (
                    <span
                      className="ring-foreground/10 size-6 shrink-0 rounded-full ring-1"
                      style={{ backgroundColor: cor.corHex }}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">
                        {cor.corNome}
                      </span>
                      {esgotada && (
                        <Badge variant="secondary" className="shrink-0">
                          Esgotado
                        </Badge>
                      )}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {cor.lotes.length} lote{cor.lotes.length > 1 ? 's' : ''}
                      {!esgotada &&
                        cor.lotesComSaldo !== cor.lotes.length &&
                        ` · ${cor.lotesComSaldo} com saldo`}
                    </div>
                  </div>
                  <div className="shrink-0 text-right tabular-nums">
                    <div className="font-semibold">{cor.saldoCaixas} cx</div>
                    <div className="text-muted-foreground text-xs">
                      {kg(cor.saldoPesoKg)}
                    </div>
                  </div>
                </button>

                {aberta && (
                  <ul className="divide-y border-t">
                    {cor.lotes.map((l) => (
                      <li
                        key={l.id}
                        className={cn(
                          'bg-muted/20 flex items-center gap-3 px-3 py-2 pl-10 text-sm',
                          l.saldoCaixas <= 0 && 'opacity-55',
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate">
                            {l.numeroLote ?? (
                              <span className="text-muted-foreground italic">
                                sem lote
                              </span>
                            )}
                          </div>
                          <div className="text-muted-foreground truncate text-xs">
                            {l.corFornecedorNome} · entrada {data(l.dataEntrada)}
                          </div>
                        </div>
                        <div className="shrink-0 text-right tabular-nums">
                          <div>{l.saldoCaixas} cx</div>
                          <div className="text-muted-foreground text-xs">
                            {kg(l.saldoPesoKg)}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* O rodapé é o que se confere contra a planilha. */}
      <div className="bg-muted/40 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 rounded-lg border p-3 text-sm">
        <span className="text-muted-foreground text-xs">
          {total.coresComSaldo} de {total.cores} cores com saldo ·{' '}
          {total.lotes} lotes
        </span>
        <span className="font-semibold tabular-nums">
          {total.saldoCaixas.toLocaleString('pt-BR')} caixas ·{' '}
          {kg(total.saldoPesoKg)}
        </span>
      </div>
    </div>
  )
}
