'use client'

import { ListChecks } from 'lucide-react'
import { useState, useTransition, ViewTransition } from 'react'

import Link from 'next/link'

import type { MaquinaListItem } from '../maquinas/actions'
import { MaquinasGrid } from '../maquinas/maquinas-grid'
import type {
  EstacaoComDetalhes,
  MaquinaOpcao,
  OperadorOpcao,
} from '../estacoes/actions'
import { EstacoesList } from '../estacoes/estacoes-list'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

/**
 * O que falta pra fábrica estar montada: máquina sem estação não aparece em
 * tablet nenhum, e operador sem PIN não consegue trocar de turno no tablet.
 */
export type PendenciasDaFabrica = {
  /**
   * Nenhum usuário ativo com cargo operador. Sem ele o passo 2 é impossível,
   * e a faixa precisa dizer isso — senão fica vazia e parece tudo pronto.
   */
  nenhumOperadorAtivo: boolean
  /** Nomes das estações vivas sem nenhum operador ATIVO. */
  estacoesSemOperador: string[]
  /** Códigos das máquinas sem estação. */
  maquinasSemEstacao: string[]
  /** Nomes dos operadores ativos, com estação, que ainda não criaram PIN. */
  operadoresSemPin: string[]
}

export function FabricaTabs({
  tabInicial,
  verMaquinas,
  verEstacoes,
  maquinas,
  podeEditarMaquinas,
  podeVerOrdens,
  fichaDaOp,
  pendencias,
  podeCriarUsuario,
  estacoes,
  operadores,
  maquinasOpcoes,
}: {
  tabInicial: string
  verMaquinas: boolean
  verEstacoes: boolean
  maquinas: MaquinaListItem[]
  podeEditarMaquinas: boolean
  podeVerOrdens: boolean
  fichaDaOp: { gestor: boolean; podeMover: boolean; podeEditarOrdens: boolean }
  /** Null pra quem não tem escrita em Estações — a faixa nem existe. */
  pendencias: PendenciasDaFabrica | null
  podeCriarUsuario: boolean
  estacoes: EstacaoComDetalhes[]
  operadores: OperadorOpcao[]
  maquinasOpcoes: MaquinaOpcao[]
}) {
  const abas = [
    verMaquinas ? { value: 'maquinas', label: 'Máquinas' } : null,
    verEstacoes ? { value: 'estacoes', label: 'Estações' } : null,
  ].filter((a): a is { value: string; label: string } => a !== null)

  const def = abas.some((a) => a.value === tabInicial)
    ? tabInicial
    : abas[0]?.value

  const [aba, setAba] = useState(def)
  const [, startTransition] = useTransition()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Fábrica</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Máquinas da fábrica e as estações (grupos de máquinas com até três
          operadores).
        </p>
      </div>

      {pendencias && (
        <FaixaDePendencias
          pendencias={pendencias}
          podeCriarUsuario={podeCriarUsuario}
          irParaEstacoes={
            verEstacoes && aba !== 'estacoes'
              ? () => startTransition(() => setAba('estacoes'))
              : null
          }
        />
      )}

      <Tabs
        value={aba}
        onValueChange={(v) => startTransition(() => setAba(v ?? def))}
      >
        <TabsList>
          {abas.map((a) => (
            <TabsTrigger key={a.value} value={a.value}>
              {a.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Crossfade: "mesmo lugar, outro conteudo". Um slide diria "fui
            pra outra tela", que nao e o caso — a barra de abas e o resto do
            layout ficam parados.

            As abas viraram controladas e a troca vai dentro de
            startTransition porque o <ViewTransition> so e ativado por
            Transition/Suspense; setState puro nao dispara nada. */}
        <ViewTransition
          key={aba}
          name="conteudo-abas"
          share="auto"
          enter="auto"
          default="none"
        >
          <div>

            {verMaquinas && (
              <TabsContent value="maquinas" className="mt-2 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-muted-foreground text-sm">
                    {maquinas.length} máquina{maquinas.length === 1 ? '' : 's'}
                  </p>
                  {podeEditarMaquinas && (
                    <Button render={<Link href="/maquinas/novo" />}>
                      Nova máquina
                    </Button>
                  )}
            </div>
            <MaquinasGrid
              maquinas={maquinas}
              podeEditar={podeEditarMaquinas}
              podeVerOrdens={podeVerOrdens}
              fichaDaOp={fichaDaOp}
            />
          </TabsContent>
        )}

        {verEstacoes && (
          <TabsContent value="estacoes" className="mt-2">
            <EstacoesList
              estacoes={estacoes}
              operadores={operadores}
              maquinas={maquinasOpcoes}
            />
          </TabsContent>
        )}
          </div>
        </ViewTransition>
      </Tabs>
    </div>
  )
}

// O PASSO 2 DA MONTAGEM, em cima das duas abas: o que falta aparece onde a
// gerência já está olhando, e some sozinho quando não falta nada — uma faixa
// que fica pra sempre dizendo "tudo certo" vira papel de parede.
function FaixaDePendencias({
  pendencias,
  podeCriarUsuario,
  irParaEstacoes,
}: {
  pendencias: PendenciasDaFabrica
  podeCriarUsuario: boolean
  irParaEstacoes: (() => void) | null
}) {
  const {
    nenhumOperadorAtivo: semNinguem,
    estacoesSemOperador: est,
    maquinasSemEstacao: maq,
    operadoresSemPin: ops,
  } = pendencias
  if (!semNinguem && est.length === 0 && maq.length === 0 && ops.length === 0) {
    return null
  }

  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
      <ListChecks className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" />
      <div className="min-w-0 flex-1 space-y-1">
        {/* ⚠️ SEM OPERADOR NENHUM, A FRASE É ESSA — e não "N estações sem
            operador", que seriam todas e esconderiam a causa. É o bloqueio
            de tudo o que vem embaixo: sem operador não há estação atendida
            nem PIN pra criar. */}
        {semNinguem ? (
          <p>
            <span className="font-medium">Nenhum operador cadastrado.</span>
            <span className="text-muted-foreground">
              {' '}
              As estações não têm quem opere.{' '}
              {podeCriarUsuario ? (
                <>
                  Crie um usuário com cargo Operador em{' '}
                  <Link
                    href="/usuarios"
                    className="text-foreground underline underline-offset-2"
                  >
                    Usuários
                  </Link>
                  .
                </>
              ) : (
                'Peça ao admin pra criar um usuário com cargo Operador em Usuários.'
              )}
            </span>
          </p>
        ) : (
          est.length > 0 && (
            <p>
              <span className="font-medium">
                {est.length} {est.length === 1 ? 'estação' : 'estações'} sem
                operador
              </span>
              <span className="text-muted-foreground">
                {' '}
                ({est.join(', ')}) — ninguém entra no tablet{' '}
                {est.length === 1 ? 'dela' : 'delas'}.
              </span>
            </p>
          )
        )}
        {maq.length > 0 && (
          <p>
            <span className="font-medium">
              {maq.length} {maq.length === 1 ? 'máquina' : 'máquinas'} sem
              estação
            </span>
            <span className="text-muted-foreground">
              {' '}
              ({maq.join(', ')}) — não aparecem em nenhum tablet.
            </span>
          </p>
        )}
        {ops.length > 0 && (
          <p>
            <span className="font-medium">
              {ops.length} {ops.length === 1 ? 'operador' : 'operadores'} sem
              PIN
            </span>
            <span className="text-muted-foreground">
              {' '}
              ({ops.join(', ')}) — o PIN é criado pelo próprio operador, no
              tablet da estação.
            </span>
          </p>
        )}
      </div>
      {(maq.length > 0 || (!semNinguem && est.length > 0)) &&
        irParaEstacoes && (
        <Button size="sm" variant="outline" onClick={irParaEstacoes}>
          Ver estações
        </Button>
      )}
    </div>
  )
}
