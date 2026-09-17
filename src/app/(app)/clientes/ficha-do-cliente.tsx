'use client'

// A FICHA DO CLIENTE — os dados e os pedidos dele, num painel lateral.
//
// A lista de clientes só mostrava a linha do cadastro; "o que esse cliente já
// comprou" exigia ir pra lista de pedidos e procurar pelo nome. A ficha junta
// as duas coisas, e o "Fazer pedido pra este cliente" começa o pedido com o
// cadastro já escolhido — que é o caminho principal do pedido agora.
//
// OS PEDIDOS SÓ APARECEM PRA QUEM TEM A ÁREA `pedidos`. Quem cuida só do
// cadastro vê os dados, sem os valores de venda.

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Pencil, Plus } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import {
  listarPedidosDoComprador,
  type PedidoDoCliente,
} from '@/app/(app)/pedidos/actions'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { Comprador } from '@/lib/db/schema'
import { ROTULO_STATUS } from '@/lib/pedido-status'
import { formatarDocumento } from '@/lib/validators/documento'
import { formatarNumeroPedido } from '@/lib/validators/orcamentos'

function reais(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function FichaDoCliente({
  comprador,
  onClose,
  podeEditar,
  onEditar,
  podeVerPedidos,
  onFazerPedido,
}: {
  comprador: Comprador | null
  onClose: () => void
  podeEditar: boolean
  onEditar: (c: Comprador) => void
  podeVerPedidos: boolean
  /** Null pra quem não tem escrita em Pedidos: o botão nem aparece. */
  onFazerPedido: ((c: Comprador) => void) | null
}) {
  return (
    <Sheet open={comprador !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {/* Key remonta ao trocar de cliente: a lista de pedidos recomeça. */}
        {comprador && (
          <Corpo
            key={comprador.id}
            comprador={comprador}
            podeEditar={podeEditar}
            onEditar={onEditar}
            podeVerPedidos={podeVerPedidos}
            onFazerPedido={onFazerPedido}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

function Corpo({
  comprador: c,
  podeEditar,
  onEditar,
  podeVerPedidos,
  onFazerPedido,
}: {
  comprador: Comprador
  podeEditar: boolean
  onEditar: (c: Comprador) => void
  podeVerPedidos: boolean
  onFazerPedido: ((c: Comprador) => void) | null
}) {
  const [pedidos, setPedidos] = useState<PedidoDoCliente[] | null>(null)

  useEffect(() => {
    if (!podeVerPedidos) return
    let vivo = true
    listarPedidosDoComprador(c.id).then((r) => {
      if (vivo) setPedidos(r)
    })
    return () => {
      vivo = false
    }
  }, [c.id, podeVerPedidos])

  const endereco = [
    [c.logradouro, c.numero].filter(Boolean).join(', '),
    c.complemento,
    c.bairro,
    [c.cidade, c.uf].filter(Boolean).join(' - '),
    c.cep,
  ].filter(Boolean)

  return (
    <>
      <SheetHeader>
        <SheetTitle>{c.nome}</SheetTitle>
        <SheetDescription>Ficha do cliente</SheetDescription>
      </SheetHeader>

      <div className="space-y-5 px-4 pb-4">
        <div className="flex flex-wrap gap-2">
          {onFazerPedido && (
            <Button size="sm" onClick={() => onFazerPedido(c)}>
              <Plus />
              Fazer pedido pra este cliente
            </Button>
          )}
          {podeEditar && (
            <Button size="sm" variant="outline" onClick={() => onEditar(c)}>
              <Pencil />
              Editar
            </Button>
          )}
        </div>

        <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">CPF/CNPJ</dt>
          <dd className="tabular-nums">{formatarDocumento(c.documento) || '—'}</dd>
          <dt className="text-muted-foreground">Telefone</dt>
          <dd>{c.telefone || '—'}</dd>
          <dt className="text-muted-foreground">Endereço</dt>
          <dd>
            {endereco.length === 0
              ? '—'
              : endereco.map((l) => <span key={l} className="block">{l}</span>)}
          </dd>
          {c.observacao && (
            <>
              <dt className="text-muted-foreground">Observação</dt>
              <dd className="whitespace-pre-line">{c.observacao}</dd>
            </>
          )}
        </dl>

        {podeVerPedidos && (
          <section className="space-y-2">
            <h3 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Pedidos
            </h3>
            {pedidos === null ? (
              <p className="text-muted-foreground text-sm">Carregando…</p>
            ) : pedidos.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nenhum pedido deste cliente ainda.
              </p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {pedidos.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/pedidos/${p.id}`}
                      className="hover:bg-muted/50 flex items-center justify-between gap-3 px-3 py-2 text-sm"
                    >
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="font-mono text-xs">
                          #{formatarNumeroPedido(p.numero)}
                        </span>
                        <span className="text-muted-foreground tabular-nums">
                          {format(new Date(p.createdAt), 'dd/MM/yyyy', { locale: ptBR })}
                        </span>
                        <span className="text-muted-foreground truncate text-xs">
                          {ROTULO_STATUS[p.status]}
                        </span>
                      </span>
                      <span className="shrink-0 font-medium tabular-nums">
                        {reais(p.totalFinal)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </>
  )
}
