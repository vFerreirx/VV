'use client'

import { Cog, LogOut } from 'lucide-react'
import Link from 'next/link'
import { useTransition } from 'react'

import { logoutAction } from '@/app/(auth)/login/actions'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { User } from '@/lib/db/schema'

const ROLE_LABEL: Record<User['role'], string> = {
  admin: 'Administrador',
  gerente_producao: 'Gerente de produção',
  operador: 'Operador',
  estoquista: 'Estoquista',
  vendas: 'Vendas',
}

function initials(nome: string) {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

export function UserMenu({ user }: { user: Pick<User, 'nome' | 'email' | 'role'> }) {
  const [isPending, startTransition] = useTransition()

  const handleLogout = () => {
    startTransition(async () => {
      await logoutAction()
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm" className="gap-2">
            <Avatar className="size-7">
              <AvatarFallback className="text-xs">{initials(user.nome)}</AvatarFallback>
            </Avatar>
            <span className="hidden text-sm font-medium md:inline">{user.nome}</span>
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">{user.nome}</span>
          <span className="text-muted-foreground text-xs font-normal">
            {ROLE_LABEL[user.role]}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/configuracoes" />}>
          <Cog className="size-4" />
          Configurações
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} disabled={isPending}>
          <LogOut className="size-4" />
          {isPending ? 'Saindo…' : 'Sair'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
