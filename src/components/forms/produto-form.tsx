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
import type { Cor } from '@/lib/db/schema'
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
  categoria: string | null
  composicao: string | null
  gramatura: string | null
  larguraCm: string | null
  rendimentoKgPorMetro: string | null
  custoProducao: string | null
  precoMl: string | null
  precoShopee: string | null
  estoqueMinimoFullMl: string | null
  estoqueMinimoFullShopee: string | null
  ativo: boolean
  variacoes: Array<{
    id?: string
    skuVariacao: string
    cor: string | null
    tamanho: string | null
    precoAdicional: string | null
  }>
}

const VAZIO: ProdutoFormDefaults = {
  sku: '',
  nome: '',
  descricao: null,
  categoria: null,
  composicao: null,
  gramatura: null,
  larguraCm: null,
  rendimentoKgPorMetro: null,
  custoProducao: null,
  precoMl: null,
  precoShopee: null,
  estoqueMinimoFullMl: '0',
  estoqueMinimoFullShopee: '0',
  ativo: true,
  variacoes: [],
}

function toFormValues(d: ProdutoFormDefaults): ProdutoInput {
  return {
    sku: d.sku ?? '',
    nome: d.nome ?? '',
    descricao: d.descricao ?? '',
    categoria: d.categoria ?? '',
    composicao: d.composicao ?? '',
    gramatura: d.gramatura ?? '',
    larguraCm: d.larguraCm ?? '',
    rendimentoKgPorMetro: d.rendimentoKgPorMetro ?? '',
    custoProducao: d.custoProducao ?? '',
    precoMl: d.precoMl ?? '',
    precoShopee: d.precoShopee ?? '',
    estoqueMinimoFullMl: d.estoqueMinimoFullMl ?? '0',
    estoqueMinimoFullShopee: d.estoqueMinimoFullShopee ?? '0',
    ativo: d.ativo ?? true,
    variacoes: d.variacoes.map((v) => ({
      id: v.id,
      skuVariacao: v.skuVariacao,
      cor: v.cor ?? '',
      tamanho: v.tamanho ?? '',
      precoAdicional: v.precoAdicional ?? '',
    })),
  }
}

export function ProdutoForm({
  defaults = VAZIO,
  cores,
}: {
  defaults?: ProdutoFormDefaults
  cores: Cor[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const isEdit = Boolean(defaults.id)

  // Algumas variações antigas podem ter valor de cor que não está mais no
  // catálogo (renomeada / inativada). Adicionamos esses valores como opções
  // extras pra não perder a informação ao salvar de novo.
  const legadosCor = useMemo(() => {
    const nomesCadastrados = new Set(cores.map((c) => c.nome))
    const extras = new Set<string>()
    for (const v of defaults.variacoes) {
      if (v.cor && !nomesCadastrados.has(v.cor)) extras.add(v.cor)
    }
    return [...extras].sort()
  }, [cores, defaults.variacoes])

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

          <Field label="Categoria" id="categoria" error={errs.categoria?.message}>
            <Input
              id="categoria"
              placeholder="Cotton, PV, Sintético…"
              disabled={isPending}
              {...form.register('categoria')}
            />
          </Field>

          <Field label="Composição" id="composicao" error={errs.composicao?.message}>
            <Input
              id="composicao"
              placeholder="100% Algodão"
              disabled={isPending}
              {...form.register('composicao')}
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
          <CardTitle>Custos e preços</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Field label="Custo de produção (R$)" id="custoProducao" error={errs.custoProducao?.message}>
            <Input
              id="custoProducao"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="22.50"
              disabled={isPending}
              {...form.register('custoProducao')}
            />
          </Field>

          <Field label="Preço Full ML (R$)" id="precoMl" error={errs.precoMl?.message}>
            <Input
              id="precoMl"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="38.90"
              disabled={isPending}
              {...form.register('precoMl')}
            />
          </Field>

          <Field label="Preço Shopee (R$)" id="precoShopee" error={errs.precoShopee?.message}>
            <Input
              id="precoShopee"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="36.90"
              disabled={isPending}
              {...form.register('precoShopee')}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Estoque mínimo</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field
            label="Mínimo Full ML (kg)"
            id="estoqueMinimoFullMl"
            error={errs.estoqueMinimoFullMl?.message}
            required
          >
            <Input
              id="estoqueMinimoFullMl"
              type="number"
              inputMode="decimal"
              step="0.001"
              min="0"
              placeholder="50.000"
              disabled={isPending}
              {...form.register('estoqueMinimoFullMl')}
            />
          </Field>

          <Field
            label="Mínimo Full Shopee (kg)"
            id="estoqueMinimoFullShopee"
            error={errs.estoqueMinimoFullShopee?.message}
            required
          >
            <Input
              id="estoqueMinimoFullShopee"
              type="number"
              inputMode="decimal"
              step="0.001"
              min="0"
              placeholder="30.000"
              disabled={isPending}
              {...form.register('estoqueMinimoFullShopee')}
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
                Cores e tamanhos. Cada variação tem seu próprio SKU.
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
                    className="grid gap-3 rounded-lg border p-3 md:grid-cols-[1fr_1fr_1fr_1fr_auto]"
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
                      label="Tamanho"
                      id={`variacoes.${index}.tamanho`}
                      error={ve?.tamanho?.message}
                    >
                      <Input
                        id={`variacoes.${index}.tamanho`}
                        placeholder="M"
                        disabled={isPending}
                        {...form.register(`variacoes.${index}.tamanho`)}
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
