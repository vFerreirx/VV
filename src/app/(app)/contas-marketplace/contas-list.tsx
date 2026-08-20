'use client'

import { Pencil, Plus, Store, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  atualizarContaAction,
  criarContaAction,
  excluirContaAction,
  type ContaComUso,
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
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { CANAL_LABEL_CURTO } from '@/lib/validators/ordens'
import { fullCanalValues } from '@/lib/validators/remessas'

type Canal = (typeof fullCanalValues)[number]

export type EmpresaOpcao = { id: string; nome: string }

type Props = {
  contas: ContaComUso[]
  empresas: EmpresaOpcao[]
  podeEditar: boolean
}

export function ContasList({ contas, empresas, podeEditar }: Props) {
  const [criando, setCriando] = useState(false)
  const [editando, setEditando] = useState<ContaComUso | null>(null)
  const [excluindo, setExcluindo] = useState<ContaComUso | null>(null)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Contas de marketplace</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            As contas do Mercado Livre e da Shopee por onde saem os envios Full. O PDF do envio não
            diz de qual conta veio — por isso ela é escolhida na hora de criar a remessa.
          </p>
        </div>
        {podeEditar && (
          <Button onClick={() => setCriando(true)}>
            <Plus />
            Nova conta
          </Button>
        )}
      </div>

      {contas.length === 0 ? (
        <EmptyState
          icon={Store}
          title="Nenhuma conta cadastrada"
          description="Cadastre as contas do ML e da Shopee pra poder dizer por qual delas cada envio Full saiu."
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Conta</TableHead>
                <TableHead className="w-32">Canal</TableHead>
                <TableHead className="w-48">Empresa</TableHead>
                <TableHead className="w-28 text-right">Remessas</TableHead>
                <TableHead className="w-24">Status</TableHead>
                {podeEditar && <TableHead className="w-24" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {contas.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{CANAL_LABEL_CURTO[c.canal]}</Badge>
                  </TableCell>
                  <TableCell className="truncate">
                    {c.empresaNome ?? <span className="text-muted-foreground">sem empresa</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{c.remessas}</TableCell>
                  <TableCell>
                    {c.ativo ? (
                      <span className="text-sm text-emerald-600">Ativa</span>
                    ) : (
                      <span className="text-muted-foreground text-sm">Desligada</span>
                    )}
                  </TableCell>
                  {podeEditar && (
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => setEditando(c)}
                          aria-label={`Editar ${c.nome}`}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => setExcluindo(c)}
                          aria-label={`Excluir ${c.nome}`}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Renderizados só quando abertos: o formulário lê o estado inicial
          das props, então precisa nascer de novo a cada abertura. */}
      {criando && (
        <ContaDialog conta={null} empresas={empresas} onClose={() => setCriando(false)} />
      )}
      {editando && (
        <ContaDialog
          key={editando.id}
          conta={editando}
          empresas={empresas}
          onClose={() => setEditando(null)}
        />
      )}
      <ExcluirDialog conta={excluindo} onClose={() => setExcluindo(null)} />
    </div>
  )
}

function ContaDialog({
  conta,
  empresas,
  onClose,
}: {
  conta: ContaComUso | null
  empresas: EmpresaOpcao[]
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [canal, setCanal] = useState<Canal>((conta?.canal as Canal) ?? 'full_ml')
  const [nome, setNome] = useState(conta?.nome ?? '')
  // null (e não undefined) mantém o Select controlado desde o primeiro
  // render — com undefined o Base UI reclama de trocar de não-controlado
  // pra controlado ao escolher a primeira opção.
  const [empresaId, setEmpresaId] = useState<string | null>(conta?.empresaId ?? null)
  const [ativo, setAtivo] = useState(conta?.ativo ?? true)

  const semEmpresas = empresas.length === 0

  function salvar() {
    if (nome.trim().length < 2) {
      toast.error('Informe o nome da conta')
      return
    }
    if (!empresaId) {
      toast.error('Escolha a empresa dona da conta')
      return
    }
    startTransition(async () => {
      const payload = { canal, nome, empresaId, ativo }
      const r = conta
        ? await atualizarContaAction(conta.id, payload)
        : await criarContaAction(payload)
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
          <DialogTitle>{conta ? 'Editar conta' : 'Nova conta'}</DialogTitle>
          <DialogDescription>
            O nome é livre — use o que você chama no dia a dia, tipo &ldquo;ML Principal&rdquo; ou
            &ldquo;Shopee Outlet&rdquo;.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Canal</Label>
            <Select
              value={canal}
              onValueChange={(v) => setCanal((v ?? 'full_ml') as Canal)}
              disabled={isPending}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fullCanalValues.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CANAL_LABEL_CURTO[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="conta-nome">Nome</Label>
            <Input
              id="conta-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="ML Principal"
              disabled={isPending}
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Empresa</Label>
            {semEmpresas ? (
              <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-sm">
                Nenhuma empresa cadastrada. Cadastre em{' '}
                <Link href="/empresas" className="underline">
                  Empresas
                </Link>{' '}
                pra poder dizer de qual CNPJ é a conta.
              </p>
            ) : (
              <Select
                value={empresaId}
                onValueChange={(v) => setEmpresaId(v as string | null)}
                disabled={isPending}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Escolha a empresa" />
                </SelectTrigger>
                <SelectContent>
                  {empresas.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="text-sm font-medium">Conta ativa</div>
              <div className="text-muted-foreground text-xs">
                Desligar para de oferecê-la ao criar remessa, sem mexer no que já saiu por ela.
              </div>
            </div>
            <Switch checked={ativo} onCheckedChange={setAtivo} disabled={isPending} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button loading={isPending} onClick={salvar} disabled={isPending || semEmpresas}>
            {'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ExcluirDialog({ conta, onClose }: { conta: ContaComUso | null; onClose: () => void }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function excluir() {
    if (!conta) return
    startTransition(async () => {
      const r = await excluirContaAction(conta.id)
      if (!r.success) {
        toast.error(r.error)
        return
      }
      toast.success(r.message ?? 'Conta excluída')
      onClose()
      router.refresh()
    })
  }

  return (
    <Dialog open={conta !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir conta?</DialogTitle>
          <DialogDescription>
            A conta <span className="text-foreground font-medium">{conta?.nome}</span> vai pra
            lixeira e deixa de ser oferecida ao criar remessa.
            {conta && conta.remessas > 0
              ? ` As ${conta.remessas} remessa${conta.remessas > 1 ? 's' : ''} que já saíram por ela continuam mostrando o nome normalmente.`
              : ''}
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
