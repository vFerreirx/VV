'use client'

import { Upload } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { analisarFiosCSVAction, importarFiosCSVAction } from './actions'
import type { AnaliseImportFios } from './actions'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { calcularTotais } from '@/lib/fios/importar-csv'

// Quantos avisos cabem antes de virar parede de texto. O excedente NÃO some
// calado — some com o número dele à vista.
const MAX_AVISOS = 6

function kg(n: number): string {
  return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg`
}

function hojeISO(): string {
  const d = new Date()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

function BlocoAvisos({
  titulo,
  itens,
  tom,
}: {
  titulo: string
  itens: string[]
  tom: 'ignorada' | 'atencao'
}) {
  if (itens.length === 0) return null
  const excedente = itens.length - MAX_AVISOS
  return (
    <div
      className={
        tom === 'ignorada'
          ? 'border-destructive/40 bg-destructive/5 text-destructive rounded-lg border p-3 text-xs'
          : 'rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400'
      }
    >
      <div className="mb-1 font-medium">
        {itens.length} {titulo}
      </div>
      <ul className="list-disc space-y-0.5 pl-4">
        {itens.slice(0, MAX_AVISOS).map((a, i) => (
          <li key={i}>{a}</li>
        ))}
      </ul>
      {excedente > 0 && (
        <div className="mt-1 opacity-80">
          … e mais {excedente} não exibido{excedente > 1 ? 's' : ''}.
        </div>
      )}
    </div>
  )
}

export function ImportarFiosCSVDialog() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [texto, setTexto] = useState('')
  const [res, setRes] = useState<AnaliseImportFios | null>(null)
  const [dataReferencia, setDataReferencia] = useState(hojeISO())
  const [incluirDuplicadas, setIncluirDuplicadas] = useState(false)
  const [analisando, startAnalise] = useTransition()
  const [importando, startImport] = useTransition()

  function reset() {
    setTexto('')
    setRes(null)
    setIncluirDuplicadas(false)
  }

  async function aoEscolherArquivo(file: File) {
    const conteudo = await file.text()
    setTexto(conteudo)
    startAnalise(async () => {
      setRes(await analisarFiosCSVAction(conteudo))
    })
  }

  // Os totais seguem a chave: ligar "importar mesmo assim" muda o que vai
  // entrar, e o número na tela tem que ser o número que vai entrar.
  const totais = useMemo(() => {
    if (!res) return null
    if (incluirDuplicadas) return res.totais
    return calcularTotais(res.linhas.filter((l) => !l.jaExiste))
  }, [res, incluirDuplicadas])

  function importar() {
    startImport(async () => {
      const r = await importarFiosCSVAction({
        texto,
        dataReferencia,
        incluirDuplicadas,
      })
      if (!r.success) {
        toast.error(r.error)
        return
      }
      toast.success(r.message ?? 'Importado')
      router.refresh()
      setOpen(false)
      reset()
    })
  }

  const temLinhas = totais !== null && totais.lotes > 0

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Upload />
        Importar planilha
      </Button>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void aoEscolherArquivo(f)
          e.target.value = ''
        }}
      />

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) {
            setOpen(false)
            reset()
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Importar planilha de fios (CSV)</DialogTitle>
            <DialogDescription>
              Cada linha vira um lote. Onde houver retirada, entra também a
              saída correspondente. Confira os totais contra o rodapé da
              planilha antes de importar.
            </DialogDescription>
          </DialogHeader>

          {res === null ? (
            <div className="space-y-2 py-2">
              <Button
                onClick={() => inputRef.current?.click()}
                disabled={analisando}
              >
                {analisando ? 'Lendo arquivo…' : 'Selecionar arquivo CSV'}
              </Button>
              <p className="text-muted-foreground text-xs">
                Colunas: COR, PARTIDA (LOTE), CAIXAS, RETIRADA, TOTAL CAIXA,
                QUANTIDADE (KG).
              </p>
            </div>
          ) : (
            <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
              {/* Antes de tudo, de propósito: no fim da rolagem o aviso não
                  é lido por ninguém. */}
              <BlocoAvisos
                tom="ignorada"
                titulo={
                  res.ignoradas.length === 1
                    ? 'linha ignorada — o dado não entrou:'
                    : 'linhas ignoradas — o dado não entrou:'
                }
                itens={res.ignoradas}
              />
              <BlocoAvisos
                tom="atencao"
                titulo={
                  res.atencoes.length === 1
                    ? 'aviso de atenção — a linha entra:'
                    : 'avisos de atenção — as linhas entram:'
                }
                itens={res.atencoes}
              />

              {/* Duplicata tem bloco próprio porque tem decisão associada. */}
              {res.duplicadas.length > 0 && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
                  <div className="mb-1 font-medium">
                    {res.duplicadas.length} lote(s) já cadastrado(s):
                  </div>
                  <ul className="list-disc space-y-0.5 pl-4">
                    {res.duplicadas.slice(0, MAX_AVISOS).map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                  {res.duplicadas.length > MAX_AVISOS && (
                    <div className="mt-1 opacity-80">
                      … e mais {res.duplicadas.length - MAX_AVISOS} não
                      exibido(s).
                    </div>
                  )}
                  <label className="mt-2 flex items-start gap-2 font-medium">
                    <Checkbox
                      checked={incluirDuplicadas}
                      onCheckedChange={(v) => setIncluirDuplicadas(v === true)}
                    />
                    <span>
                      Importar mesmo assim — são remessas novas da mesma
                      partida.
                      <span className="block font-normal opacity-80">
                        Desmarcado, essas linhas são puladas: importar a mesma
                        planilha duas vezes não dobra o estoque.
                      </span>
                    </span>
                  </label>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="fios-data-ref">Data de entrada</Label>
                <Input
                  id="fios-data-ref"
                  type="date"
                  value={dataReferencia}
                  onChange={(e) => setDataReferencia(e.target.value)}
                  disabled={importando}
                />
                <p className="text-muted-foreground text-xs">
                  A planilha não tem data. Esta é aplicada a todas as linhas —
                  informe o mês dela.
                </p>
              </div>

              {totais && (
                <div className="rounded-lg border p-3 text-sm">
                  <div className="mb-1.5 font-medium">
                    {totais.lotes} lote(s) a importar
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 tabular-nums">
                    <dt className="text-muted-foreground">Caixas de entrada</dt>
                    <dd className="text-right">
                      {totais.caixasEntrada.toLocaleString('pt-BR')}
                    </dd>
                    <dt className="text-muted-foreground">Caixas retiradas</dt>
                    <dd className="text-right">
                      {totais.caixasRetirada.toLocaleString('pt-BR')}
                    </dd>
                    <dt className="font-medium">Caixas de saldo</dt>
                    <dd className="text-right font-medium">
                      {totais.caixasSaldo.toLocaleString('pt-BR')}
                    </dd>
                    <dt className="font-medium">Peso de saldo</dt>
                    <dd className="text-right font-medium">
                      {kg(totais.kgSaldo)}
                    </dd>
                  </dl>
                </div>
              )}

              {!temLinhas && (
                <p className="text-destructive text-sm font-medium">
                  Nada a importar neste arquivo.
                </p>
              )}
            </div>
          )}

          {res !== null && (
            <DialogFooter>
              <Button variant="outline" onClick={reset} disabled={importando}>
                Escolher outro
              </Button>
              <Button
                onClick={importar}
                loading={importando}
                disabled={importando || !temLinhas}
              >
                Importar
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
