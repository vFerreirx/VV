'use client'

// "VOCÊ ESTÁ COBRINDO?" — a confirmação de tela antes de gravar numa máquina
// de OUTRA estação a partir deste tablet.
//
// A regra (quando perguntar e o quê) é pura e mora em
// src/lib/producao/cobertura.ts, com teste. Aqui é só o diálogo.
//
// ⚠️ NÃO É PERMISSÃO. O servidor aceita a ação de qualquer operador em
// qualquer máquina; isto pega o toque no cartão errado quando a aba aberta é
// de outra estação. A cobertura normal acontece no tablet da própria máquina,
// e ali não há pergunta nenhuma.
//
// ⚠️ PERGUNTA ANTES DO PIN. As ações passam por aqui e só depois pelo
// `exigirIdentidade` da trava: quem vai cancelar porque tocou na máquina
// errada não precisa digitar o PIN antes.

import { TriangleAlert } from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  avisoDeCobertura,
  type EstacaoRef,
  type MaquinaParaCobertura,
} from '@/lib/producao/cobertura'

type Cobertura = {
  /**
   * Roda `continuar` direto quando a máquina é da estação deste tablet (ou o
   * tablet não tem estação); senão pergunta antes, e só segue no "Sim".
   */
  confirmarCobertura: (
    maquina: MaquinaParaCobertura,
    continuar: () => void,
  ) => void
}

const CoberturaContext = createContext<Cobertura | null>(null)

export function useCobertura(): Cobertura {
  const c = useContext(CoberturaContext)
  if (!c) throw new Error('useCobertura fora do <CoberturaDoTablet>')
  return c
}

export function CoberturaDoTablet({
  estacaoDoAparelho,
  children,
}: {
  estacaoDoAparelho: EstacaoRef | null
  children: ReactNode
}) {
  const [pergunta, setPergunta] = useState<{
    texto: string
    continuar: () => void
  } | null>(null)

  const confirmarCobertura = useCallback(
    (maquina: MaquinaParaCobertura, continuar: () => void) => {
      const texto = avisoDeCobertura(maquina, estacaoDoAparelho)
      if (texto === null) {
        continuar()
        return
      }
      setPergunta({ texto, continuar })
    },
    [estacaoDoAparelho],
  )

  function gravar() {
    const acao = pergunta?.continuar
    setPergunta(null)
    acao?.()
  }

  return (
    <CoberturaContext.Provider value={{ confirmarCobertura }}>
      {children}
      {pergunta && (
        <Dialog open onOpenChange={(o) => !o && setPergunta(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-2xl">
                <TriangleAlert className="size-7 shrink-0 text-amber-600 dark:text-amber-400" />
                Outra estação
              </DialogTitle>
              <DialogDescription className="text-foreground text-lg">
                {pergunta.texto}
              </DialogDescription>
            </DialogHeader>
            {/* Alvo de 48px+, como todo botão que confirma no tablet. */}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button className="h-14 flex-1 text-lg" onClick={gravar}>
                Sim, gravar
              </Button>
              <Button
                variant="outline"
                className="h-14 flex-1 text-lg"
                onClick={() => setPergunta(null)}
              >
                Cancelar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </CoberturaContext.Provider>
  )
}
