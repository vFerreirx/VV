'use client'

import { useState, useTransition, ViewTransition } from 'react'

import Link from 'next/link'

import type { MaquinaListItem } from '../maquinas/actions'
import { MaquinasGrid } from '../maquinas/maquinas-grid'
import type { EstacaoComDetalhes, MaquinaOpcao, OperadorOpcao } from '../estacoes/actions'
import { EstacoesList } from '../estacoes/estacoes-list'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export function FabricaTabs({
  tabInicial,
  verMaquinas,
  verEstacoes,
  maquinas,
  podeEditarMaquinas,
  estacoes,
  operadores,
  maquinasOpcoes,
}: {
  tabInicial: string
  verMaquinas: boolean
  verEstacoes: boolean
  maquinas: MaquinaListItem[]
  podeEditarMaquinas: boolean
  estacoes: EstacaoComDetalhes[]
  operadores: OperadorOpcao[]
  maquinasOpcoes: MaquinaOpcao[]
}) {
  const abas = [
    verMaquinas ? { value: 'maquinas', label: 'Máquinas' } : null,
    verEstacoes ? { value: 'estacoes', label: 'Estações' } : null,
  ].filter((a): a is { value: string; label: string } => a !== null)

  const def = abas.some((a) => a.value === tabInicial) ? tabInicial : abas[0]?.value

  const [aba, setAba] = useState(def)
  const [, startTransition] = useTransition()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Fábrica</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Máquinas da fábrica e as estações (grupos com operador de dia e noite).
        </p>
      </div>

      <Tabs value={aba} onValueChange={(v) => startTransition(() => setAba(v ?? def))}>
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
        <ViewTransition key={aba} name="conteudo-abas" share="auto" enter="auto" default="none">
          <div>
            {verMaquinas && (
              <TabsContent value="maquinas" className="mt-2 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-muted-foreground text-sm">
                    {maquinas.length} máquina{maquinas.length === 1 ? '' : 's'}
                  </p>
                  {podeEditarMaquinas && (
                    <Button render={<Link href="/maquinas/novo" />}>Nova máquina</Button>
                  )}
                </div>
                <MaquinasGrid maquinas={maquinas} podeEditar={podeEditarMaquinas} />
              </TabsContent>
            )}

            {verEstacoes && (
              <TabsContent value="estacoes" className="mt-2">
                <EstacoesList
                  estacoes={estacoes}
                  operadores={operadores}
                  maquinas={maquinasOpcoes}
                />
              </TabsContent>
            )}
          </div>
        </ViewTransition>
      </Tabs>
    </div>
  )
}
