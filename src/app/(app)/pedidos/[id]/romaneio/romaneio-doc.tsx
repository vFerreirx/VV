'use client'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ArrowLeft, Printer, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import type { OrcamentoParaRomaneio } from '../../actions'
import { Logo } from '@/components/brand/logo'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatarCep, formatarDocumento } from '@/lib/validators/documento'

type Comprador = NonNullable<OrcamentoParaRomaneio['comprador']>

// CNPJ da Vanvest, normalizado como o resto do sistema guarda documento (sem
// pontuação) e formatado na exibição pelo mesmo helper do CPF/CNPJ do
// comprador — o romaneio é assinado, então precisa identificar quem entrega,
// não só quem retira.
const CNPJ_EMPRESA = '11258895000185'

function reais(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Endereço em linhas, pulando o que não foi preenchido. O cadastro só exige
// o nome, então qualquer campo pode faltar — e no papel não pode sobrar
// vírgula solta nem "null".
function linhasEndereco(c: Comprador): string[] {
  const linhas: string[] = []

  const rua = [c.logradouro, c.numero].filter(Boolean).join(', ')
  const comComplemento = [rua, c.complemento].filter(Boolean).join(' — ')
  if (comComplemento) linhas.push(comComplemento)

  if (c.bairro) linhas.push(c.bairro)

  const cidadeUf = [c.cidade, c.uf].filter(Boolean).join(' - ')
  if (cidadeUf) linhas.push(cidadeUf)

  return linhas
}

// Rótulo + valor. Só é renderizado por quem já sabe que tem valor — assim o
// rótulo nunca aparece sozinho.
function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-muted-foreground text-xs tracking-wide uppercase">
        {rotulo}
      </div>
      <div className="mt-0.5 text-sm font-medium">{children}</div>
    </div>
  )
}

// Linha pra preencher à mão na hora da retirada.
function Assinatura({ rotulo }: { rotulo: string }) {
  return (
    <div>
      <div className="h-12 border-b print:border-foreground/40" />
      <div className="text-muted-foreground mt-1 text-xs">{rotulo}</div>
    </div>
  )
}

// Romaneio de retirada: COM valores (ao contrário da via de separação) e com
// os dados completos de quem retira, porque é o documento que a pessoa
// assina ao levar a mercadoria.
export function RomaneioDoc({
  orcamento,
}: {
  orcamento: OrcamentoParaRomaneio
}) {
  const { comprador } = orcamento
  // O cadastro manda no nome quando existe; senão vale o texto digitado no
  // orçamento, que é o caso dos orçamentos antigos.
  const nome = comprador?.nome ?? orcamento.cliente
  const endereco = comprador ? linhasEndereco(comprador) : []
  const totalUnidades = orcamento.itens.reduce((s, it) => s + it.quantidade, 0)

  return (
    <div className="mx-auto max-w-3xl space-y-6 print:space-y-4">
      {/* Barra de ações (fora da impressão) */}
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Button
          render={<Link href={`/pedidos/${orcamento.id}`} />}
          variant="ghost"
          size="icon-sm"
          aria-label="Voltar"
        >
          <ArrowLeft />
        </Button>
        <Button onClick={() => window.print()}>
          <Printer />
          Imprimir / PDF
        </Button>
      </div>

      {/* Orçamento antigo, sem comprador vinculado: o romaneio sai, só que
          sem endereço e sem documento. O aviso não vai pro papel. */}
      {!comprador && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 print:hidden dark:text-amber-400">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <div>
            Esse pedido não tem comprador cadastrado — o romaneio sai só com
            o nome, sem documento nem endereço. Vincule um comprador no
            pedido para ele sair completo.
          </div>
        </div>
      )}

      {/* Cabeçalho do documento */}
      <div className="flex items-start justify-between gap-4 border-b pb-4 print:border-foreground/20">
        <div className="flex items-center gap-3">
          <Logo variant="mark" className="size-10" />
          <div>
            <div className="text-lg font-semibold">Vanvest Home Decor</div>
            <div className="text-muted-foreground text-xs tabular-nums">
              CNPJ {formatarDocumento(CNPJ_EMPRESA)}
            </div>
            <div className="text-muted-foreground mt-1 text-sm">
              Romaneio de retirada — Pedido nº {orcamento.numero}
            </div>
          </div>
        </div>
        <div className="text-right text-sm">
          <div className="text-muted-foreground">Data do pedido</div>
          <div className="font-medium tabular-nums">
            {format(new Date(orcamento.createdAt), 'dd/MM/yyyy', {
              locale: ptBR,
            })}
          </div>
        </div>
      </div>

      {/* Dados de quem retira */}
      <div className="break-inside-avoid rounded-lg border p-4 print:border-foreground/20">
        <div className="text-muted-foreground text-xs tracking-wide uppercase">
          Comprador
        </div>
        <div className="mt-0.5 text-base font-medium">{nome}</div>

        {comprador && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {comprador.documento && (
              <Campo rotulo="CPF / CNPJ">
                {formatarDocumento(comprador.documento)}
              </Campo>
            )}
            {comprador.telefone && (
              <Campo rotulo="Telefone">{comprador.telefone}</Campo>
            )}
            {endereco.length > 0 && (
              <Campo rotulo="Endereço">
                {endereco.map((l) => (
                  <div key={l}>{l}</div>
                ))}
              </Campo>
            )}
            {comprador.cep && (
              <Campo rotulo="CEP">{formatarCep(comprador.cep)}</Campo>
            )}
          </div>
        )}
      </div>

      {/* Itens — aqui os valores APARECEM */}
      <div className="rounded-lg border print:border-foreground/20">
        <Table className="table-fixed">
          {/* As larguras vivem aqui, e não na primeira linha: `table-fixed`
              tira as colunas da primeira linha do <thead>, que na impressão
              é a faixa de identificação (um só <th> com colSpan) — sem o
              colgroup as 4 colunas ficavam iguais e a descrição quebrava. */}
          <colgroup>
            <col />
            <col className="w-14 sm:w-16" />
            <col className="w-24 sm:w-28" />
            <col className="w-24 sm:w-28" />
          </colgroup>
          <TableHeader>
            {/* Só na impressão: o <thead> se repete em toda página, então
                esta linha é o que identifica a página 2 em diante — sem ela
                a folha solta é uma lista de itens sem dono. */}
            <TableRow className="hidden print:table-row">
              <TableHead
                colSpan={4}
                className="text-muted-foreground h-auto py-1 text-[10px] font-normal"
              >
                Romaneio de retirada — Pedido nº {orcamento.numero} ·
                Vanvest Home Decor
              </TableHead>
            </TableRow>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Qtd</TableHead>
              <TableHead className="text-right">Preço un.</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orcamento.itens.map((it) => (
              <TableRow key={it.id}>
                <TableCell className="font-medium break-words whitespace-normal">
                  {it.descricao}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {it.quantidade.toLocaleString('pt-BR')}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {reais(Number(it.precoUnitario))}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {reais(it.quantidade * Number(it.precoUnitario))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="font-semibold">Total</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">
                {totalUnidades.toLocaleString('pt-BR')}
              </TableCell>
              <TableCell />
              <TableCell className="text-right text-base font-semibold tabular-nums">
                {reais(orcamento.total)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      {/* Assinatura — `break-inside-avoid` pra não partir entre duas
          páginas quando a lista de itens for longa. */}
      <div className="space-y-6 break-inside-avoid border-t pt-5 print:border-foreground/20">
        <p className="text-sm">
          Declaro que retirei os produtos relacionados acima, conferidos em
          quantidade e estado.
        </p>

        <div className="grid gap-6 sm:grid-cols-[1fr_10rem]">
          <Assinatura rotulo="Assinatura de quem retirou" />
          <Assinatura rotulo="Data da retirada" />
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <Assinatura rotulo="Nome legível" />
          <Assinatura rotulo="CPF / CNPJ de quem assina" />
        </div>
      </div>

      <p className="text-muted-foreground border-t pt-3 text-xs print:border-foreground/20">
        Documento gerado em{' '}
        {format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} —
        romaneio de retirada.
      </p>
    </div>
  )
}
