'use client'

import { useState, useTransition, ViewTransition } from 'react'

import { CoresList } from '../cores/cores-list'
import { ModelosList } from '../modelos/modelos-list'
import { TamanhosList } from '../tamanhos/tamanhos-list'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Cor, Modelo, Tamanho } from '@/lib/db/schema'

type Acesso = { ver: boolean; editar: boolean }

export function VariacoesTabs({
  tabInicial,
  cores,
  modelos,
  tamanhos,
  acessoCores,
  acessoModelos,
  acessoTamanhos,
}: {
  tabInicial: string
  cores: Cor[]
  modelos: Modelo[]
  tamanhos: Tamanho[]
  acessoCores: Acesso
  acessoModelos: Acesso
  acessoTamanhos: Acesso
}) {
  const abas = [
    acessoCores.ver ? { value: 'cores', label: 'Cores' } : null,
    acessoModelos.ver ? { value: 'modelos', label: 'Modelos' } : null,
    acessoTamanhos.ver ? { value: 'tamanhos', label: 'Tamanhos' } : null,
  ].filter((a): a is { value: string; label: string } => a !== null)

  const def = abas.some((a) => a.value === tabInicial)
    ? tabInicial
    : abas[0]?.value

  const [aba, setAba] = useState(def)
  const [, startTransition] = useTransition()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Variações</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Cores, modelos e tamanhos usados nas variações de produto.
        </p>
      </div>

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

        {/* Crossfade: "mesmo lugar, outro conteudo". Um slide diria "fui
            pra outra tela", que nao e o caso — a barra de abas e o resto do
            layout ficam parados.

            As abas viraram controladas e a troca vai dentro de
            startTransition porque o <ViewTransition> so e ativado por
            Transition/Suspense; setState puro nao dispara nada. */}
        <ViewTransition
          key={aba}
          name="conteudo-abas"
          share="auto"
          enter="auto"
          default="none"
        >
          <div>

            {acessoCores.ver && (
              <TabsContent value="cores" className="mt-2">
                <CoresList cores={cores} podeEditar={acessoCores.editar} />
              </TabsContent>
            )}
            {acessoModelos.ver && (
              <TabsContent value="modelos" className="mt-2">
                <ModelosList modelos={modelos} podeEditar={acessoModelos.editar} />
              </TabsContent>
            )}
            {acessoTamanhos.ver && (
              <TabsContent value="tamanhos" className="mt-2">
                <TamanhosList
                  tamanhos={tamanhos}
                  podeEditar={acessoTamanhos.editar}
                />
              </TabsContent>
            )}
          </div>
        </ViewTransition>
      </Tabs>
    </div>
  )
}
