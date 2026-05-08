'use client'

import { Search } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Maquina, User } from '@/lib/db/schema'
import {
  CANAL_LABEL_CURTO,
  canalValues,
} from '@/lib/validators/ordens'

type Props = {
  maquinas: Array<Pick<Maquina, 'id' | 'codigo' | 'nome'>>
  responsaveis: Array<Pick<User, 'id' | 'nome' | 'role'>>
  filtrosIniciais: {
    q?: string
    canal?: string
    maquinaId?: string
    responsavelId?: string
  }
}

export function ProducaoFiltros({
  maquinas,
  responsaveis,
  filtrosIniciais,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [busca, setBusca] = useState(filtrosIniciais.q ?? '')

  function aplicar(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (!v || v === 'todos' || v === 'todas') params.delete(k)
      else params.set(k, v)
    }
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          aplicar({ q: busca.trim() || undefined })
        }}
        className="flex flex-1 items-center gap-2 sm:max-w-xs"
      >
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            placeholder="Buscar OP, SKU ou produto…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-8"
            disabled={isPending}
          />
        </div>
        <Button type="submit" variant="outline" size="sm" disabled={isPending}>
          Buscar
        </Button>
      </form>

      <Select
        value={filtrosIniciais.canal ?? 'todos'}
        onValueChange={(v) => aplicar({ canal: v ?? undefined })}
      >
        <SelectTrigger size="sm" className="min-w-[10rem]">
          <SelectValue placeholder="Canal" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todos">Todos canais</SelectItem>
          {canalValues.map((c) => (
            <SelectItem key={c} value={c}>
              {CANAL_LABEL_CURTO[c]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filtrosIniciais.maquinaId ?? 'todas'}
        onValueChange={(v) => aplicar({ maquinaId: v ?? undefined })}
      >
        <SelectTrigger size="sm" className="min-w-[10rem]">
          <SelectValue placeholder="Máquina" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todas">Todas máquinas</SelectItem>
          {maquinas.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              <span className="font-mono text-xs">{m.codigo}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filtrosIniciais.responsavelId ?? 'todos'}
        onValueChange={(v) => aplicar({ responsavelId: v ?? undefined })}
      >
        <SelectTrigger size="sm" className="min-w-[12rem]">
          <SelectValue placeholder="Responsável" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todos">Todos responsáveis</SelectItem>
          {responsaveis.map((r) => (
            <SelectItem key={r.id} value={r.id}>
              {r.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
