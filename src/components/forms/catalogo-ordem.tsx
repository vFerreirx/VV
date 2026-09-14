'use client'

import { useState } from 'react'
import type { ProdutoComVariacoesParaForm } from '@/app/(app)/ordens/actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { modelosDoProduto, variacoesDoModelo, SEM_MODELO } from '@/lib/producao/catalogo-op'
import { cn } from '@/lib/utils'

type Props = {
  produtos: ProdutoComVariacoesParaForm[]
  produtoId: string
  variacaoId: string
  disabled: boolean
  error?: string
  onChange: (produtoId: string, variacaoId: string) => void
}

// Mesmo percurso do catálogo de pedidos: modelo, produto, tamanho e cor.
// Aqui uma cor SUBSTITUI a anterior: cada OP produz uma única variação, sem kits.
export function CatalogoOrdem({
  produtos,
  produtoId,
  variacaoId,
  disabled,
  error,
  onChange,
}: Props) {
  const produto = produtos.find((p) => p.id === produtoId)
  const variacao = produto?.variacoes.find((v) => v.id === variacaoId)
  const [modelo, setModelo] = useState(() =>
    variacao ? variacao.modelo || SEM_MODELO : (produto ? modelosDoProduto(produto)[0] : '') || '',
  )
  const [tamanho, setTamanho] = useState<string | null>(() =>
    variacao ? (variacao.tamanho ?? '') : null,
  )
  const [busca, setBusca] = useState('')
  const modelos = [...new Set(produtos.flatMap(modelosDoProduto))].sort((a, b) =>
    a.localeCompare(b, 'pt-BR'),
  )
  const normalizar = (texto: string) =>
    texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('pt-BR')
  const modelosVisiveis = modelos.filter(
    (m) => m === modelo || normalizar(m).includes(normalizar(busca.trim())),
  )
  const produtosDoModelo = produtos.filter((p) => modelosDoProduto(p).includes(modelo))
  const variacoes = variacoesDoModelo(produto?.variacoes ?? [], modelo)
  const tamanhos = [...new Set(variacoes.map((v) => v.tamanho ?? ''))]
  const candidatas = tamanho === null ? [] : variacoes.filter((v) => (v.tamanho ?? '') === tamanho)

  function trocarModelo(valor: string) {
    setModelo(valor)
    setTamanho(null)
    onChange('', '')
  }

  function trocarProduto(id: string) {
    const p = produtos.find((item) => item.id === id)
    const opcoes = variacoesDoModelo(p?.variacoes ?? [], modelo)
    const tamanhosNovos = [...new Set(opcoes.map((v) => v.tamanho ?? ''))]
    setTamanho(tamanhosNovos.length === 1 ? tamanhosNovos[0] : null)
    onChange(id, opcoes.length === 1 ? opcoes[0].id : '')
  }

  function trocarTamanho(valor: string) {
    setTamanho(valor)
    const opcoes = variacoes.filter((v) => (v.tamanho ?? '') === valor)
    onChange(produtoId, opcoes.length === 1 ? opcoes[0].id : '')
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Escolha um modelo, um produto, o tamanho e uma cor para esta OP.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="op-busca-modelo">Buscar modelo</Label>
        <Input
          id="op-busca-modelo"
          placeholder="Digite o nome do modelo…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          disabled={disabled}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="op-modelo">Modelo</Label>
          <Select
            key={busca}
            items={modelosVisiveis.map((m) => ({ value: m, label: m }))}
            value={modelo || null}
            onValueChange={(v) => trocarModelo(v ?? '')}
            disabled={disabled}
          >
            <SelectTrigger id="op-modelo" className="w-full">
              <SelectValue placeholder="Selecione o modelo…" />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {modelosVisiveis.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
              {modelosVisiveis.length === 0 && (
                <p className="text-muted-foreground p-3 text-sm">Nenhum modelo encontrado.</p>
              )}
            </SelectContent>
          </Select>
        </div>
        {modelo && (
          <div className="space-y-1.5">
            <Label htmlFor="produtoId">
              Produto <span className="text-destructive">*</span>
            </Label>
            {/* Remontar ao trocar o modelo evita o posicionamento de um item antigo,
              o mesmo cuidado do catálogo de pedidos com selects dependentes. */}
            <Select
              key={modelo}
              items={produtosDoModelo.map((p) => ({ value: p.id, label: p.nome }))}
              value={produtoId || null}
              onValueChange={(v) => trocarProduto(v ?? '')}
              disabled={disabled}
            >
              <SelectTrigger id="produtoId" className="w-full">
                <SelectValue placeholder="Selecione um produto…" />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                {produtosDoModelo.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {produto && tamanhos.length > 0 && (
          <div className="space-y-1.5">
            <Label htmlFor="op-tamanho">Tamanho</Label>
            <Select
              key={modelo + produtoId}
              items={tamanhos.map((t) => ({
                value: t || '__sem_tamanho__',
                label: t || 'Sem tamanho',
              }))}
              value={tamanho === null ? null : tamanho || '__sem_tamanho__'}
              onValueChange={(v) => v && trocarTamanho(v === '__sem_tamanho__' ? '' : v)}
              disabled={disabled}
            >
              <SelectTrigger id="op-tamanho" className="w-full">
                <SelectValue placeholder="Selecione o tamanho…" />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                {tamanhos.map((t) => (
                  <SelectItem key={t} value={t || '__sem_tamanho__'}>
                    {t || 'Sem tamanho'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      {produto && candidatas.length > 0 && (
        <fieldset className="space-y-2" disabled={disabled}>
          <legend className="text-sm font-medium">Cor — selecione apenas uma</legend>
          <div className="flex flex-wrap gap-2">
            {candidatas.map((v) => (
              <button
                key={v.id}
                type="button"
                aria-pressed={variacaoId === v.id}
                disabled={disabled}
                onClick={() => onChange(produtoId, v.id)}
                className={cn(
                  'min-h-10 rounded-full border px-4 py-2 text-sm transition-colors disabled:opacity-50',
                  variacaoId === v.id
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border hover:bg-muted',
                )}
              >
                {v.cor || 'Sem cor'}
                {candidatas.filter((c) => c.cor === v.cor).length > 1 ? ' · ' + v.skuVariacao : ''}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {produto && produto.variacoes.length === 0 && (
        <p className="text-muted-foreground text-sm">Produto sem variações cadastradas.</p>
      )}
      {variacao && (
        <p className="bg-muted rounded-lg p-3 text-sm">
          <strong>Selecionado:</strong> {produto?.nome} ·{' '}
          {[variacao.tamanho, variacao.cor].filter(Boolean).join(' · ')}{' '}
          <span className="text-muted-foreground">({variacao.skuVariacao})</span>
        </p>
      )}
      {produtos.length === 0 && (
        <p className="text-muted-foreground text-sm">Nenhum produto ativo cadastrado.</p>
      )}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  )
}
