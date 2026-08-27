'use client'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  ArchiveRestore,
  Combine,
  Factory,
  Grid2x2,
  ListChecks,
  ListTodo,
  Package,
  PackageSearch,
  Palette,
  Repeat,
  Ruler,
  Shapes,
  Trash2,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  esvaziarLixeiraAction,
  excluirDefinitivamenteAction,
  restaurarAction,
  type ItemLixeira,
  type RelatorioEsvaziar,
  type TipoLixeira,
} from './actions'
import { Badge } from '@/components/ui/badge'
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
import { Input } from '@/components/ui/input'

const ICONE: Record<TipoLixeira, LucideIcon> = {
  produto: Package,
  op: ListChecks,
  kit: Combine,
  cor: Palette,
  modelo: Shapes,
  tamanho: Ruler,
  maquina: Factory,
  estacao: Grid2x2,
  remessa: PackageSearch,
  tarefa: ListTodo,
  diaria: Repeat,
}

const TIPO_LABEL: Record<TipoLixeira, string> = {
  produto: 'Produto',
  op: 'OP',
  kit: 'Kit',
  cor: 'Cor',
  modelo: 'Modelo',
  tamanho: 'Tamanho',
  maquina: 'Máquina',
  estacao: 'Estação',
  remessa: 'Remessa',
  tarefa: 'Tarefa',
  diaria: 'Diária',
}

// O que some JUNTO com o item, por cascata do banco. Só os tipos que levam
// alguma coisa a reboque — é o que a pessoa precisa saber antes de confirmar.
const CASCATA: Partial<Record<TipoLixeira, string>> = {
  produto: 'As variações desse produto somem junto.',
  op: 'O histórico de kanban dessa OP some junto.',
  kit: 'Os componentes do kit somem junto (os produtos em si ficam).',
  estacao: 'As máquinas dessa estação ficam sem estação.',
}

// Digitar isto libera o "esvaziar". Só no esvaziar: ali são centenas de
// registros de uma vez, e o clique errado não tem desfazer. Pra um item só o
// diálogo já diz o nome do que vai sumir, e exigir digitação a cada linha
// tornaria limpar a lixeira um castigo.
const PALAVRA_CONFIRMACAO = 'APAGAR'

export function LixeiraList({
  itens,
  total,
}: {
  itens: ItemLixeira[]
  total: number
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [restaurandoId, setRestaurandoId] = useState<string | null>(null)
  const [apagando, setApagando] = useState<ItemLixeira | null>(null)
  const [esvaziando, setEsvaziando] = useState(false)

  function restaurar(item: ItemLixeira) {
    setRestaurandoId(item.id)
    startTransition(async () => {
      const result = await restaurarAction(item.tipo, item.id)
      setRestaurandoId(null)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(`${TIPO_LABEL[item.tipo]} "${item.titulo}" restaurado`)
      router.refresh()
    })
  }

  if (itens.length === 0) {
    return (
      <EmptyState
        icon={Trash2}
        title="Lixeira vazia"
        description="Nada foi excluído — ou tudo que foi já voltou."
      />
    )
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {total === 1 ? '1 item na lixeira' : `${total} itens na lixeira`}
          {itens.length < total && ` · mostrando os ${itens.length} mais recentes`}
        </p>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setEsvaziando(true)}
          disabled={isPending}
        >
          <Trash2 />
          Esvaziar lixeira
        </Button>
      </div>

      <div className="divide-y rounded-lg border">
        {itens.map((item) => {
          const Icone = ICONE[item.tipo]
          return (
            <div
              key={`${item.tipo}-${item.id}`}
              className="flex items-center gap-3 px-4 py-2.5"
            >
              <Icone className="text-muted-foreground size-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {item.titulo}
                </div>
                <div className="text-muted-foreground truncate text-xs">
                  {item.subtitulo} · excluído em{' '}
                  {format(new Date(item.excluidoEm), "dd/MM/yyyy 'às' HH:mm", {
                    locale: ptBR,
                  })}
                </div>
              </div>
              <Badge variant="secondary" className="shrink-0">
                {TIPO_LABEL[item.tipo]}
              </Badge>
              {/* As duas ações são OPOSTAS. Ficam separadas por um traço, e a
                  destrutiva é a única vermelha da linha. */}
              <Button
                size="sm"
                variant="outline"
                onClick={() => restaurar(item)}
                disabled={isPending}
              >
                <ArchiveRestore />
                {restaurandoId === item.id ? 'Restaurando…' : 'Restaurar'}
              </Button>
              <span aria-hidden className="bg-border h-5 w-px" />
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setApagando(item)}
                disabled={isPending}
                title="Apagar de vez (sem desfazer)"
              >
                <Trash2 />
                Apagar
              </Button>
            </div>
          )
        })}
      </div>

      <ApagarDialog
        item={apagando}
        onClose={() => setApagando(null)}
        onDone={() => {
          setApagando(null)
          router.refresh()
        }}
      />
      <EsvaziarDialog
        open={esvaziando}
        total={total}
        onClose={() => setEsvaziando(false)}
        onDone={() => router.refresh()}
      />
    </>
  )
}

function ApagarDialog({
  item,
  onClose,
  onDone,
}: {
  item: ItemLixeira | null
  onClose: () => void
  onDone: () => void
}) {
  const [isPending, startTransition] = useTransition()

  function apagar() {
    if (!item) return
    startTransition(async () => {
      const r = await excluirDefinitivamenteAction(item.tipo, item.id)
      if (!r.success) {
        // Bloqueio explicado: a mensagem diz o que segura o registro.
        toast.error(r.error, { duration: 10000 })
        return
      }
      toast.success(`${TIPO_LABEL[item.tipo]} "${item.titulo}" apagado de vez`)
      onDone()
    })
  }

  const cascata = item ? CASCATA[item.tipo] : undefined

  return (
    <Dialog open={item !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-destructive">
            Apagar de vez?
          </DialogTitle>
          <DialogDescription>
            <span className="text-foreground font-medium">{item?.titulo}</span>{' '}
            será removido do banco. Isso <strong>não tem desfazer</strong> — não
            é a lixeira, é a exclusão definitiva.
            {cascata && ` ${cascata}`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={apagar}
            loading={isPending}
            disabled={isPending}
          >
            {/* O spinner entra no LUGAR do ícone: mesma largura, rótulo
                parado, botão não pula. */}
            {!isPending && <Trash2 />}
            Apagar de vez
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EsvaziarDialog({
  open,
  total,
  onClose,
  onDone,
}: {
  open: boolean
  total: number
  onClose: () => void
  onDone: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [texto, setTexto] = useState('')
  const [relatorio, setRelatorio] = useState<RelatorioEsvaziar | null>(null)

  function fechar() {
    setTexto('')
    setRelatorio(null)
    onClose()
  }

  function esvaziar() {
    startTransition(async () => {
      const r = await esvaziarLixeiraAction()
      if (!r.success) {
        toast.error(r.error)
        return
      }
      setRelatorio(r.relatorio)
      onDone()
    })
  }

  const totalPulado =
    relatorio?.pulados.reduce((s, p) => s + p.quantidade, 0) ?? 0

  return (
    <Dialog open={open} onOpenChange={(o) => !o && fechar()}>
      <DialogContent className="sm:max-w-md">
        {relatorio ? (
          <>
            <DialogHeader>
              <DialogTitle>Lixeira esvaziada</DialogTitle>
              <DialogDescription>
                {relatorio.apagados === 1
                  ? '1 item apagado'
                  : `${relatorio.apagados} itens apagados`}{' '}
                de vez
                {totalPulado > 0
                  ? ` · ${totalPulado} pulado${totalPulado === 1 ? '' : 's'}`
                  : ' · nada foi pulado'}
                .
              </DialogDescription>
            </DialogHeader>
            {relatorio.pulados.length > 0 && (
              <ul className="max-h-64 space-y-1.5 overflow-y-auto text-sm">
                {relatorio.pulados.map((p) => (
                  <li
                    key={`${p.tipo}-${p.motivo}`}
                    className="flex items-start gap-2"
                  >
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                    <span>
                      <span className="font-medium">
                        {p.quantidade} {TIPO_LABEL[p.tipo].toLowerCase()}
                        {p.quantidade === 1 ? '' : 's'}
                      </span>{' '}
                      <span className="text-muted-foreground">{p.motivo}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <DialogFooter>
              <Button onClick={fechar}>Fechar</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-destructive">
                Esvaziar a lixeira?
              </DialogTitle>
              <DialogDescription>
                Vou apagar do banco tudo que puder, dos {total} itens da
                lixeira. O que estiver em uso por outro registro é pulado e
                continua aqui — no fim eu mostro o que ficou e por quê.{' '}
                <strong>Não tem desfazer.</strong>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <label htmlFor="confirmar-esvaziar" className="text-sm">
                Digite <strong>{PALAVRA_CONFIRMACAO}</strong> pra liberar:
              </label>
              <Input
                id="confirmar-esvaziar"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                autoComplete="off"
                placeholder={PALAVRA_CONFIRMACAO}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={fechar} disabled={isPending}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={esvaziar}
                loading={isPending}
                disabled={isPending || texto.trim() !== PALAVRA_CONFIRMACAO}
              >
                {!isPending && <Trash2 />}
                Esvaziar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
