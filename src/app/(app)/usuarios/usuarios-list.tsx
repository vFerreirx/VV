'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Ban, KeyRound, Pencil, Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  Controller,
  useForm,
  useWatch,
  type Resolver,
} from 'react-hook-form'
import { toast } from 'sonner'

import {
  atualizarUsuarioAction,
  criarUsuarioAction,
  excluirUsuarioAction,
  resetSenhaAction,
} from './actions'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { User } from '@/lib/db/schema'
import { cn } from '@/lib/utils'
import {
  OPERADOR_CORES,
  ROLE_LABEL,
  atualizarUsuarioSchema,
  criarUsuarioSchema,
  resetSenhaSchema,
  userRoleValues,
  type AtualizarUsuarioInput,
  type CriarUsuarioInput,
  type ResetSenhaInput,
} from '@/lib/validators/usuarios'

const ROLE_BADGE: Record<User['role'], string> = {
  admin: 'bg-purple-500/15 text-purple-700 dark:text-purple-300',
  gerente_producao: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  operador: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  estoquista: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  vendas: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
}

type Props = {
  usuarios: User[]
  selfId: string
}

export function UsuariosList({ usuarios, selfId }: Props) {
  const [criando, setCriando] = useState(false)
  const [editando, setEditando] = useState<User | null>(null)
  const [resetando, setResetando] = useState<User | null>(null)
  const [excluindo, setExcluindo] = useState<User | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCriando(true)}>
          <Plus />
          Novo usuário
        </Button>
      </div>

      {/* Desktop */}
      <div className="hidden rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12" />
              <TableHead>Nome</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {usuarios.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <Avatar
                    className="size-7"
                    style={
                      u.cor ? { boxShadow: `0 0 0 2px ${u.cor}` } : undefined
                    }
                  >
                    <AvatarFallback className="text-[10px]">
                      {initials(u.nome)}
                    </AvatarFallback>
                  </Avatar>
                </TableCell>
                <TableCell className="font-medium">
                  {u.nome}
                  {u.id === selfId && (
                    <span className="text-muted-foreground ml-1 text-xs">(você)</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground font-mono text-xs">
                  {u.username}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {u.telefone ?? '—'}
                </TableCell>
                <TableCell>
                  <Badge className={ROLE_BADGE[u.role]}>
                    {ROLE_LABEL[u.role]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={u.ativo ? 'default' : 'secondary'}>
                    {u.ativo ? 'Ativo' : 'Inativo'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => setEditando(u)}
                      aria-label="Editar"
                    >
                      <Pencil />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => setResetando(u)}
                      aria-label="Resetar senha"
                    >
                      <KeyRound />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => setExcluindo(u)}
                      disabled={u.id === selfId}
                      aria-label="Excluir"
                    >
                      <Trash2 className="text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile / tablet retrato */}
      <div className="space-y-3 md:hidden">
        {usuarios.map((u) => (
          <div key={u.id} className="rounded-lg border p-4">
            <div className="flex items-start gap-3">
              <Avatar
                className="size-9 shrink-0"
                style={u.cor ? { boxShadow: `0 0 0 2px ${u.cor}` } : undefined}
              >
                <AvatarFallback>{initials(u.nome)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{u.nome}</span>
                  {u.id === selfId && (
                    <span className="text-muted-foreground text-xs">(você)</span>
                  )}
                  <Badge variant={u.ativo ? 'default' : 'secondary'}>
                    {u.ativo ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>
                <div className="text-muted-foreground truncate font-mono text-xs">
                  {u.username}
                </div>
                <div className="mt-1">
                  <Badge className={ROLE_BADGE[u.role]}>
                    {ROLE_LABEL[u.role]}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-1">
              <Button size="sm" variant="ghost" onClick={() => setEditando(u)}>
                <Pencil />
                Editar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setResetando(u)}>
                <KeyRound />
                Senha
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setExcluindo(u)}
                disabled={u.id === selfId}
              >
                <Trash2 className="text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <CriarUsuarioDialog open={criando} onClose={() => setCriando(false)} />
      <EditarUsuarioDialog
        usuario={editando}
        onClose={() => setEditando(null)}
        selfId={selfId}
      />
      <ResetSenhaDialog
        usuario={resetando}
        onClose={() => setResetando(null)}
      />
      <ExcluirUsuarioDialog
        usuario={excluindo}
        onClose={() => setExcluindo(null)}
      />
    </div>
  )
}

function initials(nome: string): string {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

// -----------------------------------------------------------------
// Dialog: criar
// -----------------------------------------------------------------

function CriarUsuarioDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const form = useForm<CriarUsuarioInput>({
    resolver: zodResolver(criarUsuarioSchema) as unknown as Resolver<CriarUsuarioInput>,
    defaultValues: {
      nome: '',
      username: '',
      telefone: '',
      role: 'operador',
      cor: undefined,
      senha: '',
    },
  })

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const result = await criarUsuarioAction(values)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'Criado')
      router.refresh()
      onClose()
      form.reset()
    })
  })

  const errs = form.formState.errors

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose()
          form.reset()
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo usuário</DialogTitle>
          <DialogDescription>
            Defina nome, usuário de login e senha inicial. O usuário pode
            trocar a senha depois em Configurações.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          <FieldRow label="Nome" id="cu-nome" error={errs.nome?.message} required>
            <Input
              id="cu-nome"
              autoFocus
              disabled={isPending}
              {...form.register('nome')}
            />
          </FieldRow>
          <FieldRow
            label="Usuário"
            id="cu-username"
            error={errs.username?.message}
            required
          >
            <Input
              id="cu-username"
              type="text"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="ex: joao.silva"
              disabled={isPending}
              {...form.register('username')}
            />
          </FieldRow>
          <FieldRow label="Telefone" id="cu-tel" error={errs.telefone?.message}>
            <Input
              id="cu-tel"
              disabled={isPending}
              {...form.register('telefone')}
            />
          </FieldRow>
          <FieldRow label="Role" id="cu-role" error={errs.role?.message} required>
            <Controller
              control={form.control}
              name="role"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(v) => v && field.onChange(v)}
                  disabled={isPending}
                >
                  <SelectTrigger id="cu-role" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {userRoleValues.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FieldRow>
          <FieldRow
            label="Cor no kanban"
            id="cu-cor"
            error={errs.cor?.message}
          >
            <Controller
              control={form.control}
              name="cor"
              render={({ field }) => (
                <CorPicker
                  value={field.value ?? undefined}
                  onChange={field.onChange}
                  disabled={isPending}
                />
              )}
            />
          </FieldRow>
          <FieldRow
            label="Senha inicial"
            id="cu-senha"
            error={errs.senha?.message}
            required
          >
            <Input
              id="cu-senha"
              type="password"
              disabled={isPending}
              {...form.register('senha')}
            />
          </FieldRow>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onClose()
                form.reset()
              }}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Criando…' : 'Criar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// -----------------------------------------------------------------
// Dialog: editar
// -----------------------------------------------------------------

function EditarUsuarioDialog({
  usuario,
  selfId,
  onClose,
}: {
  usuario: User | null
  selfId: string
  onClose: () => void
}) {
  return (
    <Dialog open={usuario !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {usuario && (
          <EditarBody
            key={usuario.id}
            usuario={usuario}
            selfId={selfId}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function EditarBody({
  usuario,
  selfId,
  onClose,
}: {
  usuario: User
  selfId: string
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const isSelf = usuario.id === selfId

  const form = useForm<AtualizarUsuarioInput>({
    resolver: zodResolver(
      atualizarUsuarioSchema,
    ) as unknown as Resolver<AtualizarUsuarioInput>,
    defaultValues: {
      nome: usuario.nome,
      telefone: usuario.telefone ?? '',
      role: usuario.role,
      cor: usuario.cor ?? undefined,
      ativo: usuario.ativo,
    },
  })

  const ativo = useWatch({ control: form.control, name: 'ativo' })

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const result = await atualizarUsuarioAction(usuario.id, values)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'Salvo')
      router.refresh()
      onClose()
    })
  })

  const errs = form.formState.errors

  return (
    <>
      <DialogHeader>
        <DialogTitle>Editar usuário</DialogTitle>
        <DialogDescription>
          <span className="font-mono">{usuario.username}</span>
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="space-y-3" noValidate>
        <FieldRow label="Nome" id="eu-nome" error={errs.nome?.message} required>
          <Input
            id="eu-nome"
            autoFocus
            disabled={isPending}
            {...form.register('nome')}
          />
        </FieldRow>
        <FieldRow label="Telefone" id="eu-tel" error={errs.telefone?.message}>
          <Input
            id="eu-tel"
            disabled={isPending}
            {...form.register('telefone')}
          />
        </FieldRow>
        <FieldRow label="Role" id="eu-role" error={errs.role?.message} required>
          <Controller
            control={form.control}
            name="role"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(v) => v && field.onChange(v)}
                disabled={isPending || isSelf}
              >
                <SelectTrigger id="eu-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {userRoleValues.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {isSelf && (
            <p className="text-muted-foreground text-xs">
              Você não pode alterar a própria role.
            </p>
          )}
        </FieldRow>
        <FieldRow label="Cor no kanban" id="eu-cor" error={errs.cor?.message}>
          <Controller
            control={form.control}
            name="cor"
            render={({ field }) => (
              <CorPicker
                value={field.value ?? undefined}
                onChange={field.onChange}
                disabled={isPending}
              />
            )}
          />
        </FieldRow>
        <div className="flex items-center justify-between rounded-md border p-2">
          <Label htmlFor="eu-ativo" className="text-sm">
            Ativo
          </Label>
          <Switch
            id="eu-ativo"
            checked={ativo}
            onCheckedChange={(v) =>
              form.setValue('ativo', v, { shouldDirty: true })
            }
            disabled={isPending || isSelf}
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isPending}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}

// -----------------------------------------------------------------
// Dialog: reset senha
// -----------------------------------------------------------------

function ResetSenhaDialog({
  usuario,
  onClose,
}: {
  usuario: User | null
  onClose: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const form = useForm<ResetSenhaInput>({
    resolver: zodResolver(resetSenhaSchema) as unknown as Resolver<ResetSenhaInput>,
    defaultValues: { novaSenha: '' },
  })

  const onSubmit = form.handleSubmit((values) => {
    if (!usuario) return
    startTransition(async () => {
      const result = await resetSenhaAction(usuario.id, values)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'Senha redefinida')
      onClose()
      form.reset()
    })
  })

  return (
    <Dialog
      open={usuario !== null}
      onOpenChange={(o) => {
        if (!o) {
          onClose()
          form.reset()
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resetar senha</DialogTitle>
          <DialogDescription>
            {usuario?.nome} ({usuario?.username}) — informe a nova senha. O
            usuário poderá trocá-la depois em Configurações.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          <FieldRow
            label="Nova senha"
            id="rs-senha"
            error={form.formState.errors.novaSenha?.message}
            required
          >
            <Input
              id="rs-senha"
              type="password"
              autoFocus
              disabled={isPending}
              {...form.register('novaSenha')}
            />
          </FieldRow>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onClose()
                form.reset()
              }}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Redefinindo…' : 'Redefinir senha'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// -----------------------------------------------------------------
// Dialog: excluir
// -----------------------------------------------------------------

function ExcluirUsuarioDialog({
  usuario,
  onClose,
}: {
  usuario: User | null
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function excluir() {
    if (!usuario) return
    startTransition(async () => {
      const result = await excluirUsuarioAction(usuario.id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'Excluído')
      router.refresh()
      onClose()
    })
  }

  return (
    <Dialog open={usuario !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir usuário?</DialogTitle>
          <DialogDescription>
            {usuario?.nome} ({usuario?.username}) será desativado e não poderá
            mais fazer login. Os registros históricos (OPs criadas,
            apontamentos, etc.) ficam preservados.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={excluir}
            disabled={isPending}
          >
            {isPending ? 'Excluindo…' : 'Excluir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// -----------------------------------------------------------------
// FieldRow
// -----------------------------------------------------------------

function FieldRow({
  id,
  label,
  required,
  error,
  children,
}: {
  id: string
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  )
}

// -----------------------------------------------------------------
// CorPicker — paleta de cores do operador (swatches)
// -----------------------------------------------------------------

function CorPicker({
  value,
  onChange,
  disabled,
}: {
  value?: string
  onChange: (v: string | undefined) => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        onClick={() => onChange(undefined)}
        disabled={disabled}
        aria-label="Sem cor"
        title="Sem cor"
        className={cn(
          'text-muted-foreground flex size-7 items-center justify-center rounded-full border-2',
          !value ? 'border-foreground' : 'border-border',
        )}
      >
        <Ban className="size-3.5" />
      </button>
      {OPERADOR_CORES.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          disabled={disabled}
          aria-label={`Cor ${c}`}
          style={{ backgroundColor: c }}
          className={cn(
            'size-7 rounded-full border-2 transition-transform hover:scale-110',
            value === c
              ? 'border-foreground ring-foreground/20 ring-2'
              : 'border-transparent',
          )}
        />
      ))}
    </div>
  )
}
