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
              Cada dia do arquivo substitui o registro daquele dia. Confira a
              prévia antes de importar.
            </DialogDescription>
          </DialogHeader>

          {res === null ? (
            <div className="space-y-2 py-2">
              <Button
                onClick={() => inputRef.current?.click()}
                disabled={analisando}
              >
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
              {res.avisos.length > 0 && (
                <ul className="text-muted-foreground list-disc space-y-0.5 pl-4 text-xs">
                  {res.avisos.slice(0, 8).map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              )}
              <Button variant="outline" onClick={reset}>
                Escolher outro
              </Button>
            </div>
          ) : (
            <div className="max-h-[50vh] space-y-3 overflow-y-auto">
              {res.dias.map((d) => (
                <div key={d.data} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium capitalize">
                      {dataLonga(d.data)}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {d.contas.length} contas
                    </span>
                  </div>
                  <div className="mt-1 text-sm tabular-nums">
                    {d.totalQtd} vendas ·{' '}
                    <span className="font-medium">{formatBRL(d.totalFat)}</span>
                  </div>
                </div>
              ))}

              {res.avisos.length > 0 && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
                  <div className="mb-1 font-medium">
                    {res.avisos.length} linha(s) ignorada(s):
                  </div>
                  <ul className="list-disc space-y-0.5 pl-4">
                    {res.avisos.slice(0, 6).map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
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
