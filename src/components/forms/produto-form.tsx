'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Sparkles, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import type { Cor, Modelo, Tamanho } from '@/lib/db/schema'
import { cn } from '@/lib/utils'
import {
  produtoSchema,
  type ProdutoInput,
} from '@/lib/validators/produtos'

// Normaliza um texto pra virar segmento de SKU: sem acento, MAIÚSCULO,
// espaços/símbolos viram hífen. Ex: "Âmbar Dourado" -> "AMBAR-DOURADO".
function skuSegmento(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos (marcas combinantes)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-') // não-alfanumérico vira hífen
    .replace(/^-+|-+$/g, '') // tira hífens das pontas
}

// O componente recebe defaults serializáveis (string|null|boolean) que
// vêm direto do banco — convertemos pra string nos inputs.
export type ProdutoFormDefaults = {
  id?: string
  sku: string
  nome: string
  descricao: string | null
  comprimentoCm: string | null
  larguraCm: string | null
  ativo: boolean
  variacoes: Array<{
    id?: string
    skuVariacao: string
    cor: string | null
    modelo: string | null
    tamanho: string | null
  }>
}

const VAZIO: ProdutoFormDefaults = {
  sku: '',
  nome: '',
  descricao: null,
  comprimentoCm: null,
  larguraCm: null,
  ativo: true,
  variacoes: [],
}

function toFormValues(d: ProdutoFormDefaults): ProdutoInput {
  return {
    sku: d.sku ?? '',
    nome: d.nome ?? '',
    descricao: d.descricao ?? '',
    comprimentoCm: d.comprimentoCm ?? '',
    larguraCm: d.larguraCm ?? '',
    ativo: d.ativo ?? true,
    variacoes: d.variacoes.map((v) => ({
      id: v.id,
      skuVariacao: v.skuVariacao,
      cor: v.cor ?? '',
      modelo: v.modelo ?? '',
      tamanho: v.tamanho ?? '',
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

  // Gerador de variações em massa.
  const [gerarOpen, setGerarOpen] = useState(false)
  const skuAtual = useWatch({ control: form.control, name: 'sku' })
  const variacoesAtuais = useWatch({ control: form.control, name: 'variacoes' })
  const skusExistentes = useMemo(
    () =>
      new Set(
        (variacoesAtuais ?? [])
          .map((v) => v?.skuVariacao)
          .filter((s): s is string => Boolean(s)),
      ),
    [variacoesAtuais],
  )

  // Código de SKU do tamanho selecionado (ex.: King -> "K", Manta -> "MANTA").
  function codigoDoTamanho(nomeTamanho: string): string {
    const t = tamanhos.find((x) => x.nome === nomeTamanho)
    return (t?.codigo ?? '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
  }

  // Monta o SKU da variação: base + códigoTamanho + "-" + cor.
  // Ex.: 059-P + K + -ROSE = 059-PK-ROSE. Sem tamanho: base + "-" + cor.
  function regenerarSku(index: number, cor: string, tamanhoNome: string) {
    const base = (form.getValues('sku') ?? '').trim()
    if (!base) return
    const cod = codigoDoTamanho(tamanhoNome)
    const corSeg = cor ? `-${skuSegmento(cor)}` : ''
    form.setValue(`variacoes.${index}.skuVariacao`, `${base}${cod}${corSeg}`, {
      shouldDirty: true,
      shouldValidate: true,
    })
  }

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
          <CardTitle>Dimensões</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field
            label="Comprimento (cm)"
            id="comprimentoCm"
            error={errs.comprimentoCm?.message}
          >
            <Input
              id="comprimentoCm"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="200.00"
              disabled={isPending}
              {...form.register('comprimentoCm')}
            />
          </Field>

          <Field label="Largura (cm)" id="larguraCm" error={errs.larguraCm?.message}>
            <Input
              id="larguraCm"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="50.00"
              disabled={isPending}
              {...form.register('larguraCm')}
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
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => setGerarOpen(true)}
                disabled={isPending}
              >
                <Sparkles />
                Gerar variações
              </Button>
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
                  })
                }
                disabled={isPending}
              >
                <Plus />
                Adicionar uma
              </Button>
            </div>
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
                            onValueChange={(v) => {
                              const cor = v ?? ''
                              ctl.onChange(cor)
                              // Regenera o SKU: base + códigoTamanho + cor.
                              regenerarSku(
                                index,
                                cor,
                                form.getValues(`variacoes.${index}.tamanho`) ??
                                  '',
                              )
                            }}
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
                                      {(c.codigoHex || c.codigoHex2) && (
                                        <span
                                          className="inline-block size-3 rounded-sm border ring-1 ring-foreground/10"
                                          style={
                                            c.codigoHex && c.codigoHex2
                                              ? {
                                                  background: `linear-gradient(135deg, ${c.codigoHex} 0 50%, ${c.codigoHex2} 50% 100%)`,
                                                }
                                              : {
                                                  backgroundColor:
                                                    c.codigoHex ?? c.codigoHex2!,
                                                }
                                          }
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
                            onValueChange={(v) => {
                              const tam = v === 'nenhum' ? '' : (v ?? '')
                              ctl.onChange(tam)
                              // Regenera o SKU incluindo o código do tamanho.
                              regenerarSku(
                                index,
                                form.getValues(`variacoes.${index}.cor`) ?? '',
                                tam,
                              )
                            }}
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

      <GerarVariacoesDialog
        open={gerarOpen}
        onClose={() => setGerarOpen(false)}
        cores={cores}
        modelos={modelos}
        tamanhos={tamanhos}
        baseSku={skuAtual ?? ''}
        existentes={skusExistentes}
        onGerar={(novas) => {
          for (const v of novas) variacoes.append(v)
        }}
      />
    </form>
  )
}

// -----------------------------------------------------------------
// Gerador de variações em massa (cor × modelo × tamanho)
// -----------------------------------------------------------------

type NovaVariacao = {
  skuVariacao: string
  cor: string
  modelo: string
  tamanho: string
}

function GerarVariacoesDialog({
  open,
  onClose,
  cores,
  modelos,
  tamanhos,
  baseSku,
  existentes,
  onGerar,
}: {
  open: boolean
  onClose: () => void
  cores: Cor[]
  modelos: Modelo[]
  tamanhos: Tamanho[]
  baseSku: string
  existentes: Set<string>
  onGerar: (novas: NovaVariacao[]) => void
}) {
  const [coresSel, setCoresSel] = useState<string[]>([])
  const [modelosSel, setModelosSel] = useState<string[]>([])
  const [tamanhosSel, setTamanhosSel] = useState<string[]>([])

  function toggle(
    lista: string[],
    set: (v: string[]) => void,
    nome: string,
  ) {
    set(lista.includes(nome) ? lista.filter((x) => x !== nome) : [...lista, nome])
  }

  // Combinações (produto cartesiano). SKU = base + códigoTamanho + "-" + cor
  // (+ modelo só se houver mais de um). Tamanho sem código entra como segmento
  // pra não colidir. Dimensão vazia = um único valor undefined.
  const novas = useMemo<NovaVariacao[]>(() => {
    const base = baseSku.trim()
    const corList = coresSel.length ? coresSel : [undefined]
    const modList = modelosSel.length ? modelosSel : [undefined]
    const tamList = tamanhosSel.length ? tamanhosSel : [undefined]
    const codigoTam = (nome: string) =>
      (tamanhos.find((x) => x.nome === nome)?.codigo ?? '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
    const usados = new Set(existentes)
    const out: NovaVariacao[] = []
    for (const cor of corList) {
      for (const mod of modList) {
        for (const tam of tamList) {
          const cod = tam ? codigoTam(tam) : ''
          const segs: string[] = []
          if (cor) segs.push(skuSegmento(cor))
          if (modList.length > 1 && mod) segs.push(skuSegmento(mod))
          if (tamList.length > 1 && tam && !cod) segs.push(skuSegmento(tam))
          const corpo = segs.length ? `-${segs.join('-')}` : ''
          const sku = base ? `${base}${cod}${corpo}` : segs.join('-')
          if (!sku || usados.has(sku)) continue
          usados.add(sku)
          out.push({
            skuVariacao: sku,
            cor: cor ?? '',
            modelo: mod ?? '',
            tamanho: tam ?? '',
          })
        }
      }
    }
    return out
  }, [coresSel, modelosSel, tamanhosSel, baseSku, existentes, tamanhos])

  function fechar() {
    setCoresSel([])
    setModelosSel([])
    setTamanhosSel([])
    onClose()
  }

  function gerar() {
    if (novas.length === 0) return
    onGerar(novas)
    fechar()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && fechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Gerar variações</DialogTitle>
          <DialogDescription>
            Marque as cores, o modelo e o tamanho. O sistema cria todas as
            combinações com o SKU já pronto.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] space-y-4 overflow-y-auto">
          <SecaoOpcoes
            titulo="Cores"
            itens={cores.filter((c) => c.ativo).map((c) => c.nome)}
            selecionados={coresSel}
            onToggle={(n) => toggle(coresSel, setCoresSel, n)}
            vazio="Nenhuma cor cadastrada."
          />
          <SecaoOpcoes
            titulo="Modelo"
            itens={modelos.filter((m) => m.ativo).map((m) => m.nome)}
            selecionados={modelosSel}
            onToggle={(n) => toggle(modelosSel, setModelosSel, n)}
            vazio="Nenhum modelo cadastrado."
          />
          <SecaoOpcoes
            titulo="Tamanho"
            itens={tamanhos.filter((t) => t.ativo).map((t) => t.nome)}
            selecionados={tamanhosSel}
            onToggle={(n) => toggle(tamanhosSel, setTamanhosSel, n)}
            vazio="Nenhum tamanho cadastrado."
          />
        </div>

        <DialogFooter>
          <span className="text-muted-foreground mr-auto self-center text-sm">
            {novas.length} variaç{novas.length === 1 ? 'ão' : 'ões'} a gerar
          </span>
          <Button variant="outline" onClick={fechar}>
            Cancelar
          </Button>
          <Button onClick={gerar} disabled={novas.length === 0}>
            Gerar{novas.length > 0 ? ` ${novas.length}` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SecaoOpcoes({
  titulo,
  itens,
  selecionados,
  onToggle,
  vazio,
}: {
  titulo: string
  itens: string[]
  selecionados: string[]
  onToggle: (nome: string) => void
  vazio: string
}) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium">
        {titulo}{' '}
        {selecionados.length > 0 && (
          <span className="text-muted-foreground font-normal">
            ({selecionados.length})
          </span>
        )}
      </p>
      {itens.length === 0 ? (
        <p className="text-muted-foreground text-xs">{vazio}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {itens.map((nome) => {
            const ativo = selecionados.includes(nome)
            return (
              <button
                key={nome}
                type="button"
                onClick={() => onToggle(nome)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs transition-colors',
                  ativo
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'hover:bg-accent',
                )}
              >
                {nome}
              </button>
            )
          })}
        </div>
      )}
    </div>
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
