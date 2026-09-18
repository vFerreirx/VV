'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { registrarRetiradaPorCorAction, type LoteFioItem } from './actions'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { kgSugeridoDoLote, planoDeRetirada } from '@/lib/fios/saldo'
import { cn } from '@/lib/utils'
import { MOTIVO_RETIRADA_PADRAO } from '@/lib/validators/fios'

// COMEÇA PELA COR, e não pelo lote.
//
// Quem vai pegar fio pensa "preciso de 4 caixas de Cáqui". De qual partida
// elas saem é consequência — e era exatamente o que o caminho antigo exigia
// primeiro: abrir o lote certo na lista de entradas e lançar a saída lá
// dentro. Com 51 partidas, isso é procurar antes de pensar.
//
// O plano FIFO aparece ANTES de gravar, porque o fio mais velho sair
// primeiro é regra da fábrica, não do sistema — e porque uma retirada que
// cruza duas partidas vira duas movimentações, o que é melhor ver do que
// descobrir depois no histórico.
//
// O kg de cada parte é EDITÁVEL: o peso real não é proporcional às caixas
// (caixa começada, kg por caixa diferente em cada lote). A tela sugere pelo
// kg médio daquele lote, a balança corrige.

type Parte = { loteId: string; caixas: number; pesoKg: string }

function hojeISO(): string {
  const d = new Date()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

function num(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

export function RetiradaDialog({
  aberto,
  lotes,
  corInicial,
  onClose,
}: {
  aberto: boolean
  lotes: LoteFioItem[]
  /** A cor que estiver filtrada na aba, pra não precisar escolher de novo. */
  corInicial: string | null
  onClose: () => void
}) {
  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        {/* Remontagem a cada abertura: o formulário nasce limpo sem
            sincronizar estado em efeito. */}
        {aberto && (
          <Corpo lotes={lotes} corInicial={corInicial} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function Corpo({
  lotes,
  corInicial,
  onClose,
}: {
  lotes: LoteFioItem[]
  corInicial: string | null
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Só cores COM saldo: oferecer uma cor zerada é convidar pro erro que a
  // action vai recusar no fim.
  const cores = useMemo(() => {
    const mapa = new Map<
      string,
      { id: string; nome: string; corNome: string; caixas: number }
    >()
    for (const l of lotes) {
      if (l.saldoCaixas <= 0) continue
      const atual = mapa.get(l.corFornecedorId)
      if (atual) atual.caixas += l.saldoCaixas
      else
        mapa.set(l.corFornecedorId, {
          id: l.corFornecedorId,
          nome: l.corFornecedorNome,
          corNome: l.corNome,
          caixas: l.saldoCaixas,
        })
    }
    return [...mapa.values()].sort((a, b) =>
      a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }),
    )
  }, [lotes])

  const [corId, setCorId] = useState(
    () => cores.find((c) => c.nome === corInicial)?.id ?? '',
  )
  const [caixas, setCaixas] = useState('')
  const [manual, setManual] = useState(false)
  // kg editado à mão, por lote. O que não estiver aqui usa a sugestão.
  const [pesos, setPesos] = useState<Record<string, string>>({})
  const [caixasPorLote, setCaixasPorLote] = useState<Record<string, string>>({})
  const [data, setData] = useState(hojeISO())
  const [motivo, setMotivo] = useState(MOTIVO_RETIRADA_PADRAO)
  const [observacao, setObservacao] = useState('')

  const cor = cores.find((c) => c.id === corId) ?? null
  const lotesDaCor = useMemo(
    () => lotes.filter((l) => l.corFornecedorId === corId && l.saldoCaixas > 0),
    [lotes, corId],
  )

  const pedido = Number(caixas)
  const plano = useMemo(
    () =>
      Number.isFinite(pedido) && pedido > 0
        ? planoDeRetirada(lotesDaCor, pedido)
        : { partes: [], faltou: 0 },
    [lotesDaCor, pedido],
  )

  // As partes que vão ser gravadas: do plano FIFO, ou do que ele montou à
  // mão. As duas passam pela MESMA conferência no servidor.
  const partes: Parte[] = manual
    ? lotesDaCor
        .map((l) => {
          const n = Number(caixasPorLote[l.id] ?? '')
          if (!Number.isInteger(n) || n <= 0) return null
          return {
            loteId: l.id,
            caixas: n,
            pesoKg: pesos[l.id] ?? String(kgSugeridoDoLote(l, n)),
          }
        })
        .filter((p): p is Parte => p !== null)
    : plano.partes.map((p) => ({
        loteId: p.loteId,
        caixas: p.caixas,
        pesoKg: pesos[p.loteId] ?? String(p.kgSugerido),
      }))

  const totalCaixas = partes.reduce((s, p) => s + p.caixas, 0)

  const erro = (() => {
    if (!cor) return null
    if (manual) {
      if (partes.length === 0) return null
      for (const p of partes) {
        const lote = lotesDaCor.find((l) => l.id === p.loteId)!
        if (p.caixas > lote.saldoCaixas) {
          const onde = lote.numeroLote
            ? `A partida ${lote.numeroLote}`
            : 'O lote sem partida'
          return `${onde} só tem ${lote.saldoCaixas} caixa(s).`
        }
      }
      return null
    }
    if (plano.faltou > 0) {
      return `${cor.nome} só tem ${cor.caixas} caixa(s) em estoque.`
    }
    return null
  })()

  const podeGravar =
    cor !== null &&
    partes.length > 0 &&
    erro === null &&
    motivo.trim() !== '' &&
    !isPending

  function nomeDoLote(loteId: string): string {
    const l = lotesDaCor.find((x) => x.id === loteId)
    if (!l) return '—'
    return l.numeroLote ?? 'sem partida'
  }

  function gravar() {
    if (!cor) return
    startTransition(async () => {
      const r = await registrarRetiradaPorCorAction({
        corFornecedorId: cor.id,
        partes,
        data,
        motivo: motivo.trim(),
        observacao: observacao.trim() || undefined,
      })
      if (!r.success) {
        toast.error(r.error)
        return
      }
      toast.success(r.message ?? 'Retirada registrada')
      router.refresh()
      onClose()
    })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Registrar retirada</DialogTitle>
        <DialogDescription>
          Escolha a cor e quantas caixas saíram. O fio mais velho sai primeiro;
          se a retirada cruzar duas partidas, ela vira dois lançamentos.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
          <div className="space-y-1.5">
            <Label htmlFor="rf-cor">
              Cor <span className="text-destructive">*</span>
            </Label>
            <Select
              value={corId}
              onValueChange={(v) => {
                if (!v) return
                setCorId(v)
                setPesos({})
                setCaixasPorLote({})
              }}
              disabled={isPending}
            >
              <SelectTrigger id="rf-cor" className="w-full">
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                {cores.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome} → {c.corNome} · {c.caixas} cx
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!manual && (
            <div className="space-y-1.5">
              <Label htmlFor="rf-caixas">
                Caixas <span className="text-destructive">*</span>
              </Label>
              <Input
                id="rf-caixas"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={caixas}
                disabled={isPending || cor === null}
                onChange={(e) => {
                  setCaixas(e.target.value)
                  setPesos({})
                }}
              />
            </div>
          )}
        </div>

        {cores.length === 0 && (
          <p className="text-muted-foreground text-sm">
            Nenhuma cor tem saldo. Cadastre uma entrada de lote antes.
          </p>
        )}

        {cor && !manual && partes.length > 0 && (
          <div className="space-y-2 rounded-lg border p-3">
            <div className="text-sm font-medium">
              Sai de {partes.length === 1 ? 'uma partida' : `${partes.length} partidas`}
            </div>
            {partes.map((p) => (
              <div
                key={p.loteId}
                className="flex flex-wrap items-center gap-2 text-sm"
              >
                <span className="min-w-28 tabular-nums">
                  {p.caixas} cx · {nomeDoLote(p.loteId)}
                </span>
                <div className="flex items-center gap-1">
                  <Input
                    className="h-8 w-28"
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    aria-label={`Peso retirado da partida ${nomeDoLote(p.loteId)}`}
                    value={p.pesoKg}
                    disabled={isPending}
                    onChange={(e) =>
                      setPesos((v) => ({ ...v, [p.loteId]: e.target.value }))
                    }
                  />
                  <span className="text-muted-foreground text-xs">kg</span>
                </div>
              </div>
            ))}
            <p className="text-muted-foreground text-xs">
              O kg é sugerido pela média daquele lote. Corrija pelo que a
              balança disser.
            </p>
          </div>
        )}

        {cor && manual && (
          <div className="space-y-2 rounded-lg border p-3">
            <div className="text-sm font-medium">Escolha as partidas</div>
            {lotesDaCor.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="min-w-36">
                  {l.numeroLote ?? 'sem partida'}
                  <span className="text-muted-foreground">
                    {' '}
                    · {l.saldoCaixas} cx · {num(l.saldoPesoKg)} kg
                  </span>
                </span>
                <Input
                  className="h-8 w-20"
                  type="number"
                  min={0}
                  max={l.saldoCaixas}
                  step={1}
                  inputMode="numeric"
                  aria-label={`Caixas da partida ${l.numeroLote ?? 'sem partida'}`}
                  value={caixasPorLote[l.id] ?? ''}
                  disabled={isPending}
                  onChange={(e) => {
                    const v = e.target.value
                    setCaixasPorLote((c) => ({ ...c, [l.id]: v }))
                    // Mexeu nas caixas: o kg volta a ser sugerido, senão
                    // ficaria o peso de uma quantidade que não é mais essa.
                    setPesos((p) => {
                      const resto = { ...p }
                      delete resto[l.id]
                      return resto
                    })
                  }}
                />
                <div className="flex items-center gap-1">
                  <Input
                    className="h-8 w-28"
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    aria-label={`Peso da partida ${l.numeroLote ?? 'sem partida'}`}
                    value={
                      pesos[l.id] ??
                      (Number(caixasPorLote[l.id] ?? '') > 0
                        ? String(
                            kgSugeridoDoLote(l, Number(caixasPorLote[l.id])),
                          )
                        : '')
                    }
                    disabled={isPending}
                    onChange={(e) =>
                      setPesos((v) => ({ ...v, [l.id]: e.target.value }))
                    }
                  />
                  <span className="text-muted-foreground text-xs">kg</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {cor && (
          // QUEM PEGA A CAIXA PODE PEGAR OUTRA PARTIDA: o tom varia entre
          // lotes, e às vezes a caixa da frente é outra. O FIFO é o padrão,
          // não uma trava — mas trocar é escolha consciente, atrás de um
          // clique.
          <button
            type="button"
            className="text-muted-foreground text-xs underline underline-offset-2"
            onClick={() => {
              setManual((v) => !v)
              setPesos({})
              setCaixasPorLote({})
            }}
          >
            {manual
              ? 'voltar pro mais velho primeiro'
              : 'escolher outra partida'}
          </button>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="rf-data">Data</Label>
            <Input
              id="rf-data"
              type="date"
              value={data}
              disabled={isPending}
              onChange={(e) => setData(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rf-motivo">
              Motivo <span className="text-destructive">*</span>
            </Label>
            <Input
              id="rf-motivo"
              value={motivo}
              disabled={isPending}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rf-obs">Observação</Label>
          <Textarea
            id="rf-obs"
            rows={2}
            value={observacao}
            disabled={isPending}
            onChange={(e) => setObservacao(e.target.value)}
          />
        </div>

        {erro && <p className="text-destructive text-sm">{erro}</p>}

        {partes.length > 0 && erro === null && (
          <p className={cn('text-muted-foreground text-xs')}>
            Vai gravar {partes.length} lançamento(s), {totalCaixas} caixa(s) no
            total. Lançamento de fio não se edita nem se apaga — se errar,
            registre a correção como nova retirada.
          </p>
        )}
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={isPending}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          loading={isPending}
          disabled={!podeGravar}
          onClick={gravar}
        >
          Registrar
        </Button>
      </DialogFooter>
    </>
  )
}
