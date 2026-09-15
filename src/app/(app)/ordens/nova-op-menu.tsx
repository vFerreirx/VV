'use client'

// O TOPO DA /ordens: "Nova OP" como botão principal, e as outras formas de
// criar OP atrás do "▾".
//
// Eram quatro botões soltos lado a lado (Importar Full, Novo Full, Gerar de
// kit, Nova OP), e o caminho do dia a dia — uma OP avulsa — tinha o mesmo peso
// dos três que se usam de vez em quando. Agora ele é o botão; kit, Full manual
// e Full por PDF moram no menu, e cada diálogo continua sendo o dele.

import { ChevronDown, Combine, FileUp, PackageOpen, Plus } from 'lucide-react'
import Link from 'next/link'
import { useState, type ComponentProps } from 'react'

import { GerarDeKit } from './gerar-de-kit'
import { NovoFull } from './novo-full'
import { NovaOpDialog } from '@/components/ordens/nova-op-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type Aberto = 'nova' | 'kit' | 'full' | null

export function NovaOpMenu({
  produtosNovaOp,
  kits,
  produtosParaKitEFull,
  remessas,
  contas,
}: {
  /** Só variações ativas — o "Nova OP" não oferece variação apagada. */
  produtosNovaOp: ComponentProps<typeof NovaOpDialog>['produtos']
  kits: ComponentProps<typeof GerarDeKit>['kits']
  produtosParaKitEFull: ComponentProps<typeof GerarDeKit>['produtos']
  remessas: ComponentProps<typeof NovoFull>['remessas']
  contas: ComponentProps<typeof NovoFull>['contas']
}) {
  const [aberto, setAberto] = useState<Aberto>(null)

  return (
    <>
      <div className="flex">
        <Button className="rounded-r-none" onClick={() => setAberto('nova')}>
          <Plus />
          Nova OP
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                className="border-primary-foreground/20 rounded-l-none border-l px-2"
                aria-label="Outras formas de criar OP"
              />
            }
          >
            <ChevronDown />
          </DropdownMenuTrigger>
          {/* `w-auto`: o padrão do conteúdo é a largura do gatilho, e aqui o
              gatilho é só a seta. */}
          <DropdownMenuContent align="end" className="w-auto whitespace-nowrap">
            <DropdownMenuItem
              // Sem kit cadastrado a opção fica à vista, desabilitada: sumir
              // faria parecer que o sistema não gera OP de kit.
              disabled={kits.length === 0}
              onClick={() => setAberto('kit')}
            >
              <Combine />
              De um kit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setAberto('full')}>
              <PackageOpen />
              Full manual
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/ordens/importar-full" />}>
              <FileUp />
              Full por PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {aberto === 'nova' && (
        <NovaOpDialog produtos={produtosNovaOp} onClose={() => setAberto(null)} />
      )}
      {kits.length > 0 && (
        <GerarDeKit
          kits={kits}
          produtos={produtosParaKitEFull}
          open={aberto === 'kit'}
          onOpenChange={(o) => setAberto(o ? 'kit' : null)}
        />
      )}
      <NovoFull
        remessas={remessas}
        produtos={produtosParaKitEFull}
        contas={contas}
        open={aberto === 'full'}
        onOpenChange={(o) => setAberto(o ? 'full' : null)}
      />
    </>
  )
}
