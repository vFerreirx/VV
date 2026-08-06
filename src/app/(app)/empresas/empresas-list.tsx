'use client'

import { Building2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  atualizarEmpresaAction,
  criarEmpresaAction,
  excluirEmpresaAction,
  type EmpresaComUso,
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
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatarDocumento, mascararDocumento } from '@/lib/validators/documento'

type Props = {
  empresas: EmpresaComUso[]
  podeEditar: boolean
}

export function EmpresasList({ empresas, podeEditar }: Props) {
  const [criando, setCriando] = useState(false)
  const [editando, setEditando] = useState<EmpresaComUso | null>(null)
  const [excluindo, setExcluindo] = useState<EmpresaComUso | null>(null)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Empresas</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Os CNPJs do grupo. A empresa marcada como principal é a que sai
            no cabeçalho do pedido, da via de separação e do romaneio.
          </p>
        </div>
        {podeEditar && (
          <Button onClick={() => setCriando(true)}>
            <Plus />
            Nova empresa
          </Button>
        )}
      </div>

      {empresas.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Nenhuma empresa cadastrada"
          description="Enquanto não houver empresa principal, os documentos saem com o cabeçalho neutro, sem CNPJ."
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead className="w-44">CNPJ</TableHead>
                <TableHead className="w-24 text-right">Contas</TableHead>
                <TableHead className="w-28">Documentos</TableHead>
                {podeEditar && <TableHead className="w-24" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {empresas.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>
                    <div className="font-medium">
                      {e.nomeFantasia ?? e.razaoSocial}
                    </div>
                    {e.nomeFantasia && (
                      <div className="text-muted-foreground text-xs">
                        {e.razaoSocial}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {e.cnpj ? (
                      formatarDocumento(e.cnpj)
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {e.contas}
                  </TableCell>
                  <TableCell>
                    {e.principal ? (
                      <Badge className="bg-emerald-500/15 text-emerald-600">
                        Principal
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  {podeEditar && (
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => setEditando(e)}
                          aria-label={`Editar ${e.razaoSocial}`}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => setExcluindo(e)}
                          aria-label={`Excluir ${e.razaoSocial}`}
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
        <EmpresaDialog
          empresa={null}
          primeira={empresas.length === 0}
          onClose={() => setCriando(false)}
        />
      )}
      {editando && (
        <EmpresaDialog
          key={editando.id}
          empresa={editando}
          primeira={false}
          onClose={() => setEditando(null)}
        />
      )}
      <ExcluirDialog empresa={excluindo} onClose={() => setExcluindo(null)} />
    </div>
  )
}

function EmpresaDialog({
  empresa,
  primeira,
  onClose,
}: {
  empresa: EmpresaComUso | null
  // Primeira empresa do sistema: ela vira principal de qualquer jeito (a
  // action garante), então a chave aparece ligada e travada.
  primeira: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [razaoSocial, setRazaoSocial] = useState(empresa?.razaoSocial ?? '')
  const [nomeFantasia, setNomeFantasia] = useState(empresa?.nomeFantasia ?? '')
  const [cnpj, setCnpj] = useState(
    empresa?.cnpj ? mascararDocumento(empresa.cnpj) : '',
  )
  const [principal, setPrincipal] = useState(empresa?.principal ?? primeira)

  // Já é a principal: desmarcar não faria nada (a action mantém), então a
  // chave fica travada — trocar de principal é marcar OUTRA empresa.
  const principalTravada = primeira || (empresa?.principal ?? false)

  function salvar() {
    if (razaoSocial.trim().length < 2) {
      toast.error('Informe a razão social')
      return
    }
    startTransition(async () => {
      const payload = {
        razaoSocial,
        nomeFantasia: nomeFantasia || null,
        cnpj: cnpj || null,
        principal,
      }
      const r = empresa
        ? await atualizarEmpresaAction(empresa.id, payload)
        : await criarEmpresaAction(payload)
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
          <DialogTitle>
            {empresa ? 'Editar empresa' : 'Nova empresa'}
          </DialogTitle>
          <DialogDescription>
            A razão social e o CNPJ identificam quem emite o documento; o nome
            fantasia é o que aparece grande no cabeçalho.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="empresa-razao">Razão social</Label>
            <Input
              id="empresa-razao"
              value={razaoSocial}
              onChange={(e) => setRazaoSocial(e.target.value)}
              placeholder="Vanvest Comércio de Enxovais LTDA"
              disabled={isPending}
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="empresa-fantasia">Nome fantasia</Label>
            <Input
              id="empresa-fantasia"
              value={nomeFantasia}
              onChange={(e) => setNomeFantasia(e.target.value)}
              placeholder="Vanvest Home Decor"
              disabled={isPending}
              autoComplete="off"
            />
            <p className="text-muted-foreground text-xs">
              Opcional. Sem ele, a razão social vai pro lugar de destaque.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="empresa-cnpj">CNPJ</Label>
            <Input
              id="empresa-cnpj"
              value={cnpj}
              onChange={(e) => setCnpj(mascararDocumento(e.target.value))}
              placeholder="00.000.000/0000-00"
              disabled={isPending}
              autoComplete="off"
              inputMode="text"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="text-sm font-medium">Empresa principal</div>
              <div className="text-muted-foreground text-xs">
                {principalTravada
                  ? 'Já é a principal. Pra trocar, marque outra empresa.'
                  : 'Os documentos passam a sair com os dados dela — a principal de hoje é desmarcada.'}
              </div>
            </div>
            <Switch
              checked={principal}
              onCheckedChange={setPrincipal}
              disabled={isPending || principalTravada}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button loading={isPending} onClick={salvar} disabled={isPending}>
            {'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ExcluirDialog({
  empresa,
  onClose,
}: {
  empresa: EmpresaComUso | null
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function excluir() {
    if (!empresa) return
    startTransition(async () => {
      const r = await excluirEmpresaAction(empresa.id)
      if (!r.success) {
        toast.error(r.error)
        return
      }
      toast.success(r.message ?? 'Empresa excluída')
      onClose()
      router.refresh()
    })
  }

  return (
    <Dialog open={empresa !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir empresa?</DialogTitle>
          <DialogDescription>
            A empresa{' '}
            <span className="text-foreground font-medium">
              {empresa && (empresa.nomeFantasia ?? empresa.razaoSocial)}
            </span>{' '}
            vai pra lixeira.
            {empresa && empresa.contas > 0
              ? ` As ${empresa.contas} conta${empresa.contas > 1 ? 's' : ''} de marketplace ligada${empresa.contas > 1 ? 's' : ''} a ela continuam mostrando o nome normalmente.`
              : ''}
            {empresa?.principal
              ? ' É a empresa principal: os documentos voltam ao cabeçalho neutro, sem CNPJ, até você marcar outra.'
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
