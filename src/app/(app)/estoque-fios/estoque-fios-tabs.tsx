'use client'

import { useState, useTransition, ViewTransition } from 'react'

import { CoresFornecedorList } from './cores-fornecedor-list'
import { LotesFioList } from './lotes-fio-list'
import { SaldoPorCor } from './saldo-por-cor'
import type { CorFornecedorItem, LoteFioItem } from './actions'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Cor } from '@/lib/db/schema'
import type { SaldoDaCor } from '@/lib/fios/saldo'

export function EstoqueFiosTabs({
  tabInicial,
  saldo,
  lotes,
  coresFornecedor,
  coresAtivas,
  podeEditar,
}: {
  tabInicial: string
  saldo: SaldoDaCor[]
  lotes: LoteFioItem[]
  coresFornecedor: CorFornecedorItem[]
  coresAtivas: Cor[]
  podeEditar: boolean
}) {
  // "Saldo" primeiro: a pergunta de todo dia é "tenho Cáqui?", não "o que
  // entrou na terça". O livro de entradas continua existindo, em segundo.
  const abas = [
    { value: 'saldo', label: 'Saldo por cor' },
    { value: 'entradas', label: 'Entradas de lote' },
    { value: 'cores', label: 'Cores do fornecedor' },
  ]
  const def = abas.some((a) => a.value === tabInicial)
    ? tabInicial
    : abas[0]!.value

  const coresFornecedorAtivas = coresFornecedor.filter((c) => c.ativo)

  const [aba, setAba] = useState(def)
  const [, startTransition] = useTransition()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Estoque de fios</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          O que tem em estoque por cor, as entradas de lote e o de-para entre a
          cor do fornecedor e a cor do catálogo.
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
            <TabsContent value="saldo" className="mt-2">
              <SaldoPorCor cores={saldo} />
            </TabsContent>

            <TabsContent value="entradas" className="mt-2">
              <LotesFioList
                lotes={lotes}
                coresFornecedorAtivas={coresFornecedorAtivas}
                podeEditar={podeEditar}
              />
            </TabsContent>

            <TabsContent value="cores" className="mt-2">
              <CoresFornecedorList
                coresFornecedor={coresFornecedor}
                coresAtivas={coresAtivas}
                podeEditar={podeEditar}
              />
            </TabsContent>
          </div>
        </ViewTransition>
      </Tabs>
    </div>
  )
}
