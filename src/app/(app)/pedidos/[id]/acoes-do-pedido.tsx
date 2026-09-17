'use client'

// DUPLICAR, EDITAR E EXCLUIR, NO TOPO DO PEDIDO. Moravam em seis ícones em
// cada linha da lista, junto dos documentos; a lista virou só lista, e as
// ações sobre UM pedido ficam na página dele. As regras e as permissões são as
// de antes: o mesmo diálogo, as mesmas actions, e só pra quem tem escrita em
// Pedidos (quem chama nem renderiza isto sem ela).

import { Copy, Pencil, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

import { obterOrcamento } from '../actions'
import {
  ExcluirDialog,
  OrcamentoDialog,
  type Edicao,
} from '../orcamentos-view'
import type { CompradorOpcao } from '../../clientes/actions'
import type { KitComItens } from '../../kits/actions'
import type { ProdutoComVariacoesParaForm } from '../../ordens/actions'
import { Button } from '@/components/ui/button'
import type { TabelaDePrecos } from '@/lib/preco'

export function AcoesDoPedido({
  pedido,
  produtos,
  kits,
  precos,
  tabela,
  compradores,
}: {
  pedido: { id: string; numero: number; cliente: string }
  produtos: ProdutoComVariacoesParaForm[]
  kits: KitComItens[]
  precos: Record<string, string>
  tabela: TabelaDePrecos
  compradores: CompradorOpcao[]
}) {
  const router = useRouter()
  const [editando, setEditando] = useState<Edicao | null>(null)
  const [excluindo, setExcluindo] = useState(false)
  const [abrindo, setAbrindo] = useState(false)

  // Busca o pedido e SÓ ENTÃO abre o diálogo — mesmo motivo da lista: chamar
  // a action no meio do render do diálogo fazia o Router atualizar durante
  // outro render.
  function abrir(modo: 'editar' | 'duplicar') {
    setAbrindo(true)
    void obterOrcamento(pedido.id)
      .then((dados) => {
        if (!dados) {
          toast.error('Pedido não encontrado')
          return
        }
        setEditando({ modo, id: pedido.id, dados })
      })
      .finally(() => setAbrindo(false))
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => abrir('duplicar')}
        disabled={abrindo}
        title="Novo pedido com os mesmos itens"
      >
        <Copy />
        Duplicar
      </Button>
      <Button variant="outline" onClick={() => abrir('editar')} disabled={abrindo}>
        <Pencil />
        Editar
      </Button>
      <Button
        variant="outline"
        onClick={() => setExcluindo(true)}
        aria-label="Excluir pedido"
      >
        <Trash2 className="text-destructive" />
        Excluir
      </Button>

      {editando && (
        <OrcamentoDialog
          edicao={editando}
          produtos={produtos}
          kits={kits}
          precos={precos}
          tabela={tabela}
          compradores={compradores}
          onClose={() => setEditando(null)}
          onSalvo={(id) => {
            // Duplicar cria outro pedido: vai pra ele. Editar fica aqui.
            if (id !== pedido.id) router.push(`/pedidos/${id}`)
            else router.refresh()
          }}
        />
      )}
      <ExcluirDialog
        orcamento={excluindo ? pedido : null}
        onClose={() => setExcluindo(false)}
        onExcluido={() => router.push('/pedidos')}
      />
    </>
  )
}
