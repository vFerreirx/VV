'use client'

import { useState, useTransition, ViewTransition } from 'react'

import type { ProdutoListItem } from './actions'
import { ProdutosList } from './produtos-list'
import type { KitComItens } from '../kits/actions'
import { KitsView } from '../kits/kits-view'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ProdutosFiltros } from '@/lib/validators/produtos'

// PRODUTOS E KITS SÃO A MESMA COISA VISTA DE DOIS JEITOS, e sempre foram: as
// duas telas já dividiam a MESMA área de permissão ('produtos'). O que havia
// eram dois itens de menu, e o kit — que é combinação de produto — morava a um
// clique de distância de tudo que o explica: SKU, variação, peso, preço.
//
// Os números dizem a mesma coisa: 26 produtos mexidos toda semana, contra 13
// kits parados desde agosto, mas usados de verdade (139 itens em 21 pedidos).
// Kit não é tela de uso diário; é aba.
export function ProdutosTabs({
  tabInicial,
  produtos,
  kits,
  podeEditar,
  vePreco,
  podeEditarPreco,
  filtrosIniciais,
}: {
  tabInicial: string
  produtos: ProdutoListItem[]
  kits: KitComItens[]
  podeEditar: boolean
  /** Área `precosCatalogo` diferente de 'nenhum' — ver permissoes.ts. */
  vePreco: boolean
  /** Mesma área, nível 'total'. */
  podeEditarPreco: boolean
  filtrosIniciais: ProdutosFiltros
}) {
  const abas = [
    { value: 'produtos', label: 'Produtos' },
    { value: 'kits', label: `Kits (${kits.length})` },
  ]
  const def = abas.some((a) => a.value === tabInicial)
    ? tabInicial
    : abas[0]!.value

  const [aba, setAba] = useState(def)
  const [, startTransition] = useTransition()

  return (
    <Tabs
      value={aba}
      onValueChange={(v) => startTransition(() => setAba(v ?? def))}
    >
      <TabsList>
        {abas.map((a) => (
          <TabsTrigger key={a.value} value={a.value}>
            {a.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {/* Crossfade: "mesmo lugar, outro conteudo" — mesmo padrão de
          vendas-tabs e estoque-fios-tabs. A troca vai dentro de
          startTransition porque o <ViewTransition> só é ativado por
          Transition/Suspense; setState puro não dispara nada. */}
      <ViewTransition
        key={aba}
        name="conteudo-abas"
        share="auto"
        enter="auto"
        default="none"
      >
        <div>
          <TabsContent value="produtos" className="mt-2">
            <ProdutosList
              produtos={produtos}
              podeEditar={podeEditar}
              vePreco={vePreco}
              filtrosIniciais={filtrosIniciais}
            />
          </TabsContent>

          <TabsContent value="kits" className="mt-2">
            <KitsView
              kits={kits}
              podeEditar={podeEditar}
              vePreco={vePreco}
              podeEditarPreco={podeEditarPreco}
            />
          </TabsContent>
        </div>
      </ViewTransition>
    </Tabs>
  )
}
