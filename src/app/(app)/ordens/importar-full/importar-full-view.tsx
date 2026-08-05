'use client'

import { AlertTriangle, ArrowLeft, CheckCircle2, FileUp, Pencil, RotateCcw } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'

import type { ComponenteResolvido, Conferencia, ItemConferencia } from '../full-import-actions'
import { analisarPdfFullAction, importarFullAction } from '../full-import-actions'
import type { RemessaFullOpcao } from '../remessas-actions'
import type { KitComItens } from '../../kits/actions'
import { DeParaDialog } from './de-para-dialog'
import { Badge } from '@/components/ui/badge'
import type { ContaMarketplace } from '@/lib/db/schema'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { CANAL_LABEL_CURTO, PRIORIDADE_LABEL, prioridadeValues } from '@/lib/validators/ordens'

export type ProdutoParaSelecao = {
  id: string
  nome: string
  variacoes: {
    id: string
    skuVariacao: string
    cor: string | null
    modelo: string | null
    tamanho: string | null
  }[]
}

const NOVA = '__nova__'

function semAcento(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
}

// "Capa de Almofada - SIENA — Areia e Caqui · 45x45". O modelo só entra se o
// nome do produto já não o trouxer (quase todos trazem: "Manta - SIENA"),
// senão vira "Capa de Almofada - SIENA — SIENA · Areia e Caqui".
function nomePeca(c: ComponenteResolvido): string {
  const repeteModelo = c.modelo !== null && semAcento(c.produtoNome).includes(semAcento(c.modelo))
  const detalhe = [repeteModelo ? null : c.modelo, c.cor, c.tamanho].filter(Boolean).join(' · ')
  return detalhe ? `${c.produtoNome} — ${detalhe}` : c.produtoNome
}

function labelRemessa(r: RemessaFullOpcao): string {
  const [, m, d] = r.dataEnvio.split('-')
  return `${CANAL_LABEL_CURTO[r.canal]} · ${d}/${m} (${r.ops} OPs)`
}

export function ImportarFullView({
  remessas,
  kits,
  produtos,
  contas,
}: {
  remessas: RemessaFullOpcao[]
  kits: KitComItens[]
  produtos: ProdutoParaSelecao[]
  contas: ContaMarketplace[]
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [conf, setConf] = useState<Conferencia | null>(null)
  const [lendo, startLeitura] = useTransition()
  const [criando, startCriacao] = useTransition()
  const [editando, setEditando] = useState<ItemConferencia | null>(null)

  const [remessaSel, setRemessaSel] = useState(NOVA)
  const [dataEnvio, setDataEnvio] = useState('')
  const [contaId, setContaId] = useState<string | null>(null)
  // O canal vem do PDF, então dá pra filtrar as contas sem perguntar nada.
  const contasDoCanal = conf ? contas.filter((c) => c.canal === conf.canal) : []
  const [prioridade, setPrioridade] = useState<(typeof prioridadeValues)[number]>('normal')

  function escolherArquivo(file: File) {
    const form = new FormData()
    form.set('arquivo', file)
    startLeitura(async () => {
      const r = await analisarPdfFullAction(form)
      if (!r.success) {
        toast.error(r.error, { duration: 12000 })
        return
      }
      setConf(r.data!)
      setRemessaSel(NOVA)
      setContaId(null)
    })
  }

  // Aplica o mapeamento recém-salvo na linha, sem reler o PDF.
  function aoSalvarDePara(
    codigo: string,
    componentes: ComponenteResolvido[],
    kitId: string | null,
  ) {
    setConf((prev) =>
      prev === null
        ? prev
        : {
            ...prev,
            itens: prev.itens.map((i) =>
              i.codigo === codigo
                ? {
                    ...i,
                    componentes,
                    origem: 'de_para',
                    alterado: false,
                    skuAnterior: i.sku,
                    descricaoAnterior: i.descricao,
                    kitIdSugerido: kitId,
                  }
                : i,
            ),
          },
    )
    setEditando(null)
  }

  const pendentes = conf?.itens.filter((i) => i.componentes.length === 0) ?? []
  const alterados = conf?.itens.filter((i) => i.alterado) ?? []

  // O que será produzido: explode cada item nos componentes e SOMA por
  // variação. A mesma peça vinda de dois códigos diferentes vira uma OP só
  // — é a mesma peça física ("manta Caramelo" de dois kits diferentes).
  const producao = useMemo(() => {
    const mapa = new Map<string, ComponenteResolvido & { total: number }>()
    for (const item of conf?.itens ?? []) {
      for (const c of item.componentes) {
        const atual = mapa.get(c.variacaoId)
        const total = c.quantidade * item.quantidade
        if (atual) atual.total += total
        else mapa.set(c.variacaoId, { ...c, total })
      }
    }
    return [...mapa.values()].sort((a, b) => nomePeca(a).localeCompare(nomePeca(b), 'pt-BR'))
  }, [conf])

  const totalPecas = producao.reduce((s, p) => s + p.total, 0)
  const podeConfirmar =
    conf !== null &&
    pendentes.length === 0 &&
    alterados.length === 0 &&
    producao.length > 0 &&
    conf.jaImportado === null &&
    // Full novo exige data E conta; Full existente já traz as duas.
    (remessaSel !== NOVA || (dataEnvio !== '' && contaId !== null))

  function confirmar() {
    if (!conf) return
    startCriacao(async () => {
      const r = await importarFullAction({
        remessaId: remessaSel === NOVA ? null : remessaSel,
        dataEnvio: remessaSel === NOVA ? dataEnvio : null,
        contaId: remessaSel === NOVA ? contaId : null,
        canal: conf.canal,
        envioId: conf.envioId,
        prioridade,
        itens: producao.map((p) => ({
          variacaoId: p.variacaoId,
          quantidade: p.total,
        })),
        totalPecas,
      })
      if (!r.success) {
        toast.error(r.error, { duration: 10000 })
        return
      }
      toast.success(r.message ?? 'Importado')
      router.push('/ordens')
      router.refresh()
    })
  }

  // -------------------------------------------------------------- upload
  if (conf === null) {
    return (
      <div className="space-y-6">
        <Cabecalho />

        <div className="max-w-2xl space-y-4 rounded-lg border p-6">
          <div>
            <h2 className="font-medium">Qual arquivo pegar</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              A pasta do envio tem vários PDFs parecidos. Use este:
            </p>
          </div>

          <ul className="space-y-2 text-sm">
            <li className="rounded-md border p-3">
              <div className="font-medium">Mercado Livre</div>
              <div className="text-muted-foreground">
                A <strong>lista de preparação</strong> —{' '}
                <span className="font-mono text-xs">
                  Inbound-&lt;número&gt;-preparation-instructions.pdf
                </span>
              </div>
            </li>
            <li className="rounded-md border p-3">
              <div className="font-medium">Shopee</div>
              <div className="text-muted-foreground">
                O <strong>Picking List</strong> —{' '}
                <span className="font-mono text-xs">FBSINBR&lt;número&gt;.pdf</span>
              </div>
            </li>
          </ul>

          <p className="text-muted-foreground text-xs">
            O DANFE (nota fiscal) e o ASN da Shopee não servem: o DANFE não diz a cor de cada
            produto e o ASN não é a lista de separação. Se subir um deles por engano, eu aviso qual
            pegar.
          </p>

          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) escolherArquivo(f)
              e.target.value = ''
            }}
          />
          <Button onClick={() => inputRef.current?.click()} disabled={lendo}>
            <FileUp />
            {lendo ? 'Lendo o PDF…' : 'Escolher o PDF do envio'}
          </Button>
          <p className="text-muted-foreground text-xs">
            O arquivo não é guardado: ele é lido e descartado na hora.
          </p>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------- conferência
  return (
    <div className="space-y-6">
      <Cabecalho />

      {/* Documento reconhecido */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border p-4">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-emerald-600" />
          <span className="font-medium">{conf.documento}</span>
        </div>
        <div className="text-sm">
          <span className="text-muted-foreground">Canal: </span>
          {CANAL_LABEL_CURTO[conf.canal]}
        </div>
        {conf.envioId && (
          <div className="text-sm">
            <span className="text-muted-foreground">Envio: </span>
            <span className="font-mono">{conf.envioId}</span>
          </div>
        )}
        <div className="text-sm tabular-nums">
          <span className="text-muted-foreground">Total do documento: </span>
          <span className="font-medium">{conf.totalDeclarado}</span>
          <span className="text-muted-foreground"> · lido: </span>
          <span className="font-medium">{conf.totalLido}</span>
          <CheckCircle2 className="ml-1 inline size-3.5 text-emerald-600" />
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setConf(null)}
          disabled={criando}
          className="ml-auto"
        >
          <RotateCcw />
          Outro arquivo
        </Button>
      </div>

      {conf.jaImportado && (
        <Aviso tom="erro">
          O envio <span className="font-mono">{conf.envioId}</span> já foi importado (remessa de{' '}
          {conf.jaImportado.dataEnvio}).{' '}
          {conf.jaImportado.opsAtivas === 0 ? (
            <>
              Essa remessa está <strong>sem nenhuma OP ativa</strong> — ela só está segurando o
              identificador do envio. Exclua a remessa em{' '}
              <Link href="/remessas" className="underline underline-offset-2">
                Remessas Full
              </Link>{' '}
              e importe de novo.
            </>
          ) : (
            <>
              A remessa tem {conf.jaImportado.opsAtivas} OP
              {conf.jaImportado.opsAtivas > 1 ? 's' : ''} ativa
              {conf.jaImportado.opsAtivas > 1 ? 's' : ''}. Se precisar refazer, exclua a remessa
              antiga primeiro.
            </>
          )}
        </Aviso>
      )}

      {conf.avisos.map((a, i) => (
        <Aviso key={i} tom="atencao">
          {a}
        </Aviso>
      ))}

      {/* Itens do envio */}
      <div>
        <h2 className="mb-2 font-medium">
          Itens do envio{' '}
          <span className="text-muted-foreground font-normal">({conf.itens.length})</span>
        </h2>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>SKU do envio</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead>O que será produzido</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {conf.itens.map((it) => (
                <TableRow
                  key={it.codigo}
                  className={
                    it.componentes.length === 0 || it.alterado ? 'bg-amber-500/5' : undefined
                  }
                >
                  <TableCell className="font-mono text-xs">{it.codigo}</TableCell>
                  <TableCell className="max-w-64 truncate font-mono text-xs">
                    {it.sku || '—'}
                    {it.variacao && (
                      <span className="text-muted-foreground block font-sans">{it.variacao}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {it.quantidade}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {it.componentes.length === 0 ? (
                      <Badge variant="destructive">Falta mapear</Badge>
                    ) : (
                      <div className="space-y-0.5">
                        {it.alterado && (
                          <Badge variant="destructive" className="mb-1">
                            <AlertTriangle />O item mudou — confira
                          </Badge>
                        )}
                        {it.origem === 'automatico' && (
                          <Badge variant="secondary" className="mb-1">
                            reconhecido automaticamente
                          </Badge>
                        )}
                        {it.componentes.map((c) => (
                          <div key={c.variacaoId} className="text-sm">
                            <span className="tabular-nums">{c.quantidade * it.quantidade}</span>
                            <span className="text-muted-foreground"> ({c.quantidade}/un) · </span>
                            {nomePeca(c)}
                          </div>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant={it.componentes.length === 0 ? 'default' : 'ghost'}
                      onClick={() => setEditando(it)}
                      disabled={criando}
                    >
                      <Pencil />
                      {it.componentes.length === 0 ? 'Mapear' : 'Editar'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {pendentes.length > 0 && (
        <Aviso tom="atencao">
          {pendentes.length} item(ns) sem mapeamento. Diga o que produzir em cada um antes de criar
          as OPs.
        </Aviso>
      )}
      {alterados.length > 0 && (
        <Aviso tom="atencao">
          {alterados.length} item(ns) mudaram desde o último mapeamento. Confira os componentes e
          confirme.
        </Aviso>
      )}

      {/* Produção resultante */}
      {producao.length > 0 && (
        <div>
          <h2 className="mb-2 font-medium">
            O que vai pra produção{' '}
            <span className="text-muted-foreground font-normal">
              ({producao.length} OP{producao.length === 1 ? '' : 's'})
            </span>
          </h2>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Peça</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {producao.map((p) => (
                  <TableRow key={p.variacaoId}>
                    <TableCell className="whitespace-normal">{nomePeca(p)}</TableCell>
                    <TableCell className="font-mono text-xs">{p.skuVariacao}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{p.total}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Destino + confirmação */}
      <div className="space-y-4 rounded-lg border p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Full</Label>
            <Select
              value={remessaSel}
              onValueChange={(v) => setRemessaSel(v ?? NOVA)}
              disabled={criando}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NOVA}>Novo Full…</SelectItem>
                {remessas
                  .filter((r) => r.canal === conf.canal)
                  .map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {labelRemessa(r)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          {remessaSel === NOVA && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="data-envio">Data de envio</Label>
                <Input
                  id="data-envio"
                  type="date"
                  value={dataEnvio}
                  onChange={(e) => setDataEnvio(e.target.value)}
                  disabled={criando}
                />
              </div>
              {/* O canal vem do PDF, então o seletor já nasce filtrado.
                  Usando um Full existente, a conta é a dele e nem
                  perguntamos. */}
              <div className="space-y-1.5">
                <Label>Conta</Label>
                <Select
                  value={contaId}
                  onValueChange={(v) => setContaId(v ?? null)}
                  disabled={criando || contasDoCanal.length === 0}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Escolha a conta" />
                  </SelectTrigger>
                  <SelectContent>
                    {contasDoCanal.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          <div className="space-y-1.5">
            <Label>Prioridade</Label>
            <Select
              value={prioridade}
              onValueChange={(v) =>
                setPrioridade((v ?? 'normal') as (typeof prioridadeValues)[number])
              }
              disabled={criando}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {prioridadeValues.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PRIORIDADE_LABEL[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <div className="text-sm">
            <span className="text-muted-foreground">Total a produzir: </span>
            <span className="text-lg font-semibold tabular-nums">
              {totalPecas.toLocaleString('pt-BR')}
            </span>
            <span className="text-muted-foreground"> peças em </span>
            <span className="font-semibold tabular-nums">{producao.length}</span>
            <span className="text-muted-foreground"> OPs</span>
          </div>
          <Button onClick={confirmar} disabled={!podeConfirmar || criando}>
            {criando ? 'Criando OPs…' : 'Confirmar e criar as OPs'}
          </Button>
        </div>
      </div>

      <DeParaDialog
        item={editando}
        canal={conf.canal}
        kits={kits}
        produtos={produtos}
        onSalvo={aoSalvarDePara}
        onFechar={() => setEditando(null)}
      />
    </div>
  )
}

function Cabecalho() {
  return (
    <div className="flex items-center gap-3">
      <Button size="icon-sm" variant="ghost" render={<Link href="/ordens" />}>
        <ArrowLeft />
      </Button>
      <div>
        <h1 className="text-2xl font-semibold">Importar envio Full</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Suba o PDF que você já baixa do marketplace — nada vira OP sem você conferir.
        </p>
      </div>
    </div>
  )
}

function Aviso({ tom, children }: { tom: 'atencao' | 'erro'; children: React.ReactNode }) {
  const cor =
    tom === 'erro'
      ? 'border-destructive/40 bg-destructive/5 text-destructive'
      : 'border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400'
  return (
    <div className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${cor}`}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  )
}
