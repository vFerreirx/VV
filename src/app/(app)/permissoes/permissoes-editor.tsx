'use client'

import {
  CircleCheck,
  Eye,
  Lock,
  Minus,
  UserCheck,
  type LucideIcon,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { salvarPermissoesAction, type ItemPermissao } from './actions'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  AREAS,
  chaveOverride,
  nivelConcedido,
  NIVEL_INFO,
  ROLE_INFO,
  ROLES,
  ROLES_EDITAVEIS,
  type AreaKey,
  type Nivel,
  type OverridesAcesso,
  type Role,
} from '@/lib/auth/permissoes'
import { cn } from '@/lib/utils'

const NIVEL_ICON: Record<Nivel, LucideIcon> = {
  total: CircleCheck,
  ver: Eye,
  proprio: UserCheck,
  nenhum: Minus,
}

const NIVEL_CLASSE: Record<Nivel, string> = {
  total: 'text-emerald-600 dark:text-emerald-400',
  ver: 'text-muted-foreground',
  proprio: 'text-amber-600 dark:text-amber-400',
  nenhum: 'text-muted-foreground/35',
}

function NivelMarca({ nivel }: { nivel: Nivel }) {
  const Icon = NIVEL_ICON[nivel]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-sm font-medium',
        NIVEL_CLASSE[nivel],
      )}
    >
      <Icon className="size-4 shrink-0" />
      {NIVEL_INFO[nivel].label}
    </span>
  )
}

const EDITAVEIS = new Set<Role>(ROLES_EDITAVEIS)

function estadoInicial(overrides: OverridesAcesso): Record<string, boolean> {
  const m: Record<string, boolean> = {}
  for (const area of AREAS) {
    if (!area.editavel) continue
    for (const role of ROLES_EDITAVEIS) {
      const key = chaveOverride(role, area.key)
      const padrao = area.nivelPadrao[role] !== 'nenhum'
      m[key] = overrides[key] ?? padrao
    }
  }
  return m
}

const SECOES = [...new Set(AREAS.map((a) => a.secao))]

export function PermissoesEditor({
  overrides,
}: {
  overrides: OverridesAcesso
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const inicial = useMemo(() => estadoInicial(overrides), [overrides])
  const [valores, setValores] = useState<Record<string, boolean>>(inicial)
  const [baseline, setBaseline] = useState<Record<string, boolean>>(inicial)

  const sujo = useMemo(
    () => Object.keys(valores).some((k) => valores[k] !== baseline[k]),
    [valores, baseline],
  )

  function toggle(role: Role, area: AreaKey, liberado: boolean) {
    setValores((p) => ({ ...p, [chaveOverride(role, area)]: liberado }))
  }

  function salvar() {
    const itens: ItemPermissao[] = []
    for (const area of AREAS) {
      if (!area.editavel) continue
      for (const role of ROLES_EDITAVEIS) {
        itens.push({
          role,
          area: area.key,
          liberado: valores[chaveOverride(role, area.key)] ?? false,
        })
      }
    }
    startTransition(async () => {
      const r = await salvarPermissoesAction(itens)
      if (!r.success) {
        toast.error(r.error)
        return
      }
      toast.success(r.message ?? 'Salvo')
      setBaseline(valores)
      router.refresh()
    })
  }

  function descartar() {
    setValores(baseline)
  }

  return (
    <div className="space-y-6 pb-20">
      {SECOES.map((secao) => (
        <div key={secao} className="space-y-3">
          <h2 className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
            {secao}
          </h2>
          <div className="space-y-3">
            {AREAS.filter((a) => a.secao === secao).map((area) => (
              <div key={area.key} className="rounded-lg border p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">{area.label}</div>
                    <div className="text-muted-foreground text-sm">
                      {area.descricao}
                    </div>
                  </div>
                  {!area.editavel && (
                    <span className="text-muted-foreground/60 inline-flex items-center gap-1 text-xs">
                      <Lock className="size-3" />
                      fixo
                    </span>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {ROLES.map((role) => {
                    const editavel = area.editavel && EDITAVEIS.has(role)
                    const key = chaveOverride(role, area.key)
                    const liberado = valores[key] ?? false
                    const nivelMostrado: Nivel = editavel
                      ? liberado
                        ? nivelConcedido(area, role)
                        : 'nenhum'
                      : role === 'admin'
                        ? 'total'
                        : area.nivelPadrao[role]
                    return (
                      <div
                        key={role}
                        className="flex items-center justify-between gap-3 border-t pt-2 sm:border-t-0 sm:pt-0"
                      >
                        <span className="text-muted-foreground text-sm">
                          {ROLE_INFO[role].label}
                        </span>
                        {editavel ? (
                          <div className="flex items-center gap-2">
                            <span className="w-20 text-right">
                              <NivelMarca nivel={nivelMostrado} />
                            </span>
                            <Switch
                              checked={liberado}
                              onCheckedChange={(c) =>
                                toggle(role, area.key, c === true)
                              }
                              disabled={isPending}
                            />
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            <NivelMarca nivel={nivelMostrado} />
                            <Lock className="text-muted-foreground/40 size-3" />
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Barra de salvar */}
      {sujo && (
        <div className="bg-background/90 fixed inset-x-0 bottom-0 z-20 border-t backdrop-blur-md">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 pl-[max(1rem,var(--sa-left,env(safe-area-inset-left)))] pr-[max(1rem,var(--sa-right,env(safe-area-inset-right)))]">
            <span className="text-muted-foreground text-sm">
              Há alterações não salvas.
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={descartar}
                disabled={isPending}
              >
                Descartar
              </Button>
              <Button onClick={salvar} disabled={isPending}>
                {isPending ? 'Salvando…' : 'Salvar permissões'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
