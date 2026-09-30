'use client'

import { Check, TabletSmartphone } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from 'sonner'

import {
  definirEstacaoDoAparelhoAction,
  type EstacaoParaAparelho,
} from './actions'
import { Button } from '@/components/ui/button'
import { nomesDasMaquinas } from '@/lib/producao/nome-da-maquina'
import { cn } from '@/lib/utils'

// Botões grandes: isto é feito NO TABLET, de pé, com o dedo — uma vez por
// aparelho. A atual fica marcada pra dar pra conferir sem mudar nada.
export function EscolherEstacao({
  atualId,
  atualNome,
  estacoes,
}: {
  atualId: string | null
  atualNome: string | null
  estacoes: EstacaoParaAparelho[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function escolher(id: string | null) {
    startTransition(async () => {
      const r = await definirEstacaoDoAparelhoAction(id)
      if (!r.success) {
        toast.error(r.error)
        return
      }
      const nome = estacoes.find((e) => e.id === id)?.nome
      toast.success(
        nome ? `Este tablet agora é da ${nome}` : 'Este tablet ficou sem estação',
      )
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="bg-card flex items-center gap-3 rounded-xl border p-4">
        <TabletSmartphone className="text-muted-foreground size-6 shrink-0" />
        <p className="text-base">
          Agora:{' '}
          <span className="font-semibold">
            {atualNome ?? 'sem estação definida'}
          </span>
        </p>
      </div>

      {estacoes.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
          Nenhuma estação cadastrada. Crie as estações em Fábrica → Estações.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {estacoes.map((e) => {
            const atual = e.id === atualId
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => escolher(e.id)}
                disabled={isPending || atual}
                aria-pressed={atual}
                className={cn(
                  'bg-card flex min-h-20 flex-col items-start gap-1 rounded-xl border-2 p-4 text-left transition-colors disabled:cursor-default',
                  atual
                    ? 'border-primary'
                    : 'hover:bg-accent border-border disabled:opacity-60',
                )}
                style={e.cor ? { borderLeftColor: e.cor, borderLeftWidth: 8 } : undefined}
              >
                <span className="flex items-center gap-2 text-xl font-semibold">
                  {e.nome}
                  {atual && <Check className="text-primary size-5" />}
                </span>
                <span className="text-muted-foreground text-sm tabular-nums">
                  {e.maquinas.length === 0
                    ? 'Sem máquinas'
                    : nomesDasMaquinas(e.maquinas)}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {atualId !== null && (
        <Button
          variant="outline"
          className="h-11"
          onClick={() => escolher(null)}
          disabled={isPending}
        >
          Tirar a estação deste tablet
        </Button>
      )}
    </div>
  )
}
