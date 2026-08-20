'use client'

// Busca global do topbar: produtos, OPs, kits e cores. Abre por clique no
// ícone ou Ctrl/Cmd+K, mostra resultados conforme digita e navega pro
// item selecionado.

import { Combine, ListChecks, Package, Palette, Search, type LucideIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'

import { buscarGlobal, type ResultadoBusca } from '@/app/(app)/busca/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

const ICONE: Record<ResultadoBusca['tipo'], LucideIcon> = {
  produto: Package,
  op: ListChecks,
  kit: Combine,
  cor: Palette,
}

const TIPO_LABEL: Record<ResultadoBusca['tipo'], string> = {
  produto: 'Produto',
  op: 'OP',
  kit: 'Kit',
  cor: 'Cor',
}

export function GlobalSearch() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [resultados, setResultados] = useState<ResultadoBusca[]>([])
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  // Atalho Ctrl/Cmd+K abre a busca.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Busca com debounce conforme digita.
  useEffect(() => {
    if (!open) return
    const termo = query.trim()
    const t = setTimeout(() => {
      if (termo.length < 1) {
        setResultados([])
        return
      }
      startTransition(async () => {
        const r = await buscarGlobal(termo)
        setResultados(r)
      })
    }, 200)
    return () => clearTimeout(t)
  }, [query, open])

  function abrir(href: string) {
    setOpen(false)
    setQuery('')
    setResultados([])
    router.push(href)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && resultados.length > 0) {
      e.preventDefault()
      abrir(resultados[0]!.href)
    }
  }

  const termo = query.trim()

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Buscar (Ctrl+K)"
        onClick={() => setOpen(true)}
      >
        <Search />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="top-[12%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg"
        >
          <DialogTitle className="sr-only">Buscar</DialogTitle>
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="text-muted-foreground size-4 shrink-0" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Buscar produto, OP, kit ou cor…"
              className="h-11 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
          </div>

          <div className="max-h-80 overflow-y-auto p-1.5">
            {termo.length === 0 ? (
              <p className="text-muted-foreground px-3 py-6 text-center text-sm">
                Digite pra buscar produtos, OPs, kits e cores.
              </p>
            ) : isPending && resultados.length === 0 ? (
              <p className="text-muted-foreground px-3 py-6 text-center text-sm">Buscando…</p>
            ) : resultados.length === 0 ? (
              <p className="text-muted-foreground px-3 py-6 text-center text-sm">
                Nada encontrado.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {resultados.map((r) => {
                  const Icone = ICONE[r.tipo]
                  return (
                    <li key={`${r.tipo}-${r.id}`}>
                      <button
                        type="button"
                        onClick={() => abrir(r.href)}
                        className="hover:bg-accent flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors"
                      >
                        <Icone className="text-muted-foreground size-4 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{r.titulo}</span>
                          <span className="text-muted-foreground block truncate text-xs">
                            {r.subtitulo}
                          </span>
                        </span>
                        <Badge variant="secondary" className="shrink-0 text-[10px]">
                          {TIPO_LABEL[r.tipo]}
                        </Badge>
                        {r.inativo && (
                          <Badge variant="secondary" className="shrink-0">
                            Inativo
                          </Badge>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
