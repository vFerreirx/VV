'use client'

import { useState, useTransition, ViewTransition } from 'react'

import { OrcamentosView } from './orcamentos-view'
import type { CompradorOpcao } from '../clientes/actions'
import { CompradoresList } from '../clientes/compradores-list'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Comprador } from '@/lib/db/schema'

type DadosDePedidos = Omit<
  React.ComponentProps<typeof OrcamentosView>,
  'novoPedidoPara' | 'onNovoPedidoFechado'
>

// AS DUAS ABAS, cada uma só pra quem tem a área dela (a página já decide o
// que carregar: `null` = sem a área, sem aba).
//
// A PONTE ENTRE AS DUAS: "Fazer pedido pra este cliente", na ficha do
// cliente, troca pra aba Pedidos e abre o diálogo com o cadastro escolhido.
export function PedidosTabs({
  tabInicial,
  pedidos,
  clientes,
}: {
  tabInicial: 'pedidos' | 'clientes'
  pedidos: DadosDePedidos | null
  clientes: {
    compradores: Comprador[]
    podeEditar: boolean
    clienteInicial: string | null
  } | null
}) {
  const abas = [
    pedidos ? { value: 'pedidos', label: 'Pedidos' } : null,
    clientes ? { value: 'clientes', label: 'Clientes' } : null,
  ].filter((a): a is { value: string; label: string } => a !== null)

  const def = abas.some((a) => a.value === tabInicial)
    ? tabInicial
    : (abas[0]?.value ?? 'pedidos')

  const [aba, setAba] = useState(def)
  const [, startTransition] = useTransition()
  const [novoPedidoPara, setNovoPedidoPara] = useState<CompradorOpcao | null>(null)

  const podeFazerPedido = pedidos?.podeEditar === true

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Pedidos</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Pedidos de atacado e o cadastro dos clientes.
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

        {/* Crossfade entre as abas, como na /fabrica: o <ViewTransition> só é
            ativado por Transition, por isso a troca vai em startTransition. */}
        <ViewTransition
          key={aba}
          name="conteudo-abas"
          share="auto"
          enter="auto"
          default="none"
        >
          <div>
            {pedidos && (
              <TabsContent value="pedidos" className="mt-2">
                <OrcamentosView
                  {...pedidos}
                  novoPedidoPara={novoPedidoPara}
                  onNovoPedidoFechado={() => setNovoPedidoPara(null)}
                />
              </TabsContent>
            )}
            {clientes && (
              <TabsContent value="clientes" className="mt-2">
                <CompradoresList
                  compradores={clientes.compradores}
                  podeEditar={clientes.podeEditar}
                  podeVerPedidos={pedidos !== null}
                  clienteInicial={clientes.clienteInicial}
                  onFazerPedido={
                    podeFazerPedido
                      ? (c) =>
                          startTransition(() => {
                            setAba('pedidos')
                            setNovoPedidoPara({ id: c.id, nome: c.nome })
                          })
                      : null
                  }
                />
              </TabsContent>
            )}
          </div>
        </ViewTransition>
      </Tabs>
    </div>
  )
}
