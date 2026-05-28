'use client'

import { format, formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { AlertTriangle, Bell, CircleAlert, Wrench } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'

import { listarNotificacoes, type Notificacao } from '@/app/(app)/notificacoes/actions'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { createClient as createBrowserSupabase } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

export function NotificationBell({
  initial,
}: {
  initial: Notificacao[]
}) {
  const router = useRouter()
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>(initial)
  const [, startTransition] = useTransition()

  const count = notificacoes.length

  // Realtime: quando ordens_producao ou maquinas mudam, re-fetcha as
  // notificações (que são derivadas do estado atual).
  useEffect(() => {
    const supabase = createBrowserSupabase()
    const channel = supabase
      .channel('notificacoes-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ordens_producao' },
        () => refetch(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'maquinas' },
        () => refetch(),
      )
      .subscribe()

    function refetch() {
      startTransition(async () => {
        const lista = await listarNotificacoes()
        setNotificacoes(lista)
        router.refresh()
      })
    }

    return () => {
      supabase.removeChannel(channel)
    }
  }, [router])

  // Limita o que mostra no popover; conta total fica no badge.
  const visiveis = notificacoes.slice(0, 15)
  const restantes = notificacoes.length - visiveis.length

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Notificações${count > 0 ? ` (${count})` : ''}`}
            className="relative"
          />
        }
      >
        <Bell />
        {count > 0 && (
          <span
            className={cn(
              'bg-destructive text-destructive-foreground absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-content-center rounded-full px-1 text-[10px] font-semibold leading-none tabular-nums',
            )}
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-80 p-0 sm:w-96"
      >
        <div className="border-b px-4 py-2.5">
          <h3 className="text-sm font-medium">Notificações</h3>
          <p className="text-muted-foreground text-xs">
            {count === 0
              ? 'Nada exige sua atenção agora.'
              : `${count} alerta${count === 1 ? '' : 's'} ativo${count === 1 ? '' : 's'}`}
          </p>
        </div>
        {count === 0 ? (
          <div className="px-4 py-8 text-center">
            <Bell className="text-muted-foreground mx-auto mb-2 size-6 opacity-40" />
            <p className="text-muted-foreground text-xs">Tudo em dia ✓</p>
          </div>
        ) : (
          <ul className="max-h-96 divide-y overflow-y-auto">
            {visiveis.map((n) => (
              <NotificacaoItem key={n.id} n={n} />
            ))}
            {restantes > 0 && (
              <li className="text-muted-foreground px-4 py-2 text-center text-xs">
                + {restantes} alerta{restantes === 1 ? '' : 's'} (refine os filtros)
              </li>
            )}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}

function NotificacaoItem({ n }: { n: Notificacao }) {
  const Icon = n.tipo === 'op_atrasada' ? AlertTriangle : Wrench
  const ago = formatDistanceToNow(new Date(n.referenciaEm), {
    addSuffix: false,
    locale: ptBR,
  })
  const dataAbsoluta = format(new Date(n.referenciaEm), "dd/MM 'às' HH:mm", {
    locale: ptBR,
  })

  return (
    <li>
      <Link
        href={n.href}
        className={cn(
          'hover:bg-accent flex gap-3 px-4 py-3 transition-colors',
          n.severidade === 'critico' && 'bg-destructive/5',
        )}
      >
        <div
          className={cn(
            'mt-0.5 shrink-0 rounded-md p-1.5',
            n.severidade === 'critico'
              ? 'bg-destructive/15 text-destructive'
              : 'bg-amber-500/15 text-amber-600',
          )}
        >
          {n.severidade === 'critico' ? (
            <CircleAlert className="size-3.5" />
          ) : (
            <Icon className="size-3.5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{n.titulo}</div>
          <div className="text-muted-foreground truncate text-xs">
            {n.descricao}
          </div>
          <div
            className="text-muted-foreground/70 mt-0.5 text-[11px]"
            title={dataAbsoluta}
          >
            há {ago}
          </div>
        </div>
      </Link>
    </li>
  )
}
