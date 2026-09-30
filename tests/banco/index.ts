// npm run test:banco — o fluxo da produção rodado contra o banco, DESFEITO no
// fim. O que cobre, o que não cobre e quando rodar: seção "test:banco" do
// AGENTS.md.
//
//     npm run test:banco                       # todos os cenários
//     npm run test:banco -- fluxo-da-producao  # só os que têm esse nome
//
// ⚠️ TSX EM CJS (o package.json não tem "type": "module"): nada de await no
// topo, tudo dentro de main(). E nenhum import de action aqui em cima — elas
// só carregam por `carregarActions()`, depois dos mocks (mocks.ts).

import { cadastroDeMaquina } from './cenarios/cadastro-de-maquina'
import { estacaoDoTablet } from './cenarios/estacao-do-tablet'
import { fluxoDaProducao } from './cenarios/fluxo-da-producao'
import { pinDoOperador } from './cenarios/pin-do-operador'
import { carregarActions } from './lib/carregar'
import { PassoFalhou, Placar } from './lib/checagem'
import { abrirConexao } from './lib/conexao'
import type { Cenario } from './lib/contexto'
import { montarContexto } from './lib/contexto'
import { rodarDesfeito } from './lib/desfeito'
import { instalarMocks } from './lib/mocks'
import { medirRelogio } from './lib/relogio'
import { divergencias, resumoDoRetrato, tirarRetrato } from './lib/retrato'

const CENARIOS: Cenario[] = [
  fluxoDaProducao,
  estacaoDoTablet,
  cadastroDeMaquina,
  pinDoOperador,
]

async function main(): Promise<number> {
  const filtro = process.argv.slice(2)
  const escolhidos = filtro.length
    ? CENARIOS.filter((c) => filtro.includes(c.nome))
    : CENARIOS
  if (escolhidos.length === 0) {
    console.error(`Nenhum cenário com esse nome. Existem: ${CENARIOS.map((c) => c.nome).join(', ')}`)
    return 1
  }

  // A ordem aqui é a garantia: conexão (tira a DATABASE_URL do env), mocks,
  // e só então as actions.
  const conexao = abrirConexao()
  const estado = instalarMocks()
  const acoes = carregarActions()
  const placar = new Placar()

  try {
    const diferencaDoRelogio = await medirRelogio(conexao.db)
    const antes = await tirarRetrato(conexao.db)

    for (const cenario of escolhidos) {
      placar.titulo(`▶ ${cenario.nome}`)
      try {
        await rodarDesfeito(conexao.db, async (tx) => {
          estado.tx = tx
          try {
            await cenario.rodar(
              await montarContexto(tx, estado, acoes, placar, diferencaDoRelogio),
            )
          } finally {
            estado.tx = null
            estado.usuario = null
            // Cada cenário começa num aparelho sem estação gravada.
            estado.cookies.clear()
          }
        })
      } catch (erro) {
        // O erro já desfez a transação. PassoFalhou já está no placar.
        if (!(erro instanceof PassoFalhou)) {
          placar.falhar(`${cenario.nome} parou no meio`, erro)
        }
      }
    }

    // FORA DA TRANSAÇÃO: o banco tem que estar exatamente como estava.
    placar.titulo('▶ nada ficou gravado')
    const depois = await tirarRetrato(conexao.db)
    const erros = divergencias(antes, depois)
    placar.checar(
      `contagens, contador de OP e status das máquinas iguais aos de antes (${resumoDoRetrato(depois)})`,
      erros.length === 0,
    )
    if (erros.length > 0) {
      console.error('\n🚨🚨🚨 O TESTE DEIXOU COISA NO BANCO DE PRODUÇÃO 🚨🚨🚨')
      for (const e of erros) console.error(`   ${e}`)
      console.error('Procure as linhas pela marca do teste e avise antes de apagar.\n')
    }
  } finally {
    await conexao.fechar()
  }

  console.log(`\n${placar.falhas === 0 ? '✅' : '❌'} ${placar.resumo()}`)
  return placar.falhas === 0 ? 0 : 1
}

main().then(
  (codigo) => {
    process.exitCode = codigo
  },
  (erro) => {
    console.error(erro)
    process.exitCode = 1
  },
)
