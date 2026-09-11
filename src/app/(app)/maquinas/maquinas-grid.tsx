'use client'

import { Factory, Pencil, Power, Trash2, Wrench } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  excluirMaquinaAction,
  trocarStatusAction,
  type MaquinaListItem,
} from './actions'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import {
  situacaoDaMaquina,
  type SituacaoDaMaquina,
} from '@/lib/producao/estado-maquina'
import { cn } from '@/lib/utils'

type Props = {
  maquinas: MaquinaListItem[]
  podeEditar: boolean
}

// A cor sai do TOM da regra compartilhada, não do status cru. Enquanto era
// um mapa por status aqui, "operando" pintava de verde 18 máquinas paradas.
const TOM_DOT: Record<SituacaoDaMaquina['tom'], string> = {
  producao: 'bg-emerald-500',
  livre: 'bg-sky-500',
  atencao: 'bg-orange-500',
  inativa: 'bg-muted-foreground',
}

const SEM_ESTACAO = '__sem__'

// Agrupa as máquinas pela estação (Turma 1/2/3), na ordem das estações;
// máquinas sem estação ficam num grupo no final. A ordem dentro de cada
// grupo segue a listagem (por código: Máquina 1, 2, 3…).
function agruparPorEstacao(maquinas: MaquinaListItem[]) {
  const mapa = new Map<string, MaquinaListItem[]>()
  for (const m of maquinas) {
    const chave = m.estacaoNome ?? SEM_ESTACAO
    const arr = mapa.get(chave)
    if (arr) arr.push(m)
    else mapa.set(chave, [m])
  }
  return Array.from(mapa.entries())
    .sort(([a], [b]) => {
      if (a === SEM_ESTACAO) return 1
      if (b === SEM_ESTACAO) return -1
      return a.localeCompare(b, 'pt-BR', { numeric: true })
    })
    .map(([chave, ops]) => ({
      estacao: chave === SEM_ESTACAO ? null : chave,
      maquinas: ops,
    }))
}

export function MaquinasGrid({ maquinas, podeEditar }: Props) {
  const [excluindo, setExcluindo] = useState<MaquinaListItem | null>(null)

  if (maquinas.length === 0) {
    return (
      <EmptyState
        icon={Factory}
        title="Nenhuma máquina cadastrada"
        description="Cadastre as máquinas da fábrica pra usar nas estações e nas OPs."
      />
    )
  }

  const grupos = agruparPorEstacao(maquinas)

  return (
    <>
      <div className="space-y-6">
        {grupos.map((g) => (
          <section key={g.estacao ?? SEM_ESTACAO} className="space-y-2.5">
            <div className="flex items-baseline gap-2">
              <h2 className="text-sm font-semibold">
                {g.estacao ?? 'Sem estação'}
              </h2>
              <span className="text-muted-foreground text-xs">
                {g.maquinas.length}{' '}
                {g.maquinas.length === 1 ? 'máquina' : 'máquinas'}
              </span>
            </div>
            <div className="vv-stagger grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {g.maquinas.map((m) => (
                <MaquinaCard
                  key={m.id}
                  maquina={m}
                  podeEditar={podeEditar}
                  onExcluir={() => setExcluindo(m)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <ExcluirDialog maquina={excluindo} onClose={() => setExcluindo(null)} />
    </>
  )
}

// -----------------------------------------------------------------
// Card de máquina
// -----------------------------------------------------------------

function MaquinaCard({
  maquina,
  podeEditar,
  onExcluir,
}: {
  maquina: MaquinaListItem
  podeEditar: boolean
  onExcluir: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // ⚠️ A MESMA FUNÇÃO DA TELA DO OPERADOR e do seletor do kanban
  // (src/lib/producao/estado-maquina.ts). Enquanto cada tela respondia por
  // conta própria, esta aqui lia só `maquinas.status` e dizia "Operando" nas
  // 18 máquinas com a fábrica parada.
  const s = situacaoDaMaquina(maquina.status, maquina.op !== null)
  const emManutencao = s.disponibilidade === 'manutencao'
  const desativada = s.disponibilidade === 'desativada'

  function definirStatus(novo: 'operando' | 'manutencao' | 'desativada') {
    startTransition(async () => {
      const result = await trocarStatusAction(maquina.id, { status: novo })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'Situação atualizada')
      router.refresh()
    })
  }

  return (
    <article className="vv-lift flex flex-col gap-3 rounded-xl border p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn('size-2.5 shrink-0 rounded-full', TOM_DOT[s.tom])}
            title={s.rotulo}
          />
          <div className="min-w-0">
            {/* O CÓDIGO NA FRENTE. A tela do operador identifica a máquina
                por ele ("TC-07") e esta aqui mostrava só o nome ("Máquina
                7") — duas telas nomeando o mesmo objeto de jeitos
                diferentes, com o operador tendo que traduzir. */}
            <div className="truncate font-medium">
              <span className="tabular-nums">{maquina.codigo}</span>
              <span className="text-muted-foreground font-normal">
                {' · '}
                {maquina.nome}
              </span>
            </div>
            <div
              className={cn(
                'text-xs',
                s.tom === 'producao' && 'font-medium text-emerald-700 dark:text-emerald-400',
                s.tom === 'atencao' && 'font-medium text-orange-700 dark:text-orange-400',
                (s.tom === 'livre' || s.tom === 'inativa') && 'text-muted-foreground',
              )}
            >
              {s.rotulo}
            </div>
          </div>
        </div>

        {podeEditar && (
          <div className="flex shrink-0 gap-0.5">
            <Button
              size="icon-sm"
              variant="ghost"
              render={<Link href={`/maquinas/${maquina.id}`} />}
              aria-label="Editar"
            >
              <Pencil />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={onExcluir}
              aria-label="Excluir"
            >
              <Trash2 className="text-destructive" />
            </Button>
          </div>
        )}
      </div>

      {/* ⚠️ A OP APARECE MESMO SOB MANUTENÇÃO. Os dois eixos são
          independentes: a manchete acima diz "Em manutenção", e esta linha
          diz que há trabalho preso ali dentro. Mostrar só um dos dois manda
          quem olha decidir errado — ou acha que a máquina está livre, ou
          acha que a OP sumiu. */}
      {maquina.op && (
        <div className="min-w-0 rounded-md border px-2.5 py-2 text-xs">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate font-medium">
              {maquina.op.produtoNome}
            </span>
            <span className="text-muted-foreground shrink-0 tabular-nums">
              {maquina.op.numero}
            </span>
          </div>
          {variacaoDe(maquina.op) && (
            <div className="text-muted-foreground truncate">
              {variacaoDe(maquina.op)}
            </div>
          )}
          <div className="text-muted-foreground mt-0.5 tabular-nums">
            {maquina.op.quantidade} peças
            {maquina.op.responsavelNome &&
              ` · responsável: ${maquina.op.responsavelNome}`}
          </div>
        </div>
      )}

      {podeEditar && (
        <div className="flex gap-1.5">
          {/* MANUTENÇÃO é toggle, e SAIR DELA NÃO DECLARA PRODUÇÃO: grava
              'operando', que passou a significar só "apta". A manchete então
              é recalculada da OP — se o trabalho continua lá, volta a "Em
              produção"; se não, "Livre". Antes isto gravava 'operando' com o
              sentido de "está rodando", e a máquina mentia até alguém
              corrigir à mão. */}
          <Button
            size="sm"
            variant={emManutencao ? 'default' : 'outline'}
            className="flex-1"
            disabled={isPending}
            aria-pressed={emManutencao}
            onClick={() =>
              definirStatus(emManutencao ? 'operando' : 'manutencao')
            }
          >
            <Wrench />
            Manutenção
          </Button>
          <Button
            size="sm"
            variant={desativada ? 'default' : 'outline'}
            className="flex-1"
            disabled={isPending}
            aria-pressed={desativada}
            onClick={() =>
              definirStatus(desativada ? 'operando' : 'desativada')
            }
          >
            <Power />
            {desativada ? 'Ativar' : 'Desativar'}
          </Button>
        </div>
      )}
    </article>
  )
}

/** "Terracota · King" — o que identifica a peça sem o nome do produto. */
function variacaoDe(op: {
  variacaoCor: string | null
  variacaoModelo: string | null
  variacaoTamanho: string | null
}): string {
  return [op.variacaoCor, op.variacaoModelo, op.variacaoTamanho]
    .filter(Boolean)
    .join(' · ')
}

// -----------------------------------------------------------------
// Dialog de exclusão
// -----------------------------------------------------------------

function ExcluirDialog({
  maquina,
  onClose,
}: {
  maquina: MaquinaListItem | null
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function excluir() {
    if (!maquina) return
    startTransition(async () => {
      const result = await excluirMaquinaAction(maquina.id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'Excluída')
      router.refresh()
      onClose()
    })
  }

  return (
    <Dialog open={maquina !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir máquina?</DialogTitle>
          <DialogDescription>
            {maquina?.nome} será marcada como excluída. As OPs vinculadas
            mantêm a referência histórica.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button loading={isPending} variant="destructive" onClick={excluir} disabled={isPending}>
            {'Excluir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
