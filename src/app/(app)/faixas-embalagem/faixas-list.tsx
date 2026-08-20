'use client'

import { Pencil, Plus, Ruler, Trash2, TriangleAlert } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  atualizarFaixaEmbalagemAction,
  criarFaixaEmbalagemAction,
  excluirFaixaEmbalagemAction,
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  avaliarMedidas,
  formatarMedidas,
  LADO_TAXA_EXTRA_CM,
  LIMITE_CUBADO_KG,
  LIMITE_LADO_CM,
  LIMITE_SOMA_CM,
  pesoCubadoKg,
} from '@/lib/frete'

export type FaixaNaTela = {
  id: string
  pesoAteGramas: number
  alturaCm: number
  larguraCm: number
  comprimentoCm: number
}

const kg = (g: number) => `${(g / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg`

export function FaixasList({ faixas, podeEditar }: { faixas: FaixaNaTela[]; podeEditar: boolean }) {
  const [criando, setCriando] = useState(false)
  const [editando, setEditando] = useState<FaixaNaTela | null>(null)
  const [excluindo, setExcluindo] = useState<FaixaNaTela | null>(null)

  const capacidade = faixas.reduce((m, f) => Math.max(m, f.pesoAteGramas), 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Faixas de embalagem</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            Cada faixa diz: até este peso, o pacote sai com estas medidas. A{' '}
            <strong>maior faixa é a capacidade de um pacote</strong> — pedido acima disso é cotado
            em mais de um volume.
          </p>
        </div>
        {podeEditar && (
          <Button onClick={() => setCriando(true)}>
            <Plus />
            Nova faixa
          </Button>
        )}
      </div>

      {faixas.length === 0 ? (
        <EmptyState
          icon={Ruler}
          title="Nenhuma faixa cadastrada"
          description="Sem faixa não dá pra cotar frete: o sistema não teria como saber o tamanho do pacote. Meça alguns pacotes reais e cadastre — o maior deles vira a capacidade."
        />
      ) : (
        <>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Peso até</TableHead>
                  <TableHead>Medidas (A × L × C)</TableHead>
                  <TableHead className="w-24 text-right">Soma</TableHead>
                  <TableHead className="w-28 text-right">Cubado</TableHead>
                  <TableHead>Observação</TableHead>
                  {podeEditar && <TableHead className="w-24" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {faixas.map((f) => {
                  const { avisos } = avaliarMedidas(f)
                  const soma = f.alturaCm + f.larguraCm + f.comprimentoCm
                  return (
                    <TableRow key={f.id}>
                      <TableCell className="font-medium tabular-nums">
                        {kg(f.pesoAteGramas)}
                        {f.pesoAteGramas === capacidade && (
                          <span className="text-muted-foreground ml-1 text-xs">(capacidade)</span>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums">{formatarMedidas(f)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {soma.toLocaleString('pt-BR', {
                          maximumFractionDigits: 2,
                        })}{' '}
                        cm
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {pesoCubadoKg(f).toLocaleString('pt-BR', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{' '}
                        kg
                      </TableCell>
                      <TableCell className="text-xs">
                        {avisos.length > 0 ? (
                          <span className="inline-flex items-start gap-1 text-amber-700 dark:text-amber-300">
                            <TriangleAlert className="mt-px size-3.5 shrink-0" />
                            {avisos.join(' ')}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      {podeEditar && (
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              onClick={() => setEditando(f)}
                              aria-label={`Editar faixa de ${kg(f.pesoAteGramas)}`}
                            >
                              <Pencil />
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              onClick={() => setExcluindo(f)}
                              aria-label={`Excluir faixa de ${kg(f.pesoAteGramas)}`}
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          <p className="text-muted-foreground text-xs">
            Limites dos Correios (PAC/SEDEX): soma das três medidas até {LIMITE_SOMA_CM} cm, nenhum
            lado acima de {LIMITE_LADO_CM} cm e peso cubado (C × L × A ÷ 6000) até{' '}
            {LIMITE_CUBADO_KG} kg. Acima de {LADO_TAXA_EXTRA_CM} cm em qualquer lado há taxa extra —
            encarece, mas não impede.
          </p>
        </>
      )}

      {criando && <FaixaDialog faixa={null} onClose={() => setCriando(false)} />}
      {editando && (
        <FaixaDialog key={editando.id} faixa={editando} onClose={() => setEditando(null)} />
      )}
      <ExcluirDialog faixa={excluindo} onClose={() => setExcluindo(null)} />
    </div>
  )
}

function FaixaDialog({ faixa, onClose }: { faixa: FaixaNaTela | null; onClose: () => void }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [pesoAte, setPesoAte] = useState(faixa ? String(faixa.pesoAteGramas) : '')
  const [altura, setAltura] = useState(faixa ? String(faixa.alturaCm) : '')
  const [largura, setLargura] = useState(faixa ? String(faixa.larguraCm) : '')
  const [comprimento, setComprimento] = useState(faixa ? String(faixa.comprimentoCm) : '')

  // Avaliação AO VIVO, com a mesma função que a action usa pra recusar. O
  // usuário vê o problema enquanto digita, e não depois de salvar.
  const avaliacao = useMemo(() => {
    const n = (v: string) => Number(v.replace(',', '.'))
    const m = {
      alturaCm: n(altura),
      larguraCm: n(largura),
      comprimentoCm: n(comprimento),
    }
    if (!Number.isFinite(m.alturaCm) || m.alturaCm <= 0) return null
    if (!Number.isFinite(m.larguraCm) || m.larguraCm <= 0) return null
    if (!Number.isFinite(m.comprimentoCm) || m.comprimentoCm <= 0) return null
    return { ...avaliarMedidas(m), cubado: pesoCubadoKg(m), medidas: m }
  }, [altura, largura, comprimento])

  const bloqueado = (avaliacao?.erros.length ?? 0) > 0

  function salvar() {
    startTransition(async () => {
      const payload = {
        pesoAteGramas: pesoAte,
        alturaCm: altura,
        larguraCm: largura,
        comprimentoCm: comprimento,
      }
      const r = faixa
        ? await atualizarFaixaEmbalagemAction(faixa.id, payload)
        : await criarFaixaEmbalagemAction(payload)
      if (!r.success) {
        toast.error(r.error)
        return
      }
      toast.success(r.message ?? 'Salvo')
      onClose()
      router.refresh()
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{faixa ? 'Editar faixa' : 'Nova faixa'}</DialogTitle>
          <DialogDescription>
            Meça um pacote real já fechado. Use o MAIOR pacote observado dentro da faixa — assim a
            cotação erra pra cima, e não pra baixo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="faixa-peso">Peso até (gramas)</Label>
            <Input
              id="faixa-peso"
              value={pesoAte}
              onChange={(e) => setPesoAte(e.target.value)}
              placeholder="27000"
              inputMode="numeric"
              disabled={isPending}
              autoComplete="off"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="faixa-altura">Altura (cm)</Label>
              <Input
                id="faixa-altura"
                value={altura}
                onChange={(e) => setAltura(e.target.value)}
                placeholder="34"
                inputMode="decimal"
                disabled={isPending}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="faixa-largura">Largura (cm)</Label>
              <Input
                id="faixa-largura"
                value={largura}
                onChange={(e) => setLargura(e.target.value)}
                placeholder="65"
                inputMode="decimal"
                disabled={isPending}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="faixa-comprimento">Comprimento (cm)</Label>
              <Input
                id="faixa-comprimento"
                value={comprimento}
                onChange={(e) => setComprimento(e.target.value)}
                placeholder="73"
                inputMode="decimal"
                disabled={isPending}
                autoComplete="off"
              />
            </div>
          </div>

          {avaliacao && (
            <div className="space-y-2 text-xs">
              <div className="text-muted-foreground tabular-nums">
                Soma{' '}
                {(
                  avaliacao.medidas.alturaCm +
                  avaliacao.medidas.larguraCm +
                  avaliacao.medidas.comprimentoCm
                ).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}{' '}
                cm · cubado{' '}
                {avaliacao.cubado.toLocaleString('pt-BR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{' '}
                kg
              </div>
              {avaliacao.erros.map((e, i) => (
                <p
                  key={i}
                  className="border-destructive/40 bg-destructive/5 text-destructive rounded-md border p-2"
                >
                  {e}
                </p>
              ))}
              {avaliacao.avisos.map((a, i) => (
                <p
                  key={i}
                  className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-amber-700 dark:text-amber-300"
                >
                  {a}
                </p>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button loading={isPending} onClick={salvar} disabled={isPending || bloqueado}>
            {'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ExcluirDialog({ faixa, onClose }: { faixa: FaixaNaTela | null; onClose: () => void }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function excluir() {
    if (!faixa) return
    startTransition(async () => {
      const r = await excluirFaixaEmbalagemAction(faixa.id)
      if (!r.success) {
        toast.error(r.error)
        return
      }
      toast.success(r.message ?? 'Faixa excluída')
      onClose()
      router.refresh()
    })
  }

  return (
    <Dialog open={faixa !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir faixa?</DialogTitle>
          <DialogDescription>
            A faixa de até{' '}
            <span className="text-foreground font-medium">{faixa && kg(faixa.pesoAteGramas)}</span>{' '}
            sai da tabela. Pedidos nessa faixa passam a usar a próxima faixa maior — e, se esta era
            a capacidade, a capacidade de um pacote diminui.
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
