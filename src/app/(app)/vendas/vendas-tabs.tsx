'use client'

import { useState, useTransition, ViewTransition } from 'react'

import type { VendaDia } from './actions'
import { VendasView } from './vendas-view'
import type { RelatorioMensal } from '../relatorios/actions'
import { RelatorioView } from '../relatorios/relatorio-view'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export function VendasTabs({
  tabInicial,
  data,
  vendaDoDia,
  recentes,
  podeEditar,
  relatorio,
  comparacao,
}: {
  tabInicial: 'diario' | 'mensal'
  data: string
  vendaDoDia: VendaDia | null
  recentes: VendaDia[]
  podeEditar: boolean
  relatorio: RelatorioMensal
  comparacao: RelatorioMensal | null
}) {
  const [aba, setAba] = useState(tabInicial)
  const [, startTransition] = useTransition()

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <h1 className="text-2xl font-semibold">Vendas</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Registro diário e fechamento mensal.
        </p>
      </div>

      <Tabs
        value={aba}
        onValueChange={(v) => startTransition(() => setAba(v ?? tabInicial))}
      >
        <TabsList className="print:hidden">
          <TabsTrigger value="diario">Diário</TabsTrigger>
          <TabsTrigger value="mensal">Mensal</TabsTrigger>
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

            <TabsContent value="diario" className="mt-2">
              <VendasView
                data={data}
                vendaDoDia={vendaDoDia}
                recentes={recentes}
                podeEditar={podeEditar}
              />
            </TabsContent>

            <TabsContent value="mensal" className="mt-2">
              <RelatorioView relatorio={relatorio} comparacao={comparacao} />
            </TabsContent>
          </div>
        </ViewTransition>
      </Tabs>
    </div>
  )
}
