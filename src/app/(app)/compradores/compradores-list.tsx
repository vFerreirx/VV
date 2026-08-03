'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { BookUser, Loader2, MapPin, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useRef, useState, useTransition } from 'react'
import { Controller, useForm, type Resolver } from 'react-hook-form'
import { toast } from 'sonner'

import {
  atualizarCompradorAction,
  buscarCepAction,
  criarCompradorAction,
  excluirCompradorAction,
} from './actions'
import { EmptyState } from '@/components/ui/empty-state'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import type { Comprador } from '@/lib/db/schema'
import {
  compradorSchema,
  type CompradorInput,
} from '@/lib/validators/compradores'
import {
  formatarCep,
  formatarDocumento,
  mascararCep,
  mascararDocumento,
  normalizarDocumento,
  soDigitos,
  tipoDocumento,
  UFS,
} from '@/lib/validators/documento'

type Props = {
  compradores: Comprador[]
  podeEditar: boolean
}

export function CompradoresList({ compradores, podeEditar }: Props) {
  const [busca, setBusca] = useState('')
  const [editando, setEditando] = useState<Comprador | 'novo' | null>(null)
  const [excluindo, setExcluindo] = useState<Comprador | null>(null)

  // Busca por nome, documento ou telefone. Documento/telefone comparam só os
  // caracteres normalizados, então achar "529.982" ou "52998224725" dá o mesmo.
  const filtrados = useMemo(() => {
    const q = busca.trim()
    if (!q) return compradores
    const qTexto = q.toLowerCase()
    const qDoc = normalizarDocumento(q)
    const qNum = soDigitos(q)
    return compradores.filter((c) => {
      if (c.nome.toLowerCase().includes(qTexto)) return true
      if (qDoc && c.documento?.includes(qDoc)) return true
      if (qNum && soDigitos(c.telefone ?? '').includes(qNum)) return true
      return false
    })
  }, [compradores, busca])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Compradores</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Cadastro dos clientes. Só o nome é obrigatório — o resto pode ser
            completado depois.
          </p>
        </div>
        {podeEditar && (
          <Button onClick={() => setEditando('novo')}>
            <Plus />
            Novo comprador
          </Button>
        )}
      </div>

      {compradores.length === 0 ? (
        <EmptyState
          icon={BookUser}
          title="Nenhum comprador"
          description="Clique em “Novo comprador” pra cadastrar o primeiro."
        />
      ) : (
        <>
          <div className="relative max-w-sm">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, CPF/CNPJ ou telefone"
              className="pl-8"
              aria-label="Buscar comprador"
            />
          </div>

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>CPF/CNPJ</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Cidade</TableHead>
                  {podeEditar && <TableHead className="w-24" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={podeEditar ? 5 : 4}
                      className="text-muted-foreground py-8 text-center text-sm"
                    >
                      Nenhum comprador encontrado para “{busca}”.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtrados.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.nome}</TableCell>
                      <TableCell className="tabular-nums">
                        {formatarDocumento(c.documento) || (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {c.telefone || (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {c.cidade ? (
                          `${c.cidade}${c.uf ? ` - ${c.uf}` : ''}`
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      {podeEditar && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              onClick={() => setEditando(c)}
                              aria-label="Editar"
                            >
                              <Pencil />
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              onClick={() => setExcluindo(c)}
                              aria-label="Excluir"
                            >
                              <Trash2 className="text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <CompradorDialog
        comprador={editando}
        onClose={() => setEditando(null)}
      />
      <ExcluirDialog
        comprador={excluindo}
        onClose={() => setExcluindo(null)}
      />
    </div>
  )
}

function CompradorDialog({
  comprador,
  onClose,
}: {
  comprador: Comprador | 'novo' | null
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [buscandoCep, setBuscandoCep] = useState(false)
  // Último CEP já consultado, pra não repetir a busca a cada tecla.
  const ultimoCep = useRef('')

  const isEdit = comprador !== null && comprador !== 'novo'
  const open = comprador !== null

  const form = useForm<CompradorInput>({
    resolver: zodResolver(compradorSchema) as unknown as Resolver<CompradorInput>,
    values: {
      nome: isEdit ? comprador.nome : '',
      documento: isEdit ? formatarDocumento(comprador.documento) : '',
      telefone: isEdit ? (comprador.telefone ?? '') : '',
      cep: isEdit ? formatarCep(comprador.cep) : '',
      logradouro: isEdit ? (comprador.logradouro ?? '') : '',
      numero: isEdit ? (comprador.numero ?? '') : '',
      complemento: isEdit ? (comprador.complemento ?? '') : '',
      bairro: isEdit ? (comprador.bairro ?? '') : '',
      cidade: isEdit ? (comprador.cidade ?? '') : '',
      uf: isEdit ? (comprador.uf ?? '') : '',
      observacao: isEdit ? (comprador.observacao ?? '') : '',
    },
  })

  const errs = form.formState.errors

  // Preenche logradouro/bairro/cidade/UF. Os campos seguem editáveis à mão:
  // isso é só um setValue no mesmo estado do formulário.
  function buscarCep(valor: string) {
    const cep = soDigitos(valor)
    if (cep.length !== 8) return
    ultimoCep.current = cep
    setBuscandoCep(true)
    startTransition(async () => {
      const r = await buscarCepAction(cep)
      setBuscandoCep(false)
      if (!r.success) {
        // Falha nunca trava o formulário — o endereço pode ser digitado.
        toast.error(r.error)
        return
      }
      const e = r.data!
      if (e.logradouro) form.setValue('logradouro', e.logradouro)
      if (e.bairro) form.setValue('bairro', e.bairro)
      if (e.cidade) form.setValue('cidade', e.cidade)
      if (e.uf) form.setValue('uf', e.uf)
      toast.success('Endereço preenchido pelo CEP')
    })
  }

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const result = isEdit
        ? await atualizarCompradorAction(comprador.id, values)
        : await criarCompradorAction(values)

      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'Salvo')
      router.refresh()
      onClose()
      form.reset()
    })
  })

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b p-6">
          <DialogTitle>
            {isEdit ? 'Editar comprador' : 'Novo comprador'}
          </DialogTitle>
          <DialogDescription>
            Só o nome é obrigatório. Documento e endereço podem ficar pra
            depois.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate>
          <div className="max-h-[68vh] space-y-4 overflow-y-auto p-6">
            <div className="space-y-1.5">
              <Label htmlFor="cp-nome">
                Nome <span className="text-destructive">*</span>
              </Label>
              <Input
                id="cp-nome"
                autoFocus
                disabled={isPending}
                placeholder="Nome do comprador / empresa"
                {...form.register('nome')}
              />
              {errs.nome && (
                <p className="text-destructive text-xs">{errs.nome.message}</p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cp-doc">CPF ou CNPJ</Label>
                <Controller
                  control={form.control}
                  name="documento"
                  render={({ field: ctl }) => {
                    const tipo = tipoDocumento(String(ctl.value ?? ''))
                    return (
                      <>
                        <Input
                          id="cp-doc"
                          inputMode="text"
                          autoComplete="off"
                          disabled={isPending}
                          placeholder="000.000.000-00 ou 00.000.000/0000-00"
                          value={String(ctl.value ?? '')}
                          onChange={(e) =>
                            ctl.onChange(mascararDocumento(e.target.value))
                          }
                        />
                        {!errs.documento && tipo && (
                          <p className="text-muted-foreground text-xs">
                            {tipo === 'cpf' ? 'CPF' : 'CNPJ'} detectado
                          </p>
                        )}
                      </>
                    )
                  }}
                />
                {errs.documento && (
                  <p className="text-destructive text-xs">
                    {errs.documento.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cp-tel">Telefone</Label>
                <Input
                  id="cp-tel"
                  inputMode="tel"
                  disabled={isPending}
                  placeholder="(00) 00000-0000"
                  {...form.register('telefone')}
                />
                {errs.telefone && (
                  <p className="text-destructive text-xs">
                    {errs.telefone.message}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-3 rounded-lg border p-3">
              <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Endereço
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr]">
                <div className="space-y-1.5">
                  <Label htmlFor="cp-cep">CEP</Label>
                  <div className="flex gap-1.5">
                    <Controller
                      control={form.control}
                      name="cep"
                      render={({ field: ctl }) => (
                        <Input
                          id="cp-cep"
                          inputMode="numeric"
                          disabled={isPending}
                          placeholder="00000-000"
                          value={String(ctl.value ?? '')}
                          onChange={(e) => {
                            const v = mascararCep(e.target.value)
                            ctl.onChange(v)
                            // Busca sozinho ao completar 8 dígitos (uma vez).
                            const d = soDigitos(v)
                            if (d.length === 8 && d !== ultimoCep.current) {
                              buscarCep(d)
                            }
                          }}
                        />
                      )}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => {
                        ultimoCep.current = ''
                        buscarCep(String(form.getValues('cep') ?? ''))
                      }}
                      aria-label="Buscar endereço pelo CEP"
                      title="Buscar endereço pelo CEP"
                    >
                      {buscandoCep ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <MapPin />
                      )}
                    </Button>
                  </div>
                  {errs.cep && (
                    <p className="text-destructive text-xs">
                      {errs.cep.message}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="cp-logradouro">Logradouro</Label>
                  <Input
                    id="cp-logradouro"
                    disabled={isPending}
                    {...form.register('logradouro')}
                  />
                  {errs.logradouro && (
                    <p className="text-destructive text-xs">
                      {errs.logradouro.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[8rem_1fr]">
                <div className="space-y-1.5">
                  <Label htmlFor="cp-numero">Número</Label>
                  <Input
                    id="cp-numero"
                    disabled={isPending}
                    {...form.register('numero')}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cp-complemento">Complemento</Label>
                  <Input
                    id="cp-complemento"
                    disabled={isPending}
                    placeholder="Apto, bloco, referência…"
                    {...form.register('complemento')}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_7rem]">
                <div className="space-y-1.5">
                  <Label htmlFor="cp-bairro">Bairro</Label>
                  <Input
                    id="cp-bairro"
                    disabled={isPending}
                    {...form.register('bairro')}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cp-cidade">Cidade</Label>
                  <Input
                    id="cp-cidade"
                    disabled={isPending}
                    {...form.register('cidade')}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cp-uf">UF</Label>
                  <Controller
                    control={form.control}
                    name="uf"
                    render={({ field: ctl }) => (
                      <Select
                        // `null` (e não undefined) mantém o Select
                        // CONTROLADO desde a primeira renderização — com
                        // undefined o Base UI o trata como uncontrolled e
                        // ignora o valor que a busca de CEP preenche.
                        value={ctl.value ? String(ctl.value) : null}
                        onValueChange={(v) => ctl.onChange(v ?? '')}
                        disabled={isPending}
                      >
                        <SelectTrigger id="cp-uf" className="w-full">
                          <SelectValue placeholder="UF" />
                        </SelectTrigger>
                        <SelectContent>
                          {UFS.map((u) => (
                            <SelectItem key={u} value={u}>
                              {u}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {errs.uf && (
                    <p className="text-destructive text-xs">{errs.uf.message}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cp-obs">Observação</Label>
              <Textarea
                id="cp-obs"
                rows={3}
                disabled={isPending}
                placeholder="Condições, referência de contato, histórico…"
                {...form.register('observacao')}
              />
              {errs.observacao && (
                <p className="text-destructive text-xs">
                  {errs.observacao.message}
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="border-t p-6">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Salvando…' : isEdit ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ExcluirDialog({
  comprador,
  onClose,
}: {
  comprador: Comprador | null
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function excluir() {
    if (!comprador) return
    startTransition(async () => {
      const result = await excluirCompradorAction(comprador.id)
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
    <Dialog open={comprador !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir comprador?</DialogTitle>
          <DialogDescription>
            {comprador?.nome} será marcado como excluído. Os pedidos dele
            continuam abrindo normalmente — o nome do cliente fica gravado no
            próprio pedido.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={excluir} disabled={isPending}>
            {isPending ? 'Excluindo…' : 'Excluir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
