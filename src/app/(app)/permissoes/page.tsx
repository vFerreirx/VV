import {
  CircleCheck,
  Eye,
  Minus,
  ShieldCheck,
  UserCheck,
  type LucideIcon,
} from 'lucide-react'
import type { Metadata } from 'next'

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { requireRole } from '@/lib/auth/require-auth'
import {
  NIVEL_INFO,
  PERMISSOES,
  ROLE_INFO,
  ROLES,
  type Nivel,
} from '@/lib/auth/permissoes'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Permissões — Vanvest' }

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

export default async function PermissoesPage() {
  await requireRole(['admin'])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Permissões dos cargos</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          O que cada cargo enxerga e pode fazer no sistema. Referência — as
          regras são aplicadas no acesso de cada tela.
        </p>
      </div>

      {/* Cargos */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ROLES.map((role) => (
          <Card key={role}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="text-muted-foreground size-4" />
                {ROLE_INFO[role].label}
              </CardTitle>
              <CardDescription>{ROLE_INFO[role].resumo}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      {/* Legenda de níveis */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-lg border bg-muted/30 px-4 py-3">
        {(Object.keys(NIVEL_INFO) as Nivel[]).map((nivel) => (
          <div key={nivel} className="flex items-center gap-2">
            <NivelMarca nivel={nivel} />
            <span className="text-muted-foreground text-xs">
              {NIVEL_INFO[nivel].descricao}
            </span>
          </div>
        ))}
      </div>

      {/* Matriz — desktop */}
      <div className="hidden overflow-x-auto rounded-lg border lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-56">Área</TableHead>
              {ROLES.map((role) => (
                <TableHead key={role} className="whitespace-nowrap">
                  {ROLE_INFO[role].label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {PERMISSOES.map((secao) => (
              <SecaoLinhas key={secao.titulo} secao={secao} />
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Matriz — mobile/tablet: blocos por área */}
      <div className="space-y-6 lg:hidden">
        {PERMISSOES.map((secao) => (
          <div key={secao.titulo} className="space-y-3">
            <h2 className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
              {secao.titulo}
            </h2>
            {secao.areas.map((a) => (
              <div key={a.area} className="rounded-lg border p-4">
                <div className="font-medium">{a.area}</div>
                <div className="text-muted-foreground text-sm">
                  {a.descricao}
                </div>
                <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
                  {ROLES.map((role) => (
                    <div
                      key={role}
                      className="flex items-center justify-between gap-2 border-t pt-2 text-sm sm:border-t-0 sm:pt-0"
                    >
                      <span className="text-muted-foreground">
                        {ROLE_INFO[role].label}
                      </span>
                      <NivelMarca nivel={a.niveis[role]} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function SecaoLinhas({
  secao,
}: {
  secao: (typeof PERMISSOES)[number]
}) {
  return (
    <>
      <TableRow className="bg-muted/40 hover:bg-muted/40">
        <TableCell
          colSpan={ROLES.length + 1}
          className="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
        >
          {secao.titulo}
        </TableCell>
      </TableRow>
      {secao.areas.map((a) => (
        <TableRow key={a.area}>
          <TableCell>
            <div className="font-medium">{a.area}</div>
            <div className="text-muted-foreground text-xs">{a.descricao}</div>
          </TableCell>
          {ROLES.map((role) => (
            <TableCell key={role}>
              <NivelMarca nivel={a.niveis[role]} />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}
