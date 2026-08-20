'use client'

import { CircleCheck, Eye, Lock, Minus, UserCheck, type LucideIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { salvarPermissoesAction, type ItemPermissao } from './actions'
import { Button } from '@/components/ui/button'
import {
  AREAS,
  chaveOverride,
  NIVEL_INFO,
  NIVEL_OPCOES,
  opcaoDoNivel,
  ROLE_INFO,
  ROLES,
  ROLES_EDITAVEIS,
  type AreaKey,
  type Nivel,
  type OpcaoNivel,
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
      className={cn('inline-flex items-center gap-1.5 text-sm font-medium', NIVEL_CLASSE[nivel])}
    >
      <Icon className="size-4 shrink-0" />
      {NIVEL_INFO[nivel].label}
    </span>
  )
}

const EDITAVEIS = new Set<Role>(ROLES_EDITAVEIS)

function estadoInicial(overrides: OverridesAcesso): Record<string, OpcaoNivel> {
  const m: Record<string, OpcaoNivel> = {}
  for (const area of AREAS) {
    if (!area.editavel) continue
    for (const role of ROLES_EDITAVEIS) {
      const key = chaveOverride(role, area.key)
      m[key] = opcaoDoNivel(overrides[key] ?? area.nivelPadrao[role])
    }
  }
  return m
}

const SECOES = [...new Set(AREAS.map((a) => a.secao))]

export function PermissoesEditor({ overrides }: { overrides: OverridesAcesso }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const inicial = useMemo(() => estadoInicial(overrides), [overrides])
  const [valores, setValores] = useState<Record<string, OpcaoNivel>>(inicial)
  const [baseline, setBaseline] = useState<Record<string, OpcaoNivel>>(inicial)

  const sujo = useMemo(
    () => Object.keys(valores).some((k) => valores[k] !== baseline[k]),
    [valores, baseline],
  )

  function definir(role: Role, area: AreaKey, nivel: OpcaoNivel) {
    setValores((p) => ({ ...p, [chaveOverride(role, area)]: nivel }))
  }

  function salvar() {
    const itens: ItemPermissao[] = []
    for (const area of AREAS) {
      if (!area.editavel) continue
      for (const role of ROLES_EDITAVEIS) {
        itens.push({
          role,
          area: area.key,
          nivel: valores[chaveOverride(role, area.key)] ?? 'nenhum',
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

  return (
    <div className="space-y-6 pb-20">
      {SECOES.map((secao) => (
        <div key={secao} className="space-y-3">
          <h2 className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
            {secao}
          </h2>
          <div className="vv-stagger space-y-3">
            {AREAS.filter((a) => a.secao === secao).map((area) => (
              <div key={area.key} className="rounded-lg border p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">{area.label}</div>
                    <div className="text-muted-foreground text-sm">{area.descricao}</div>
                  </div>
                  {!area.editavel && (
                    <span className="text-muted-foreground/60 inline-flex items-center gap-1 text-xs">
                      <Lock className="size-3" />
                      fixo
                    </span>
                  )}
                </div>

                <div className="mt-3 space-y-2">
                  {ROLES.map((role) => {
                    const editavel = area.editavel && EDITAVEIS.has(role)
                    const key = chaveOverride(role, area.key)
                    const valor = valores[key] ?? 'nenhum'
                    const nivelFixo: Nivel = role === 'admin' ? 'total' : area.nivelPadrao[role]
                    return (
                      <div
                        key={role}
                        className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 first:border-t-0 first:pt-0"
                      >
                        <span className="text-muted-foreground text-sm">
                          {ROLE_INFO[role].label}
                        </span>
                        {editavel ? (
                          <SegNivel
                            valor={valor}
                            disabled={isPending}
                            onChange={(n) => definir(role, area.key, n)}
                          />
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            <NivelMarca nivel={nivelFixo} />
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

      {sujo && (
        <div className="bg-background/90 fixed inset-x-0 bottom-0 z-20 border-t backdrop-blur-md">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 pr-[max(1rem,var(--sa-right,env(safe-area-inset-right)))] pl-[max(1rem,var(--sa-left,env(safe-area-inset-left)))]">
            <span className="text-muted-foreground text-sm">Há alterações não salvas.</span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setValores(baseline)} disabled={isPending}>
                Descartar
              </Button>
              <Button loading={isPending} onClick={salvar} disabled={isPending}>
                {'Salvar permissões'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Controle segmentado de 3 opções: Desativado / Só ver / Controle total.
function SegNivel({
  valor,
  disabled,
  onChange,
}: {
  valor: OpcaoNivel
  disabled: boolean
  onChange: (n: OpcaoNivel) => void
}) {
  return (
    <div className="bg-muted/60 inline-flex shrink-0 rounded-md p-0.5">
      {NIVEL_OPCOES.map((o) => {
        const ativo = valor === o.value
        return (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            aria-pressed={ativo}
            title={o.descricao}
            onClick={() => onChange(o.value)}
            className={cn(
              'rounded px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60',
              ativo
                ? o.value === 'nenhum'
                  ? 'bg-background text-muted-foreground shadow-sm'
                  : o.value === 'ver'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
