'use client'

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
}: {
  tabInicial: 'diario' | 'mensal'
  data: string
  vendaDoDia: VendaDia | null
  recentes: VendaDia[]
  podeEditar: boolean
  relatorio: RelatorioMensal
}) {
  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <h1 className="text-2xl font-semibold">Vendas</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Registro diário e fechamento mensal.
        </p>
      </div>

      <Tabs defaultValue={tabInicial}>
        <TabsList className="print:hidden">
          <TabsTrigger value="diario">Diário</TabsTrigger>
          <TabsTrigger value="mensal">Mensal</TabsTrigger>
        </TabsList>

        <TabsContent value="diario" className="mt-2">
          <VendasView
            data={data}
            vendaDoDia={vendaDoDia}
            recentes={recentes}
            podeEditar={podeEditar}
          />
        </TabsContent>

        <TabsContent value="mensal" className="mt-2">
          <RelatorioView relatorio={relatorio} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
