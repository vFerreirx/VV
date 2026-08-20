'use client'

import { Upload } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { analisarVendasCSVAction, importarVendasCSVAction } from './actions'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ResultadoImport } from '@/lib/vendas/importar-csv'

function formatBRL(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Quantos avisos cabem antes de virar parede de texto. O excedente NÃO some
// calado: some com o número dele à vista, senão o diálogo esconde justamente
// o caso em que há mais coisa errada.
const MAX_AVISOS = 6

function BlocoAvisos({
  titulo,
  itens,
  tom,
}: {
  titulo: string
  itens: string[]
  tom: 'ignorada' | 'atencao'
}) {
  if (itens.length === 0) return null
  const excedente = itens.length - MAX_AVISOS
  return (
    <div
      className={
        tom === 'ignorada'
          ? 'border-destructive/40 bg-destructive/5 text-destructive rounded-lg border p-3 text-xs'
          : 'rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400'
      }
    >
      <div className="mb-1 font-medium">
        {itens.length} {titulo}
      </div>
      <ul className="list-disc space-y-0.5 pl-4">
        {itens.slice(0, MAX_AVISOS).map((a, i) => (
          <li key={i}>{a}</li>
        ))}
      </ul>
      {excedente > 0 && (
        <div className="mt-1 opacity-80">
          … e mais {excedente} não exibido{excedente > 1 ? 's' : ''}.
        </div>
      )}
    </div>
  )
}

function Avisos({ res }: { res: ResultadoImport }) {
  return (
    <>
      <BlocoAvisos
        tom="ignorada"
        titulo={
          res.ignoradas.length === 1
            ? 'linha ignorada — o dado não entrou:'
            : 'linhas ignoradas — o dado não entrou:'
        }
        itens={res.ignoradas}
      />
      <BlocoAvisos
        tom="atencao"
        titulo={
          res.atencoes.length === 1
            ? 'aviso de atenção — a linha entrou:'
            : 'avisos de atenção — as linhas entraram:'
        }
        itens={res.atencoes}
      />
    </>
  )
}

function dataLonga(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function ImportarCSVDialog() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [texto, setTexto] = useState('')
  const [res, setRes] = useState<ResultadoImport | null>(null)
  const [analisando, startAnalise] = useTransition()
  const [importando, startImport] = useTransition()

  function reset() {
    setTexto('')
    setRes(null)
  }

  async function aoEscolherArquivo(file: File) {
    const conteudo = await file.text()
    setTexto(conteudo)
    startAnalise(async () => {
      const r = await analisarVendasCSVAction(conteudo)
      setRes(r)
    })
  }

  function importar() {
    startImport(async () => {
      const r = await importarVendasCSVAction(texto)
      if (!r.success) {
        toast.error(r.error)
        return
      }
      toast.success(r.message ?? 'Importado')
      router.refresh()
      setOpen(false)
      reset()
    })
  }

  const temDias = res !== null && res.dias.length > 0

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Upload />
        Importar CSV
      </Button>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void aoEscolherArquivo(f)
          e.target.value = ''
        }}
      />

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) {
            setOpen(false)
            reset()
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Importar vendas (CSV)</DialogTitle>
            <DialogDescription>
              Cada dia do arquivo substitui o registro daquele dia. Confira a prévia antes de
              importar.
            </DialogDescription>
          </DialogHeader>

          {res === null ? (
            <div className="space-y-2 py-2">
              <Button onClick={() => inputRef.current?.click()} disabled={analisando}>
                {analisando ? 'Lendo arquivo…' : 'Selecionar arquivo CSV'}
              </Button>
              <p className="text-muted-foreground text-xs">
                Formato: data ; marketplace ; conta ; quantidade ; valor (R$).
              </p>
            </div>
          ) : !temDias ? (
            <div className="space-y-3 py-2 text-sm">
              <p className="text-destructive font-medium">
                Nenhuma venda válida encontrada no arquivo.
              </p>
              <Avisos res={res} />
              <Button variant="outline" onClick={reset}>
                Escolher outro
              </Button>
            </div>
          ) : (
            <div className="max-h-[50vh] space-y-3 overflow-y-auto">
              {/* Antes da lista de dias, de propósito: um mês inteiro são 31
                  cartões, e no fim da rolagem o aviso não é lido por ninguém. */}
              <Avisos res={res} />
              {res.dias.map((d) => (
                <div key={d.data} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium capitalize">{dataLonga(d.data)}</span>
                    <span className="text-muted-foreground text-xs">{d.contas.length} contas</span>
                  </div>
                  <div className="mt-1 text-sm tabular-nums">
                    {d.totalQtd} vendas ·{' '}
                    <span className="font-medium">{formatBRL(d.totalFat)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {temDias && (
            <DialogFooter>
              <Button variant="outline" onClick={reset} disabled={importando}>
                Escolher outro
              </Button>
              <Button onClick={importar} disabled={importando}>
                {importando ? 'Importando…' : 'Importar'}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
