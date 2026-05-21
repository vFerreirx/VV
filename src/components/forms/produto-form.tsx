'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useTransition } from 'react'
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
  type Resolver,
} from 'react-hook-form'
import { toast } from 'sonner'

import {
  atualizarProdutoAction,
  criarProdutoAction,
} from '@/app/(app)/produtos/actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Textarea } from '@/components/ui/textarea'
import type { Cor, Modelo, Tamanho } from '@/lib/db/schema'
import {
  produtoSchema,
  type ProdutoInput,
} from '@/lib/validators/produtos'

// O componente recebe defaults serializáveis (string|null|boolean) que
// vêm direto do banco — convertemos pra string nos inputs.
export type ProdutoFormDefaults = {
  id?: string
  sku: string
  nome: string
  descricao: string | null
  gramatura: string | null
  larguraCm: string | null
  rendimentoKgPorMetro: string | null
  ativo: boolean
  variacoes: Array<{
    id?: string
    skuVariacao: string
    cor: string | null
    modelo: string | null
    tamanho: string | null
    precoAdicional: string | null
  }>
}

const VAZIO: ProdutoFormDefaults = {
  sku: '',
  nome: '',
  descricao: null,
  gramatura: null,
  larguraCm: null,
  rendimentoKgPorMetro: null,
  ativo: true,
  variacoes: [],
}

function toFormValues(d: ProdutoFormDefaults): ProdutoInput {
  return {
    sku: d.sku ?? '',
    nome: d.nome ?? '',
    descricao: d.descricao ?? '',
    gramatura: d.gramatura ?? '',
    larguraCm: d.larguraCm ?? '',
    rendimentoKgPorMetro: d.rendimentoKgPorMetro ?? '',
    ativo: d.ativo ?? true,
    variacoes: d.variacoes.map((v) => ({
      id: v.id,
      skuVariacao: v.skuVariacao,
      cor: v.cor ?? '',
      modelo: v.modelo ?? '',
      tamanho: v.tamanho ?? '',
      precoAdicional: v.precoAdicional ?? '',
    })),
  }
}

export function ProdutoForm({
  defaults = VAZIO,
  cores,
  modelos,
  tamanhos,
}: {
  defaults?: ProdutoFormDefaults
  cores: Cor[]
  modelos: Modelo[]
  tamanhos: Tamanho[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const isEdit = Boolean(defaults.id)

  // Valores de catálogo que podem ter sido renomeados/inativados — preservamos
  // como opção "legada" no select pra não perder a informação histórica.
  const legadosCor = useMemo(() => {
    const nomes = new Set(cores.map((c) => c.nome))
    const extras = new Set<string>()
    for (const v of defaults.variacoes) {
      if (v.cor && !nomes.has(v.cor)) extras.add(v.cor)
    }
    return [...extras].sort()
  }, [cores, defaults.variacoes])

  const legadosModelo = useMemo(() => {
    const nomes = new Set(modelos.map((m) => m.nome))
    const extras = new Set<string>()
    for (const v of defaults.variacoes) {
      if (v.modelo && !nomes.has(v.modelo)) extras.add(v.modelo)
    }
    return [...extras].sort()
  }, [modelos, defaults.variacoes])

  const legadosTamanho = useMemo(() => {
    const nomes = new Set(tamanhos.map((t) => t.nome))
    const extras = new Set<string>()
    for (const v of defaults.variacoes) {
      if (v.tamanho && !nomes.has(v.tamanho)) extras.add(v.tamanho)
    }
    return [...extras].sort()
  }, [tamanhos, defaults.variacoes])

  const form = useForm<ProdutoInput>({
    // Tipos de input/output do Zod divergem por causa dos transforms;
    // precisamos forçar o cast do resolver pra alinhar com ProdutoInput.
    resolver: zodResolver(produtoSchema) as unknown as Resolver<ProdutoInput>,
    defaultValues: toFormValues(defaults),
  })

  const variacoes = useFieldArray({ control: form.control, name: 'variacoes' })

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const result = isEdit
        ? await atualizarProdutoAction(defaults.id!, values)
        : await criarProdutoAction(values)

      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'Salvo')
      if (!isEdit && 'data' in result && result.data) {
        router.push(`/produtos/${result.data.id}`)
      } else {
        router.refresh()
      }
    })
  })

  const errs = form.formState.errors
  const ativo = useWatch({ control: form.control, name: 'ativo' })

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Identificação</CardTitle>
            <div className="flex items-center gap-2">
              <Label htmlFor="ativo" className="text-sm">
                Ativo
              </Label>
              <Switch
                id="ativo"
                checked={ativo}
                onCheckedChange={(v) => form.setValue('ativo', v, { shouldDirty: true })}
                disabled={isPending}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field
            label="SKU"
            id="sku"
            error={errs.sku?.message}
            required
          >
            <Input
              id="sku"
              placeholder="MAL-001"
              autoComplete="off"
              disabled={isPending}
              {...form.register('sku')}
            />
          </Field>

          <Field label="Nome" id="nome" error={errs.nome?.message} required>
            <Input
              id="nome"
              placeholder="Malha Cotton 30/1"
              disabled={isPending}
              {...form.register('nome')}
            />
          </Field>

          <Field
            label="Descrição"
            id="descricao"
            error={errs.descricao?.message}
            className="md:col-span-2"
          >
            <Textarea
              id="descricao"
              rows={3}
              placeholder="Detalhes adicionais sobre o produto"
              disabled={isPending}
              {...form.register('descricao')}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Características técnicas</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Field label="Gramatura (g/m²)" id="gramatura" error={errs.gramatura?.message}>
            <Input
              id="gramatura"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="180.00"
              disabled={isPending}
              {...form.register('gramatura')}
            />
          </Field>

          <Field label="Largura (cm)" id="larguraCm" error={errs.larguraCm?.message}>
            <Input
              id="larguraCm"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="180.00"
              disabled={isPending}
              {...form.register('larguraCm')}
            />
          </Field>

          <Field
            label="Rendimento (kg/m)"
            id="rendimentoKgPorMetro"
            error={errs.rendimentoKgPorMetro?.message}
            hint="Usado para calcular metragem da OP a partir do peso"
          >
            <Input
              id="rendimentoKgPorMetro"
              type="number"
              inputMode="decimal"
              step="0.0001"
              min="0"
              placeholder="0.3240"
              disabled={isPending}
              {...form.register('rendimentoKgPorMetro')}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Variações</CardTitle>
              <p className="text-muted-foreground mt-1 text-sm">
                Cor, modelo e tamanho. Cada variação tem seu próprio SKU.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                variacoes.append({
                  skuVariacao: '',
                  cor: '',
                  modelo: '',
                  tamanho: '',
                  precoAdicional: '',
                })
              }
              disabled={isPending}
            >
              <Plus />
              Adicionar variação
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {variacoes.fields.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              Nenhuma variação. Clique em &ldquo;Adicionar variação&rdquo;.
            </p>
          ) : (
            <div className="space-y-3">
              {variacoes.fields.map((field, index) => {
                const ve = errs.variacoes?.[index]
                return (
                  <div
                    key={field.id}
                    className="grid gap-3 rounded-lg border p-3 md:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]"
                  >
                    <Field
                      label="SKU"
                      id={`variacoes.${index}.skuVariacao`}
                      error={ve?.skuVariacao?.message}
                      required
                    >
                      <Input
                        id={`variacoes.${index}.skuVariacao`}
                        placeholder="MAL-001-BRA-M"
                        disabled={isPending}
                        {...form.register(`variacoes.${index}.skuVariacao`)}
                      />
                    </Field>
                    <Field
                      label="Cor"
                      id={`variacoes.${index}.cor`}
                      error={ve?.cor?.message}
                    >
                      <Controller
                        control={form.control}
                        name={`variacoes.${index}.cor`}
                        render={({ field: ctl }) => (
                          <Select
                            value={ctl.value ?? ''}
                            onValueChange={(v) => ctl.onChange(v ?? '')}
                            disabled={isPending}
                          >
                            <SelectTrigger
                              id={`variacoes.${index}.cor`}
                              className="w-full"
                            >
                              <SelectValue placeholder="Selecione…" />
                            </SelectTrigger>
                            <SelectContent>
                              {cores.length === 0 && legadosCor.length === 0 && (
                                <div className="text-muted-foreground p-2 text-xs">
                                  Nenhuma cor cadastrada.{' '}
                                  <Link
                                    href="/cores"
                                    className="underline"
                                    target="_blank"
                                  >
                                    Cadastre cores
                                  </Link>
                                  .
                                </div>
                              )}
                              {cores
                                .filter((c) => c.ativo)
                                .map((c) => (
                                  <SelectItem key={c.id} value={c.nome}>
                                    <div className="flex items-center gap-2">
                                      {c.codigoHex && (
                                        <span
                                          className="inline-block size-3 rounded-sm border ring-1 ring-foreground/10"
                                          style={{
                                            backgroundColor: c.codigoHex,
                                          }}
                                        />
                                      )}
                                      {c.nome}
                                    </div>
                                  </SelectItem>
                                ))}
                              {legadosCor.length > 0 && (
                                <>
                                  {legadosCor.map((nome) => (
                                    <SelectItem key={`legado-${nome}`} value={nome}>
                                      {nome}{' '}
                                      <span className="text-muted-foreground text-xs">
                                        (legado)
                                      </span>
                                    </SelectItem>
                                  ))}
                                </>
                              )}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </Field>
                    <Field
                      label="Modelo"
                      id={`variacoes.${index}.modelo`}
                      error={ve?.modelo?.message}
                    >
                      <Controller
                        control={form.control}
                        name={`variacoes.${index}.modelo`}
                        render={({ field: ctl }) => (
                          <Select
                            value={ctl.value || 'nenhum'}
                            onValueChange={(v) =>
                              ctl.onChange(v === 'nenhum' ? '' : v)
                            }
                            disabled={isPending}
                          >
                            <SelectTrigger
                              id={`variacoes.${index}.modelo`}
                              className="w-full"
                            >
                              <SelectValue placeholder="Selecione…" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="nenhum">Sem modelo</SelectItem>
                              {modelos.length === 0 && legadosModelo.length === 0 && (
                                <div className="text-muted-foreground p-2 text-xs">
                                  Nenhum modelo cadastrado.{' '}
                                  <Link
                                    href="/modelos"
                                    className="underline"
                                    target="_blank"
                                  >
                                    Cadastre modelos
                                  </Link>
                                  .
                                </div>
                              )}
                              {modelos
                                .filter((m) => m.ativo)
                                .map((m) => (
                                  <SelectItem key={m.id} value={m.nome}>
                                    {m.nome}
                                  </SelectItem>
                                ))}
                              {legadosModelo.map((nome) => (
                                <SelectItem
                                  key={`legado-mod-${nome}`}
                                  value={nome}
                                >
                                  {nome}{' '}
                                  <span className="text-muted-foreground text-xs">
                                    (legado)
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </Field>
                    <Field
                      label="Tamanho"
                      id={`variacoes.${index}.tamanho`}
                      error={ve?.tamanho?.message}
                    >
                      <Controller
                        control={form.control}
                        name={`variacoes.${index}.tamanho`}
                        render={({ field: ctl }) => (
                          <Select
                            value={ctl.value || 'nenhum'}
                            onValueChange={(v) =>
                              ctl.onChange(v === 'nenhum' ? '' : v)
                            }
                            disabled={isPending}
                          >
                            <SelectTrigger
                              id={`variacoes.${index}.tamanho`}
                              className="w-full"
                            >
                              <SelectValue placeholder="Selecione…" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="nenhum">Sem tamanho</SelectItem>
                              {tamanhos.length === 0 &&
                                legadosTamanho.length === 0 && (
                                  <div className="text-muted-foreground p-2 text-xs">
                                    Nenhum tamanho cadastrado.{' '}
                                    <Link
                                      href="/tamanhos"
                                      className="underline"
                                      target="_blank"
                                    >
                                      Cadastre tamanhos
                                    </Link>
                                    .
                                  </div>
                                )}
                              {tamanhos
                                .filter((t) => t.ativo)
                                .map((t) => (
                                  <SelectItem key={t.id} value={t.nome}>
                                    {t.nome}
                                  </SelectItem>
                                ))}
                              {legadosTamanho.map((nome) => (
                                <SelectItem
                                  key={`legado-tam-${nome}`}
                                  value={nome}
                                >
                                  {nome}{' '}
                                  <span className="text-muted-foreground text-xs">
                                    (legado)
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </Field>
                    <Field
                      label="Preço adicional (R$)"
                      id={`variacoes.${index}.precoAdicional`}
                      error={ve?.precoAdicional?.message}
                    >
                      <Input
                        id={`variacoes.${index}.precoAdicional`}
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        disabled={isPending}
                        {...form.register(`variacoes.${index}.precoAdicional`)}
                      />
                    </Field>
                    <div className="flex items-end justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => variacoes.remove(index)}
                        disabled={isPending}
                        aria-label="Remover variação"
                      >
                        <Trash2 className="text-destructive" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/produtos')}
          disabled={isPending}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Criar produto'}
        </Button>
      </div>
    </form>
  )
}

// -----------------------------------------------------------------
// Field — wrapper de label + erro + hint, evita repetir markup.
// -----------------------------------------------------------------

function Field({
  id,
  label,
  required,
  error,
  hint,
  className,
  children,
}: {
  id: string
  label: string
  required?: boolean
  error?: string
  hint?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ''}`}>
      <Label htmlFor={id} className="text-sm">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      {hint && !error && (
        <p className="text-muted-foreground text-xs">{hint}</p>
      )}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  )
}
