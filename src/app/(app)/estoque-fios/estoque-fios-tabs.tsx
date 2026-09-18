'use client'

import { useState, useTransition, ViewTransition } from 'react'

import { CoresFornecedorList } from './cores-fornecedor-list'
import { GradeFios } from './grade-fios'
import { LotesFioList } from './lotes-fio-list'
import { ResumoPorCor } from './resumo-por-cor'
import { RetiradaDialog } from './retirada-dialog'
import type { CorFornecedorItem, LoteFioItem } from './actions'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Cor } from '@/lib/db/schema'

export function EstoqueFiosTabs({
  tabInicial,
  lotes,
  coresFornecedor,
  coresAtivas,
  podeEditar,
}: {
  tabInicial: string
  lotes: LoteFioItem[]
  coresFornecedor: CorFornecedorItem[]
  coresAtivas: Cor[]
  podeEditar: boolean
}) {
  // Duas das abas comem da mesma lista de lotes, e é de propósito — o que
  // muda é a PERGUNTA que cada uma responde, e por isso as colunas não se
  // repetem:
  //
  //  - "Estoque" responde "quanto tem de Cáqui?": o resumo por cor em cima
  //    (a manchete) e, embaixo, a grade no formato da planilha, com
  //    RETIRADA/TOTAL CAIXA/KG e a linha de TOTAL que se confere contra o
  //    rodapé dela. É a PRIMEIRA porque é a pergunta de quem abre a tela.
  //  - "Entradas de lote" responde "o que entrou, de quem e por quanto": é o
  //    caminho de cadastro e o lugar dos dados de compra (valor, R$/kg,
  //    vendedor, nota, vencimento) que a planilha da fábrica nunca teve.
  //    Trabalho de escritório, com a nota na mão — e por isso não é a
  //    primeira. Mostra só o que ENTROU DE VERDADE: os 51 lotes importados
  //    são saldo inicial e ficam de fora (ver a migration 61).
  //
  // O saldo aparece só na primeira; a compra, só na segunda. Se um dia uma
  // das duas ganhar a coluna da outra, elas voltam a dizer a mesma coisa.
  const abas = [
    { value: 'saldo', label: 'Estoque' },
    { value: 'entradas', label: 'Entradas de lote' },
    { value: 'cores', label: 'Cores do fornecedor' },
  ]
  const def = abas.some((a) => a.value === tabInicial)
    ? tabInicial
    : abas[0]!.value

  const coresFornecedorAtivas = coresFornecedor.filter((c) => c.ativo)

  const [aba, setAba] = useState(def)
  const [, startTransition] = useTransition()
  // O filtro de cor mora AQUI porque serve os dois: clicar no Cáqui do
  // resumo desce até as partidas de Cáqui na grade.
  const [cor, setCor] = useState<string | null>(null)
  const [retirando, setRetirando] = useState(false)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Estoque de fios</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          As entradas de lote, o estoque no formato da planilha e o de-para
          entre a cor do fornecedor e a cor do catálogo.
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
            <TabsContent value="saldo" className="mt-2 space-y-6">
              <ResumoPorCor
                lotes={lotes}
                coresFornecedor={coresFornecedor}
                corFiltrada={cor}
                onFiltrarCor={setCor}
                podeEditar={podeEditar}
                onRegistrarRetirada={() => setRetirando(true)}
                onIrParaCores={() =>
                  startTransition(() => setAba('cores'))
                }
              />
              <GradeFios lotes={lotes} cor={cor} onCor={setCor} />
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

      <RetiradaDialog
        aberto={retirando}
        lotes={lotes}
        corInicial={cor}
        onClose={() => setRetirando(false)}
      />
    </div>
  )
}
