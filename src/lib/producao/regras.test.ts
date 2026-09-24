// Testes das regras puras da produção. Rodam com o runner embutido do Node,
// sem dependência nova:
//
//     node --test --experimental-strip-types src/lib/producao/regras.test.ts
//
// Os três módulos aqui são de propósito SEM BANCO e SEM REACT — é o que
// permite testá-los assim, direto, e é o motivo de eles existirem separados
// das actions e das telas.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  calcularConclusao,
  conclusaoPedeMaquina,
  erroDeQuantidade,
  diasDeAtrasoNaConclusao,
  erroDoAutorDoDesfazer,
  resumoDaConclusao,
} from './conclusao.ts'
import { producaoAtrasada } from './atraso-da-op.ts'
import { resolverVariacaoDoFaltante } from './faltante-para-op.ts'
import { reacaoDaEstacao } from './recarga-da-estacao.ts'
import {
  ordenarParaGrade,
  planoDeRetirada,
  resumoPorCor,
  totalDaGrade,
  type LoteComSaldo,
} from '../fios/saldo.ts'
import {
  comparadoAoAtacado,
  resumoDosCanais,
} from '../preco-marketplace.ts'
import {
  MS_ESCONDIDA,
  precisaRecarregarAoVoltar,
  proximoEstadoDoCanal,
} from '../realtime/conexao.ts'
import {
  agruparPorCor,
  casaComBusca,
  resumoDaLista,
} from '../produtos/variacoes.ts'
import {
  DIAS_PARA_PARADA,
  acendeOMenu,
  diasAberta,
  estaParada,
  prioridadeEfetiva,
} from '../validators/tarefas.ts'
import {
  erroAoRenomearTamanho,
  erroDeUso,
  mensagemDoLote,
  plural,
  uso,
} from '../catalogo-em-uso.ts'
import { erroDeOrigemParaOp } from '../produtos/origem.ts'
import { tamanhosDoGrupo } from '../produtos/grupo-de-tamanho.ts'
import {
  chaveOverride,
  ehAreaDesconhecida,
  nivelEfetivo,
  planoDeGravacao,
  podeEscrever,
} from '../auth/permissoes.ts'
import {
  avisoDeAtacadoDuplo,
  contasParadas,
  diasEmAberto,
  foraDoNormal,
  referenciaDaConta,
  type LinhaDoHistorico,
} from '../vendas/conferencia.ts'
import { chaveDaPeca, chaveDeTextoLivre } from '../separacao.ts'
import {
  acaoDaReposicao,
  ESTADOS_ATIVOS_DE_REPOSICAO,
  estadoDaReposicaoPelaOp,
  ordenarFila,
  podeSubirSituacao,
  proximoEstadoDoParceiro,
} from './reposicao.ts'
import { destinoDaOrdem } from './destino-da-ordem.ts'
import {
  erroDaDevolucao,
  erroDaExclusao,
  erroDaTransicaoGenerica,
  erroDaTransicaoPeloFormulario,
  erroDoCancelamento,
  OP_DEVOLVIDA,
  podeConcluirProducao,
} from './transicoes-da-op.ts'
import { buscarVariacoes, erroDaVariacao } from './catalogo-op.ts'
import {
  avisoDoProducaoAte,
  ehEventoDuplicado,
  erroDoProducaoAte,
  FOLGA_DIAS_PRODUCAO,
  prazoDaOp,
  producaoAteEfetivo,
  producaoAtePadrao,
  riscoDaRemessa,
  erroDaRemessaDaOp,
  nomeDaContaNoRotulo,
  rotuloDaRemessa,
  rotuloDoDestino,
  rotuloDoEventoFull,
} from './prazo-da-remessa.ts'
import {
  MOTIVOS_DE_PARADA,
  abreParada,
  duracaoEmPalavras,
  ehMotivoValido,
  exigeObservacao,
  oQueParou,
  rotuloDoMotivo,
} from './parada-de-maquina.ts'
import {
  agruparPorProduto,
  cabecalhoDoProduto,
  destaqueDaVariacao,
  familiaDoProduto,
  linhaDaOp,
  nomeParaLinha,
  prazoEmPalavras,
  tituloDaOp,
} from './rotulo-da-op.ts'
import {
  contarMaquinas,
  disponibilidadeDe,
  grupoDaSituacao,
  motivoDeImpedimento,
  situacaoDaMaquina,
} from './estado-maquina.ts'
import {
  confirmacaoAntesDeIniciar,
  podeIniciar,
  STATUS_QUE_INICIAM,
} from './inicio-da-op.ts'
import {
  DIAS_BACKUP_ATRASADO,
  diasDesdeOBackup,
  estadoDoBackup,
  quandoFoiOBackup,
  tamanhoDoBackup,
} from '../backup.ts'

// -----------------------------------------------------------------
// A situação da máquina — os DOIS eixos
// -----------------------------------------------------------------

// Atalhos pra deixar os cenários legíveis: a segunda posição é "tem OP em
// producao?".
const livre = (st: Parameters<typeof situacaoDaMaquina>[0]) =>
  situacaoDaMaquina(st, false)
const comOp = (st: Parameters<typeof situacaoDaMaquina>[0]) =>
  situacaoDaMaquina(st, true)

test('maquina apta SEM OP e Livre, e aceita OP nova', () => {
  // As 18 maquinas do banco estao em 'operando' e NENHUMA tem OP. Se
  // 'operando' virasse "produzindo", a aba inteira mentiria — que e
  // exatamente o que acontecia.
  const s = livre('operando')
  assert.equal(s.rotulo, 'Livre')
  assert.equal(s.ocupacao, 'livre')
  assert.equal(s.disponibilidade, 'apta')
  assert.equal(s.aceitaNovaOp, true)
})

test('inicio de producao: apta + OP vira Em producao', () => {
  const s = comOp('operando')
  assert.equal(s.rotulo, 'Em produção')
  assert.equal(s.ocupacao, 'com_op')
  assert.equal(s.tom, 'producao')
  // Ja tem OP: nao aceita outra. O indice unico garante no banco, mas a tela
  // precisa saber pra nao oferecer botao que so devolve erro.
  assert.equal(s.aceitaNovaOp, false)
})

test('conclusao: OP em pronto_envio NAO ocupa mais a maquina', () => {
  // Quem chama passa `false` porque a OP saiu de 'em_producao' — e o indice
  // unico e parcial nesse status, entao a maquina libera de verdade. Sem
  // isso, as maquinas iriam ficando "ocupadas" sem ninguem produzindo e a
  // fabrica travaria sozinha.
  assert.equal(livre('operando').rotulo, 'Livre')
  assert.equal(livre('operando').aceitaNovaOp, true)
})

test('manutencao SEM OP: manchete e a manutencao', () => {
  const s = livre('manutencao')
  assert.equal(s.rotulo, 'Em manutenção')
  assert.equal(s.ocupacao, 'livre')
  assert.equal(s.aceitaNovaOp, false)
})

test('manutencao COM OP mostra as DUAS coisas', () => {
  // O caso que quebra qualquer enum colapsado: a manchete e a manutencao, e
  // a ocupacao continua legivel pra tela mostrar a OP presa ali. Esconder
  // uma das duas manda a pessoa decidir errado.
  const s = comOp('manutencao')
  assert.equal(s.rotulo, 'Em manutenção')
  assert.equal(s.ocupacao, 'com_op')
  assert.equal(s.disponibilidade, 'manutencao')
  assert.equal(s.aceitaNovaOp, false)
})

test('saida de manutencao RECALCULA, nao assume', () => {
  // "Ativar" grava 'operando' (= apta). A manchete entao vem da OP: se o
  // trabalho continua la, volta a Em producao; se nao, Livre. Nunca se
  // declara producao por mudanca de cadastro.
  assert.equal(comOp('operando').rotulo, 'Em produção')
  assert.equal(livre('operando').rotulo, 'Livre')
})

test('desativada nao aceita OP, com ou sem trabalho dentro', () => {
  assert.equal(livre('desativada').aceitaNovaOp, false)
  assert.equal(comOp('desativada').aceitaNovaOp, false)
  assert.equal(livre('desativada').rotulo, 'Desativada')
  // A OP presa numa maquina desativada continua visivel pela ocupacao.
  assert.equal(comOp('desativada').ocupacao, 'com_op')
})

test('setup impede iniciar, e e distinto de manutencao', () => {
  // Setup e troca de configuracao: comecar outra OP no meio disso e o tipo
  // de coisa que so se descobre depois. Rotulo proprio porque a diferenca
  // pra manutencao e de DURACAO, e isso muda o que a pessoa faz.
  const s = livre('setup')
  assert.equal(s.aceitaNovaOp, false)
  assert.equal(s.rotulo, 'Em setup')
  assert.notEqual(s.rotulo, livre('manutencao').rotulo)
})

test('parada continua valendo como APTA (valor historico do enum)', () => {
  assert.equal(disponibilidadeDe('parada'), 'apta')
  assert.equal(livre('parada').aceitaNovaOp, true)
})

test('cada impedimento tem frase, e quem nao impede nao tem', () => {
  assert.equal(motivoDeImpedimento('manutencao'), 'está em manutenção')
  assert.equal(motivoDeImpedimento('desativada'), 'está desativada')
  assert.equal(motivoDeImpedimento('setup'), 'está em setup')
  assert.equal(motivoDeImpedimento('operando'), null)
  assert.equal(motivoDeImpedimento('parada'), null)
})

test('aceitaNovaOp e motivoDeImpedimento nunca se contradizem', () => {
  // A tela esconde o botao por `aceitaNovaOp`; o servidor recusa por
  // `motivoDeImpedimento`. Se discordassem, ou a tela ofereceria o que o
  // servidor recusa, ou o servidor aceitaria o que a tela nunca mostra.
  const todos = [
    'operando', 'parada', 'setup', 'manutencao', 'desativada',
  ] as const
  for (const st of todos) {
    const impedido = motivoDeImpedimento(st) !== null
    assert.equal(livre(st).aceitaNovaOp, !impedido, `divergiu em ${st}`)
  }
})

// -----------------------------------------------------------------
// Onde cada OP aparece
// -----------------------------------------------------------------

test('a máquina vence o status', () => {
  assert.equal(destinoDaOrdem('em_producao', true), 'maquina')
})

test('em produção SEM máquina cai na fila, não some', () => {
  // O gerente pode arrastar o card pra "Em produção" sem escolher máquina.
  // Se isso não tivesse destino, a OP ficaria presa e invisível pra sempre.
  assert.equal(destinoDaOrdem('em_producao', false), 'fila')
})

test('as três que saíram da máquina esperam o gerente', () => {
  assert.equal(destinoDaOrdem('acabamento', false), 'terminadas')
  assert.equal(destinoDaOrdem('embalagem', false), 'terminadas')
  assert.equal(destinoDaOrdem('pronto_envio', false), 'terminadas')
})

test('enviado e cancelado somem — mas por decisão escrita', () => {
  assert.equal(destinoDaOrdem('enviado', false), 'fora')
  assert.equal(destinoDaOrdem('cancelado', false), 'fora')
})

test('todo status tem exatamente um destino', () => {
  const todos = [
    'aguardando_materia_prima',
    'programado',
    'em_producao',
    'acabamento',
    'embalagem',
    'pronto_envio',
    'enviado',
    'cancelado',
  ] as const
  for (const s of todos) {
    assert.ok(
      ['maquina', 'fila', 'terminadas', 'fora'].includes(
        destinoDaOrdem(s, false),
      ),
      `${s} ficou sem destino`,
    )
  }
})

// -----------------------------------------------------------------
// O que pode entrar numa máquina
// -----------------------------------------------------------------

test('a lista que a tela mostra é a que a action aceita', () => {
  // Divergir aqui produz um de dois estragos: a tela oferece o que o
  // servidor recusa, ou o servidor aceita o que a tela nunca mostraria.
  for (const s of STATUS_QUE_INICIAM) {
    assert.ok(podeIniciar(s), `${s} está na lista mas podeIniciar recusa`)
  }
})

test('OP que já saiu da máquina não volta pra ela', () => {
  assert.equal(podeIniciar('acabamento'), false)
  assert.equal(podeIniciar('embalagem'), false)
  assert.equal(podeIniciar('pronto_envio'), false)
  assert.equal(podeIniciar('enviado'), false)
  assert.equal(podeIniciar('cancelado'), false)
})

test('só aguardando matéria-prima faz a pergunta', () => {
  assert.equal(
    confirmacaoAntesDeIniciar('aguardando_materia_prima'),
    'Esta OP está aguardando matéria-prima. O fio já está na máquina?',
  )
  assert.equal(confirmacaoAntesDeIniciar('programado'), null)
  assert.equal(confirmacaoAntesDeIniciar('em_producao'), null)
})

test('status que nem inicia não faz pergunta nenhuma', () => {
  // Sem isto, uma OP em pronto_envio abriria o diálogo da matéria-prima
  // antes de a action recusá-la por status — pergunta sem consequência.
  assert.equal(confirmacaoAntesDeIniciar('pronto_envio'), null)
  assert.equal(confirmacaoAntesDeIniciar('cancelado'), null)
})

// -----------------------------------------------------------------
// Concluir a produção
// -----------------------------------------------------------------

test('sem registro anterior, o sugerido e o teto sao a meta', () => {
  const c = calcularConclusao(30, 0)
  assert.equal(c.restante, 30)
  assert.equal(erroDeQuantidade(30, 0, c), null)
})

test('NAO passa da meta do gerente', () => {
  const c = calcularConclusao(30, 0)
  assert.equal(
    erroDeQuantidade(31, 0, c),
    'A OP é de 30 peças. Não dá pra registrar mais que isso.',
  )
})

test('refugo NAO entra no teto', () => {
  // Fio ruim pode queimar mais peças do que a meta inteira. Tampar o refugo
  // faria o operador arredondar pra baixo pra conseguir salvar.
  const c = calcularConclusao(30, 0)
  assert.equal(erroDeQuantidade(30, 99, c), null)
})

test('com registro anterior, o teto e o que FALTA', () => {
  const c = calcularConclusao(30, 12)
  assert.equal(c.restante, 18)
  assert.equal(erroDeQuantidade(18, 0, c), null)
  assert.equal(
    erroDeQuantidade(19, 0, c),
    'A OP é de 30 peças e 12 já foram registradas — o máximo agora é 18',
  )
})

test('OP que ja passou da meta sugere zero, e zero e valido', () => {
  const c = calcularConclusao(30, 45)
  assert.equal(c.restante, 0)
  assert.equal(erroDeQuantidade(0, 0, c), null)
  assert.equal(erroDeQuantidade(1, 0, c) !== null, true)
})

test('abaixo da meta conclui', () => {
  const c = calcularConclusao(30, 0)
  assert.equal(erroDeQuantidade(27, 0, c), null)
})

test('numero quebrado ou negativo nao passa', () => {
  const c = calcularConclusao(30, 0)
  assert.equal(erroDeQuantidade(-1, 0, c), 'Quantidade inválida')
  assert.equal(erroDeQuantidade(1.5, 0, c), 'Quantidade inválida')
  assert.equal(erroDeQuantidade(1, -2, c), 'Refugo inválido')
})

test('o resumo do historico diz o TOTAL contra a meta', () => {
  assert.equal(
    resumoDaConclusao(30, 0, calcularConclusao(30, 0)),
    'Produção concluída com 30 de 30 peças',
  )
  assert.equal(
    resumoDaConclusao(27, 2, calcularConclusao(30, 0)),
    'Produção concluída com 27 de 30 peças (3 a menos) · 2 refugo',
  )
  // Com registro anterior o total soma os dois, senao o gerente leria "18 de
  // 30" numa OP que ficou completa.
  assert.equal(
    resumoDaConclusao(18, 0, calcularConclusao(30, 12)),
    'Produção concluída com 30 de 30 peças',
  )
})

test('a passagem de turno vai NOMEADA no historico', () => {
  // Quem registrou nao e quem produziu: o registro e um so, no fim, no nome
  // de quem concluiu. Ratear seria inventar; nomear a passagem, nao.
  assert.equal(
    resumoDaConclusao(30, 0, calcularConclusao(30, 0), 'teste1'),
    'Produção concluída com 30 de 30 peças · iniciada por teste1',
  )
})

test('mesma pessoa comecando e terminando nao vira ruido', () => {
  assert.equal(
    resumoDaConclusao(30, 0, calcularConclusao(30, 0), null),
    'Produção concluída com 30 de 30 peças',
  )
})

test('o gerente conclui sem teto; o operador continua com teto', () => {
  // O teto e ligado por padrao: quem esquece de passar cai no lado do
  // tablet, que e o seguro.
  const c = calcularConclusao(30, 0)
  assert.equal(erroDeQuantidade(32, 0, c) !== null, true)
  assert.equal(erroDeQuantidade(32, 0, c, { teto: true }) !== null, true)
  assert.equal(erroDeQuantidade(32, 0, c, { teto: false }), null)
  // Sem teto, o resto da validacao continua valendo.
  assert.equal(erroDeQuantidade(-1, 0, c, { teto: false }), 'Quantidade inválida')
  assert.equal(erroDeQuantidade(2, 1.5, c, { teto: false }), 'Refugo inválido')
})

test('acima da meta o historico diz quanto a mais', () => {
  // Sem isto, 32 de 30 saia igual a 30 de 30.
  assert.equal(
    resumoDaConclusao(32, 0, calcularConclusao(30, 0)),
    'Produção concluída com 32 de 30 peças (2 a mais)',
  )
})

test('conclusao depois do prazo registra os dias de atraso', () => {
  assert.equal(
    resumoDaConclusao(30, 0, calcularConclusao(30, 0), null, { diasDeAtraso: 1 }),
    'Produção concluída com 30 de 30 peças · concluída com 1 dia de atraso',
  )
  assert.equal(
    resumoDaConclusao(27, 2, calcularConclusao(30, 0), 'teste1', { diasDeAtraso: 3 }),
    'Produção concluída com 27 de 30 peças (3 a menos) · 2 refugo · iniciada por teste1 · concluída com 3 dias de atraso',
  )
  // No prazo, nada muda no texto.
  assert.equal(
    resumoDaConclusao(30, 0, calcularConclusao(30, 0), null, { diasDeAtraso: 0 }),
    'Produção concluída com 30 de 30 peças',
  )
})

test('dias de atraso na conclusao: dias de calendario em Brasilia', () => {
  // Prazo: fim do dia 27/09 em Brasilia.
  const prazo = new Date('2026-09-28T02:59:59.000Z')
  // 22h do dia 27 em Brasilia (01h do dia 28 em UTC): no prazo.
  assert.equal(diasDeAtrasoNaConclusao(prazo, new Date('2026-09-28T01:00:00Z')), 0)
  // 00h30 do dia 28 em Brasilia: um dia.
  assert.equal(diasDeAtrasoNaConclusao(prazo, new Date('2026-09-28T03:30:00Z')), 1)
  assert.equal(diasDeAtrasoNaConclusao(prazo, new Date('2026-09-30T15:00:00Z')), 3)
  // Antes do prazo e sem prazo: zero.
  assert.equal(diasDeAtrasoNaConclusao(prazo, new Date('2026-09-20T15:00:00Z')), 0)
  assert.equal(diasDeAtrasoNaConclusao(null, new Date('2026-09-30T15:00:00Z')), 0)
})

test('atrasada e so a producao que nao foi concluida', () => {
  const prazo = new Date('2026-09-28T02:59:59.000Z')
  const depois = new Date('2026-09-29T12:00:00Z')
  const antes = new Date('2026-09-27T12:00:00Z')
  assert.equal(producaoAtrasada('programado', prazo, depois), true)
  assert.equal(producaoAtrasada('em_producao', prazo, depois), true)
  assert.equal(producaoAtrasada('aguardando_materia_prima', prazo, depois), true)
  // Legados contam como nao concluidos.
  assert.equal(producaoAtrasada('acabamento', prazo, depois), true)
  assert.equal(producaoAtrasada('embalagem', prazo, depois), true)
  // Concluida, com baixa ou cancelada: nunca atrasada — a baixa e ambar.
  assert.equal(producaoAtrasada('pronto_envio', prazo, depois), false)
  assert.equal(producaoAtrasada('enviado', prazo, depois), false)
  assert.equal(producaoAtrasada('cancelado', prazo, depois), false)
  // Prazo ainda nao venceu, ou sem prazo.
  assert.equal(producaoAtrasada('em_producao', prazo, antes), false)
  assert.equal(producaoAtrasada('em_producao', null, depois), false)
})

test('conclusao fora da maquina registra a maquina informada', () => {
  assert.equal(
    resumoDaConclusao(27, 1, calcularConclusao(30, 0), null, { maquinaInformada: 'TC-03' }),
    'Produção concluída com 27 de 30 peças (3 a menos) · 1 refugo · máquina TC-03 informada na conclusão',
  )
})

test('conclusao pede a maquina quando a OP nao esta numa maquina', () => {
  assert.equal(conclusaoPedeMaquina('programado', null), true)
  assert.equal(conclusaoPedeMaquina('programado', 'm1'), true)
  assert.equal(conclusaoPedeMaquina('aguardando_materia_prima', null), true)
  assert.equal(conclusaoPedeMaquina('acabamento', 'm1'), true)
  // Legado: em producao sem maquina.
  assert.equal(conclusaoPedeMaquina('em_producao', null), true)
  // Rodando numa maquina: usa a dela.
  assert.equal(conclusaoPedeMaquina('em_producao', 'm1'), false)
})

test('desfazer no tablet: so quem concluiu', () => {
  const vitor = { id: 'u-vitor', nome: 'Vitor' }
  assert.equal(erroDoAutorDoDesfazer({ id: 'u-teste1', nome: 'teste1' }, 'u-teste1'), null)
  // O colega de estacao nao desfaz — e a frase diz quem pode.
  assert.equal(
    erroDoAutorDoDesfazer(vitor, 'u-teste1'),
    'Quem concluiu foi Vitor. Só essa pessoa ou o gerente podem desfazer.',
  )
  // Sem autor nao da pra provar que foi o proprio: recusa.
  assert.notEqual(erroDoAutorDoDesfazer(null, 'u-teste1'), null)
  assert.notEqual(erroDoAutorDoDesfazer({ id: null, nome: null }, 'u-teste1'), null)
})

// -----------------------------------------------------------------
// Como a OP se apresenta na lista
// -----------------------------------------------------------------

test('o modelo some quando ja esta no nome do produto', () => {
  // "Capa de Almofada - ACONCHEGO" + "Caqui · ACONCHEGO · 45x45" dizia
  // ACONCHEGO duas vezes, e a segunda ocupava o lugar de destaque.
  assert.equal(
    destaqueDaVariacao('Capa de Almofada - ACONCHEGO', {
      cor: 'Caqui',
      modelo: 'ACONCHEGO',
      tamanho: '45x45',
    }),
    'Caqui · 45x45',
  )
})

test('mas SOBREVIVE quando o nome nao o contem', () => {
  // Se um produto novo nao seguir o padrao de nomes, o modelo continua
  // aparecendo em vez de sumir em silencio.
  assert.equal(
    destaqueDaVariacao('Capa de Almofada', {
      cor: 'Caqui',
      modelo: 'ACONCHEGO',
      tamanho: '45x45',
    }),
    'Caqui · ACONCHEGO · 45x45',
  )
})

test('acento e caixa nao decidem se uma palavra some', () => {
  assert.equal(
    destaqueDaVariacao('Peseira - Efeito 3D', {
      cor: 'Nude',
      modelo: 'EFEITO 3D',
      tamanho: 'King',
    }),
    'Nude · King',
  )
})

test('campos vazios nao viram separador solto', () => {
  assert.equal(
    destaqueDaVariacao('Manta - ACONCHEGO', {
      cor: 'Areia',
      modelo: null,
      tamanho: null,
    }),
    'Areia',
  )
  assert.equal(
    destaqueDaVariacao('Produto', { cor: null, modelo: null, tamanho: null }),
    '',
  )
})

test('o prazo vira palavra, em dias de CALENDARIO', () => {
  const agora = new Date('2026-09-10T14:00:00')
  assert.equal(prazoEmPalavras(null, agora), null)
  // Venceu as 8h de hoje: continua sendo HOJE as 14h, e nao "atrasada".
  assert.deepEqual(prazoEmPalavras(new Date('2026-09-10T08:00:00'), agora), {
    texto: 'vence HOJE',
    urgente: true,
  })
  assert.deepEqual(prazoEmPalavras(new Date('2026-09-11T23:00:00'), agora), {
    texto: 'vence amanhã',
    urgente: false,
  })
  assert.deepEqual(prazoEmPalavras(new Date('2026-09-18T00:00:00'), agora), {
    texto: '8 dias',
    urgente: false,
  })
})

test('atrasada conta os dias e e urgente', () => {
  const agora = new Date('2026-09-10T14:00:00')
  assert.deepEqual(prazoEmPalavras(new Date('2026-09-09T23:59:00'), agora), {
    texto: 'ATRASADA 1 dia',
    urgente: true,
  })
  assert.deepEqual(prazoEmPalavras(new Date('2026-09-07T00:00:00'), agora), {
    texto: 'ATRASADA 3 dias',
    urgente: true,
  })
})

test('a familia perde o modelo, e so quando ele esta no fim', () => {
  assert.equal(familiaDoProduto('Capa de Almofada - RELEVO', 'RELEVO'), 'Capa de Almofada')
  assert.equal(familiaDoProduto('Peseira - EFEITO 3D', 'EFEITO 3D'), 'Peseira')
  // Nao termina com o modelo: devolve inteiro em vez de cortar errado.
  assert.equal(familiaDoProduto('Capa RELEVO especial', 'RELEVO'), 'Capa RELEVO especial')
  assert.equal(familiaDoProduto('Manta', null), 'Manta')
  // Cortar tudo deixaria a linha vazia — melhor o nome inteiro.
  assert.equal(familiaDoProduto('RELEVO', 'RELEVO'), 'RELEVO')
})

test('agrupa por produto SEM reordenar', () => {
  // A lista chega ordenada por prioridade/prazo; o grupo entra na posicao da
  // primeira OP dele, entao a urgencia decide a ordem dos grupos tambem.
  const fila = [
    { id: 'a', produtoCodigo: '095', produtoNome: 'Peseira - ACONCHEGO' },
    { id: 'b', produtoCodigo: '085', produtoNome: 'Peseira - ARAN' },
    { id: 'c', produtoCodigo: '094', produtoNome: 'Manta - SIENA' },
    { id: 'd', produtoCodigo: '085', produtoNome: 'Peseira - ARAN' },
    { id: 'e', produtoCodigo: '085', produtoNome: 'Peseira - ARAN' },
  ]
  const g = agruparPorProduto(fila)
  assert.deepEqual(
    g.map((x) => [x.cabecalho, x.ops.map((o) => o.id)]),
    [
      ['095 · Peseira ACONCHEGO', ['a']],
      ['085 · Peseira ARAN', ['b', 'd', 'e']],
      ['094 · Manta SIENA', ['c']],
    ],
  )
})

test('agrupa pelo PROGRAMA: mesmo modelo em produtos diferentes nao se junta', () => {
  // O EFEITO 3D e 076 na peseira e 115 na manta: dois programas, dois setups.
  // E o 059 tece a peseira E a capa LINKS: mesmo codigo, pecas diferentes.
  const g = agruparPorProduto([
    { id: 'a', produtoCodigo: '076', produtoNome: 'Peseira - 3D' },
    { id: 'b', produtoCodigo: '115', produtoNome: 'Manta - 3D' },
    { id: 'c', produtoCodigo: '059', produtoNome: 'Peseira - LINKS' },
    { id: 'd', produtoCodigo: '059', produtoNome: 'Capa de Almofada - LINKS' },
  ])
  assert.deepEqual(
    g.map((x) => x.cabecalho),
    [
      '076 · Peseira 3D',
      '115 · Manta 3D',
      '059 · Peseira LINKS',
      '059 · Capa de Almofada LINKS',
    ],
  )
})

test('produto sem codigo vira grupo proprio, sem traco nem "null"', () => {
  const g = agruparPorProduto([
    { id: 'a', produtoCodigo: null, produtoNome: 'Peseira - NOVA' },
    { id: 'b', produtoCodigo: '085', produtoNome: 'Peseira - ARAN' },
  ])
  assert.deepEqual(g.map((x) => x.cabecalho), ['Peseira NOVA', '085 · Peseira ARAN'])
  assert.equal(cabecalhoDoProduto('  ', 'Peseira - NOVA'), 'Peseira NOVA')
})

test('fila vazia nao vira grupo vazio', () => {
  assert.deepEqual(agruparPorProduto([]), [])
})

test('o titulo sai em PARTES, pras duas telas montarem igual', () => {
  assert.deepEqual(
    tituloDaOp('Peseira - RELEVO', {
      cor: 'Marsala',
      modelo: 'RELEVO',
      tamanho: 'Queen',
    }),
    { familia: 'Peseira', variacao: 'Marsala · Queen', modelo: 'RELEVO' },
  )
})

test('sem modelo, a familia e o nome inteiro', () => {
  assert.deepEqual(
    tituloDaOp('Manta Avulsa', { cor: 'Areia', modelo: null, tamanho: null }),
    { familia: 'Manta Avulsa', variacao: 'Areia', modelo: null },
  )
})

test('o modelo NAO se repete dentro da variacao', () => {
  // Ele ja aparece no cabecalho do grupo (fila) ou na linha de baixo
  // (cartao da maquina). Repetir aqui era a redundancia original.
  const t = tituloDaOp('Capa de Almofada - SIENA', {
    cor: 'Areia e Azul Marinho',
    modelo: 'SIENA',
    tamanho: '45x45',
  })
  assert.equal(t.variacao.includes('SIENA'), false)
  assert.equal(t.variacao, 'Areia e Azul Marinho · 45x45')
})

// -----------------------------------------------------------------
// O resumo da fábrica
// -----------------------------------------------------------------

test('a maquina em manutencao COM OP conta UMA vez, em indisponiveis', () => {
  // A armadilha da fase: ela tem ocupacao E impedimento. Um resumo que
  // somasse "com OP" e "impedidas" separado contaria ela duas vezes, e o
  // total estouraria o numero de maquinas da fabrica.
  const c = contarMaquinas([comOp('manutencao')])
  assert.deepEqual(c, {
    emProducao: 0,
    livres: 0,
    indisponiveis: 1,
    total: 1,
  })
})

test('os tres baldes somam SEMPRE o total (exaustividade)', () => {
  // Toda combinacao de status x ocupacao: a soma tem que fechar. Se um
  // status novo do enum cair fora dos tres, este teste quebra.
  const todos = ['operando', 'parada', 'setup', 'manutencao', 'desativada'] as const
  const situacoes = todos.flatMap((st) => [livre(st), comOp(st)])
  const c = contarMaquinas(situacoes)
  assert.equal(c.emProducao + c.livres + c.indisponiveis, c.total)
  assert.equal(c.total, situacoes.length)
})

test('o resumo da fabrica de hoje: 18 aptas e vazias', () => {
  // As 18 maquinas vivas estao em 'operando' sem OP nenhuma.
  const c = contarMaquinas(Array.from({ length: 18 }, () => livre('operando')))
  assert.deepEqual(c, { emProducao: 0, livres: 18, indisponiveis: 0, total: 18 })
})

test('o grupo do filtro e o MESMO que o do resumo', () => {
  // Se fossem duas regras, clicar em "3 indisponiveis" poderia trazer 4
  // cartoes — e ninguem desconfia de um filtro que traz demais.
  assert.equal(grupoDaSituacao(comOp('operando')), 'em_producao')
  assert.equal(grupoDaSituacao(livre('operando')), 'livre')
  assert.equal(grupoDaSituacao(livre('setup')), 'indisponivel')
  assert.equal(grupoDaSituacao(comOp('desativada')), 'indisponivel')
})

// -----------------------------------------------------------------
// Parada de maquina
// -----------------------------------------------------------------

test('abre parada exatamente nos status que IMPEDEM produzir', () => {
  // A regra nao tem lista propria: deriva de `motivoDeImpedimento`. Se um
  // status novo passar a impedir, ele abre parada sozinho — e este teste e
  // quem prova que as duas respostas continuam sendo a mesma.
  assert.equal(abreParada('manutencao'), true)
  assert.equal(abreParada('setup'), true)
  assert.equal(abreParada('desativada'), true)
  assert.equal(abreParada('operando'), false)
  assert.equal(abreParada('parada'), false)
})

test('os motivos batem com o CHECK do banco', () => {
  // Copia deliberada de `maquina_paradas_motivo_ck` (57). Divergir faz o
  // INSERT estourar em producao e chegar na tela como "erro ao salvar".
  assert.deepEqual(
    MOTIVOS_DE_PARADA.map((m) => m.valor),
    [
      'quebra',
      'preventiva',
      'troca_agulha',
      'falta_fio',
      'sem_operador',
      'energia',
      'outro',
    ],
  )
})

test('so "outro" exige observacao', () => {
  assert.equal(exigeObservacao('outro'), true)
  assert.equal(exigeObservacao('quebra'), false)
})

test('motivo nulo tem rotulo, porque setup e desativacao nao escolhem motivo', () => {
  // Nulo e caso normal e nao erro — sem isto o historico mostraria uma linha
  // com um buraco em branco no lugar do motivo.
  assert.equal(rotuloDoMotivo(null), 'Sem motivo registrado')
  assert.equal(rotuloDoMotivo('falta_fio'), 'Falta de fio')
  // Valor fora da lista aparece cru em vez de sumir com a linha.
  assert.equal(rotuloDoMotivo('eletrica'), 'eletrica')
  assert.equal(ehMotivoValido('eletrica'), false)
  assert.equal(ehMotivoValido('quebra'), true)
})

test('manchete da parada: motivo em minuscula, e o "outro" diz o que foi', () => {
  const p = (motivo: string | null, observacaoAbertura: string | null = null) =>
    oQueParou({ motivo, observacaoAbertura })
  assert.equal(p('falta_fio'), 'falta de fio')
  assert.equal(p('preventiva'), 'manutenção preventiva')
  // A observacao so substitui o rotulo no "outro".
  assert.equal(p('quebra', 'agulha partida'), 'quebra')
  assert.equal(p('outro', 'correia solta'), 'correia solta')
  // "Outro" sem texto nao deixa a manchete vazia.
  assert.equal(p('outro'), 'outro')
})

test('a duracao se mede em minutos e horas, nao em viradas de meia-noite', () => {
  // O caso que quebra `diasDeCalendario`: 23h50 -> 00h10 e uma parada de 20
  // minutos, nao de "1 dia".
  const noite = new Date('2026-09-10T23:50:00Z')
  const madrugada = new Date('2026-09-11T00:10:00Z')
  assert.equal(duracaoEmPalavras(noite, madrugada), '20 min')
})

test('a precisao cai conforme a escala', () => {
  const t0 = new Date('2026-09-11T08:00:00Z')
  const em = (ms: number) => new Date(t0.getTime() + ms)
  assert.equal(duracaoEmPalavras(t0, em(30_000)), 'menos de 1 min')
  assert.equal(duracaoEmPalavras(t0, em(12 * 60_000)), '12 min')
  assert.equal(duracaoEmPalavras(t0, em(59 * 60_000)), '59 min')
  assert.equal(duracaoEmPalavras(t0, em(60 * 60_000)), '1 h')
  // Quem olha uma parada de 3 horas nao quer os 14 minutos.
  assert.equal(duracaoEmPalavras(t0, em(3 * 3_600_000 + 14 * 60_000)), '3 h')
  assert.equal(duracaoEmPalavras(t0, em(23 * 3_600_000)), '23 h')
  assert.equal(duracaoEmPalavras(t0, em(24 * 3_600_000)), '1 dia')
  assert.equal(duracaoEmPalavras(t0, em(50 * 3_600_000)), '2 dias')
})

test('relogio do tablet atrasado nao vira duracao negativa na tela', () => {
  // O banco recusa gravar fim antes do inicio, mas o cartao calcula contra o
  // relogio de QUEM ESTA OLHANDO. "-5 min" seria pior que arredondar.
  const t0 = new Date('2026-09-11T08:00:00Z')
  const antes = new Date('2026-09-11T07:55:00Z')
  assert.equal(duracaoEmPalavras(t0, antes), 'menos de 1 min')
})

// -----------------------------------------------------------------
// As portas da OP
// -----------------------------------------------------------------

test('em producao nunca entra pelo caminho generico', () => {
  // Nem com apontamento: a porta pede a MAQUINA, nao a quantidade.
  assert.notEqual(erroDaTransicaoGenerica('programado', 'em_producao', false), null)
  assert.notEqual(erroDaTransicaoGenerica('pronto_envio', 'em_producao', true), null)
})

test('producao concluida pelo generico so com apontamento', () => {
  assert.notEqual(erroDaTransicaoGenerica('em_producao', 'pronto_envio', false), null)
  // A volta: OP concluida que recuou uma coluna ja tem a quantidade dela.
  assert.equal(erroDaTransicaoGenerica('programado', 'pronto_envio', true), null)
})

test('baixa so a partir de producao concluida E com apontamento', () => {
  // O caminho que alimentava o fallback da meta: pular direto pra enviado.
  assert.notEqual(erroDaTransicaoGenerica('programado', 'enviado', true), null)
  assert.notEqual(erroDaTransicaoGenerica('em_producao', 'enviado', true), null)
  assert.notEqual(erroDaTransicaoGenerica('pronto_envio', 'enviado', false), null)
  assert.equal(erroDaTransicaoGenerica('pronto_envio', 'enviado', true), null)
})

test('as outras transicoes seguem livres, e ficar parado nunca e erro', () => {
  assert.equal(erroDaTransicaoGenerica('em_producao', 'programado', false), null)
  assert.equal(erroDaTransicaoGenerica('programado', 'cancelado', false), null)
  assert.equal(erroDaTransicaoGenerica('enviado', 'pronto_envio', true), null)
  assert.equal(erroDaTransicaoGenerica('em_producao', 'em_producao', false), null)
})

test('o formulario nao leva pra nenhuma das tres portas, nem com apontamento', () => {
  for (const para of ['em_producao', 'pronto_envio', 'enviado'] as const) {
    assert.notEqual(erroDaTransicaoPeloFormulario('programado', para), null)
  }
  // O status atual continua valido: editar a observacao de uma OP em
  // producao nao pode ser recusado.
  assert.equal(erroDaTransicaoPeloFormulario('em_producao', 'em_producao'), null)
  assert.equal(erroDaTransicaoPeloFormulario('programado', 'aguardando_materia_prima'), null)
})

test('gerente conclui de qualquer coluna antes; operador so de em producao', () => {
  for (const s of ['aguardando_materia_prima', 'programado', 'acabamento', 'embalagem'] as const) {
    assert.equal(podeConcluirProducao(s, true), true, s)
    assert.equal(podeConcluirProducao(s, false), false, s)
  }
  assert.equal(podeConcluirProducao('em_producao', false), true)
  assert.equal(podeConcluirProducao('em_producao', true), true)
  // Depois da conclusao ninguem conclui de novo.
  for (const s of ['pronto_envio', 'enviado', 'cancelado'] as const) {
    assert.equal(podeConcluirProducao(s, true), false, s)
  }
})

// -----------------------------------------------------------------
// Cancelar e excluir
// -----------------------------------------------------------------

test('OP com baixa nao cancela, nem pelo botao nem pelo status manual', () => {
  assert.notEqual(erroDoCancelamento('enviado'), null)
  assert.notEqual(erroDaTransicaoGenerica('enviado', 'cancelado', true), null)
  assert.notEqual(erroDoCancelamento('cancelado'), null)
  for (const s of ['aguardando_materia_prima', 'programado', 'em_producao', 'pronto_envio'] as const) {
    assert.equal(erroDoCancelamento(s), null, s)
    assert.equal(erroDaTransicaoGenerica(s, 'cancelado', false), null, s)
  }
})

test('exclui so o engano: nunca entrou em producao e sem apontamento', () => {
  assert.equal(
    erroDaExclusao({ status: 'programado', dataRealInicio: null, temApontamento: false }),
    null,
  )
  // Cancelada por engano tambem se exclui: nunca produziu nada.
  assert.equal(
    erroDaExclusao({ status: 'cancelado', dataRealInicio: null, temApontamento: false }),
    null,
  )
})

test('OP que entrou em producao e voltou pra fila nao exclui', () => {
  // O Desfazer devolve pra Programado, mas a data de inicio fica.
  assert.notEqual(
    erroDaExclusao({ status: 'programado', dataRealInicio: new Date(), temApontamento: false }),
    null,
  )
})

test('legado em coluna depois da maquina, sem data de inicio, nao exclui', () => {
  for (const s of ['em_producao', 'acabamento', 'embalagem', 'pronto_envio', 'enviado'] as const) {
    assert.notEqual(
      erroDaExclusao({ status: s, dataRealInicio: null, temApontamento: false }),
      null,
      s,
    )
  }
})

test('apontamento impede excluir, mesmo na fila', () => {
  assert.notEqual(
    erroDaExclusao({ status: 'programado', dataRealInicio: null, temApontamento: true }),
    null,
  )
})

// -----------------------------------------------------------------
// Busca unica por variacao
// -----------------------------------------------------------------

const catalogo = [
  {
    id: 'p1',
    nome: 'Peseira - RELEVO',
    sku: '010',
    variacoes: [
      { id: 'v1', modelo: 'RELEVO', tamanho: 'Queen', cor: 'Marsala', skuVariacao: '010-MAR-Q' },
      { id: 'v2', modelo: 'RELEVO', tamanho: 'Casal', cor: 'Marsala', skuVariacao: '010-MAR-C' },
      { id: 'v3', modelo: 'RELEVO', tamanho: 'Queen', cor: 'Âmbar', skuVariacao: '010-AMB-Q' },
    ],
  },
  {
    id: 'p2',
    nome: 'Manta - ACONCHEGO',
    sku: '020',
    variacoes: [
      { id: 'v4', modelo: 'ACONCHEGO', tamanho: 'Manta', cor: 'Marsala', skuVariacao: '020-MAR' },
      { id: 'v5', modelo: null, tamanho: 'Manta', cor: 'Areia', skuVariacao: '020-ARE' },
    ],
  },
]

test('busca: todo pedaco precisa casar, em qualquer campo', () => {
  const r = buscarVariacoes(catalogo, 'peseira marsala queen')
  assert.deepEqual(r.itens.map((i) => i.variacao.id), ['v1'])
  assert.deepEqual(
    buscarVariacoes(catalogo, 'marsala').itens.map((i) => i.variacao.id),
    ['v1', 'v2', 'v4'],
  )
})

test('busca: sem acento e sem maiuscula', () => {
  assert.deepEqual(buscarVariacoes(catalogo, 'AMBAR').itens.map((i) => i.variacao.id), ['v3'])
})

test('busca: acha pelo SKU da variacao e pelo SKU do produto', () => {
  assert.deepEqual(buscarVariacoes(catalogo, '010-amb').itens.map((i) => i.variacao.id), ['v3'])
  assert.equal(buscarVariacoes(catalogo, '020').total, 2)
})

test('busca: vazia e sem escopo nao lista nada', () => {
  assert.equal(buscarVariacoes(catalogo, '   ').total, 0)
})

test('busca: com escopo, vazia lista o produto e modelo do escopo', () => {
  const r = buscarVariacoes(catalogo, '', { escopo: { produtoId: 'p1', modelo: 'RELEVO' } })
  assert.deepEqual(r.itens.map((i) => i.variacao.id), ['v1', 'v2', 'v3'])
  // E o escopo filtra junto com o termo.
  const q = buscarVariacoes(catalogo, 'casal', { escopo: { produtoId: 'p1', modelo: 'RELEVO' } })
  assert.deepEqual(q.itens.map((i) => i.variacao.id), ['v2'])
  // Variacao sem modelo cai no "Sem modelo".
  const sm = buscarVariacoes(catalogo, '', { escopo: { produtoId: 'p2', modelo: 'Sem modelo' } })
  assert.deepEqual(sm.itens.map((i) => i.variacao.id), ['v5'])
})

test('busca: limite corta a lista mas o total diz quantas havia', () => {
  const r = buscarVariacoes(catalogo, 'marsala', { limite: 2 })
  assert.equal(r.itens.length, 2)
  assert.equal(r.total, 3)
})

test('variacao e sempre obrigatoria, mesmo em produto sem variacao', () => {
  assert.notEqual(erroDaVariacao('', []), null)
  assert.notEqual(erroDaVariacao(null, [{ id: 'a' }]), null)
  assert.equal(erroDaVariacao('a', [{ id: 'a' }]), null)
})

// -----------------------------------------------------------------
// Prazo da producao da remessa Full
// -----------------------------------------------------------------

test('o padrao e a data de envio menos a folga, atravessando o mes', () => {
  assert.equal(FOLGA_DIAS_PRODUCAO, 3)
  assert.equal(producaoAtePadrao('2026-09-30'), '2026-09-27')
  assert.equal(producaoAtePadrao('2026-10-02'), '2026-09-29')
})

test('nulo e o padrao, e acompanha a data de envio', () => {
  assert.equal(producaoAteEfetivo({ dataEnvio: '2026-09-30', producaoAte: null }), '2026-09-27')
  assert.equal(producaoAteEfetivo({ dataEnvio: '2026-10-10', producaoAte: null }), '2026-10-07')
  assert.equal(producaoAteEfetivo({ dataEnvio: '2026-09-30', producaoAte: '2026-09-20' }), '2026-09-20')
})

test('producao ate: o unico bloqueio e passar do envio', () => {
  assert.equal(erroDoProducaoAte('2026-09-30', null), null)
  assert.equal(erroDoProducaoAte('2026-09-30', '2026-09-27'), null)
  assert.equal(erroDoProducaoAte('2026-09-30', '2026-09-10'), null)
  // Remessa urgente: folga curta NAO bloqueia mais — vira aviso.
  assert.equal(erroDoProducaoAte('2026-09-30', '2026-09-28'), null)
  // O mesmo dia do envio e permitido, como o CHECK da migration 58.
  assert.equal(erroDoProducaoAte('2026-09-30', '2026-09-30'), null)
  assert.notEqual(erroDoProducaoAte('2026-09-30', '2026-10-01'), null)
  assert.notEqual(erroDoProducaoAte('2026-09-30', '30/09/2026'), null)
})

test('producao ate: folga curta e aviso, nao erro', () => {
  assert.notEqual(avisoDoProducaoAte('2026-09-30', '2026-09-28'), null)
  assert.notEqual(avisoDoProducaoAte('2026-09-30', '2026-09-30'), null)
  // Sem aviso no padrao, com a folga exata e com folga de sobra.
  assert.equal(avisoDoProducaoAte('2026-09-30', null), null)
  assert.equal(avisoDoProducaoAte('2026-09-30', '2026-09-27'), null)
  assert.equal(avisoDoProducaoAte('2026-09-30', '2026-09-10'), null)
  // Quando ja e erro, a tela mostra so o erro.
  assert.equal(avisoDoProducaoAte('2026-09-30', '2026-10-01'), null)
  assert.equal(avisoDoProducaoAte('2026-09-30', '30/09/2026'), null)
})

test('o prazo da OP e o fim do dia em Brasilia', () => {
  assert.equal(prazoDaOp('2026-09-27').toISOString(), '2026-09-28T02:59:59.000Z')
})

test('risco: atrasada so quando o prazo da PRODUCAO passou', () => {
  const base = { producaoConcluida: false, diasAteEnvio: 5 }
  assert.equal(riscoDaRemessa({ ...base, diasAteProducao: -1 }), 'atrasada')
  assert.equal(riscoDaRemessa({ ...base, diasAteProducao: 0 }), 'em_risco')
  assert.equal(riscoDaRemessa({ ...base, diasAteProducao: 2 }), 'em_risco')
  assert.equal(riscoDaRemessa({ ...base, diasAteProducao: 3 }), 'no_prazo')
})

test('producao concluida com envio passado e pendencia de baixa, nao atraso', () => {
  assert.equal(
    riscoDaRemessa({ producaoConcluida: true, diasAteProducao: -10, diasAteEnvio: -1 }),
    'baixa_pendente',
  )
  // Concluida antes do envio esta no prazo, mesmo que o prazo da producao
  // tenha passado ontem.
  assert.equal(
    riscoDaRemessa({ producaoConcluida: true, diasAteProducao: -1, diasAteEnvio: 2 }),
    'no_prazo',
  )
})

test('rotulo da remessa: canal e dia/mes', () => {
  assert.equal(rotuloDaRemessa('full_ml', '2026-09-30'), 'Full ML · 30/09')
  assert.equal(rotuloDaRemessa('full_shopee', '2026-10-02'), 'Full Shopee · 02/10')
})

test('reposicao: marcar de novo so sobe de acabando pra acabou', () => {
  assert.equal(podeSubirSituacao('acabando', 'acabou'), true)
  assert.equal(podeSubirSituacao('acabou', 'acabando'), false)
  assert.equal(podeSubirSituacao('acabando', 'acabando'), false)
  assert.equal(podeSubirSituacao('acabou', 'acabou'), false)
})

test('reposicao: fila com acabou antes, e o mais antigo primeiro', () => {
  const itens = [
    { id: 'a', situacao: 'acabando', marcadoEm: new Date('2026-09-10T10:00:00Z') },
    { id: 'b', situacao: 'acabou', marcadoEm: new Date('2026-09-12T10:00:00Z') },
    { id: 'c', situacao: 'acabando', marcadoEm: new Date('2026-09-08T10:00:00Z') },
    { id: 'd', situacao: 'acabou', marcadoEm: new Date('2026-09-11T10:00:00Z') },
  ]
  assert.deepEqual(ordenarFila(itens).map((i) => i.id), ['d', 'b', 'c', 'a'])
})

test('reposicao: o estado do item segue a OP ligada', () => {
  const op = { status: 'programado' as const, excluida: false, variacaoId: 'v1', canalDestino: 'estoque' }
  assert.equal(estadoDaReposicaoPelaOp(op, 'v1'), 'em_producao')
  assert.equal(estadoDaReposicaoPelaOp({ ...op, status: 'pronto_envio' }, 'v1'), 'em_producao')
  assert.equal(estadoDaReposicaoPelaOp({ ...op, status: 'enviado' }, 'v1'), 'reposto')
  // A OP deixou de repor esta peca: o item volta pra fila.
  assert.equal(estadoDaReposicaoPelaOp({ ...op, status: 'cancelado' }, 'v1'), 'aberto')
  assert.equal(estadoDaReposicaoPelaOp({ ...op, excluida: true }, 'v1'), 'aberto')
  assert.equal(estadoDaReposicaoPelaOp({ ...op, variacaoId: 'v2' }, 'v1'), 'aberto')
  assert.equal(estadoDaReposicaoPelaOp({ ...op, canalDestino: 'full_ml' }, 'v1'), 'aberto')
  assert.equal(estadoDaReposicaoPelaOp(null, 'v1'), 'aberto')
})

test('faltante do pedido: resolve so quando a peca e inequivoca', () => {
  const produtos = [
    {
      id: 'p1',
      nome: 'Peseira - ACONCHEGO',
      variacoes: [
        { id: 'v1', cor: 'Marsala', tamanho: 'Queen' },
        { id: 'v2', cor: 'Areia', tamanho: 'Queen' },
      ],
    },
    { id: 'p2', nome: 'Manta - SIENA', variacoes: [{ id: 'v3', cor: 'Areia', tamanho: null }] },
    { id: 'p3', nome: 'Capa  duplicada', variacoes: [] },
    { id: 'p4', nome: 'capa duplicada', variacoes: [] },
  ]
  // A chave montada pela via de separacao casa, sem diferenca de caixa/espaco.
  assert.deepEqual(
    resolverVariacaoDoFaltante(
      chaveDaPeca({ produto: 'Peseira - ACONCHEGO', tamanho: 'Queen', cor: ' marsala ' }),
      produtos,
    ),
    { ok: true, produtoId: 'p1', variacaoId: 'v1' },
  )
  assert.deepEqual(
    resolverVariacaoDoFaltante(chaveDaPeca({ produto: 'Manta - SIENA', tamanho: null, cor: 'Areia' }), produtos),
    { ok: true, produtoId: 'p2', variacaoId: 'v3' },
  )
  const motivo = (chave: string) => {
    const r = resolverVariacaoDoFaltante(chave, produtos)
    return r.ok ? null : r.motivo
  }
  assert.match(motivo(chaveDeTextoLivre('Peseira marsala escrita a mao'))!, /escrito à mão/)
  assert.match(motivo(chaveDaPeca({ produto: 'Produto X', tamanho: 'Queen', cor: 'Areia' }))!, /fora do catálogo/)
  assert.match(motivo(chaveDaPeca({ produto: 'Capa duplicada', tamanho: null, cor: null }))!, /Mais de um produto/)
  assert.match(motivo(chaveDaPeca({ produto: 'Peseira - ACONCHEGO', tamanho: 'Queen', cor: null }))!, /sem cor/)
  assert.match(motivo(chaveDaPeca({ produto: 'Peseira - ACONCHEGO', tamanho: 'King', cor: 'Areia' }))!, /não existe mais/)
})

test('tablet: so recarrega pelo que e da estacao', () => {
  const ctx = {
    estacaoId: 'e1',
    maquinaIds: new Set(['m1', 'm2']),
    opIdsNosCartoes: new Set(['op-card']),
    opIdsContados: new Set(['op-fila', 'op-terminada']),
  }
  const op = (novo: Record<string, unknown> | null, antigo: Record<string, unknown> | null = null) =>
    reacaoDaEstacao({ tabela: 'ordens_producao', novo, antigo }, ctx)
  const maq = (novo: Record<string, unknown> | null, antigo: Record<string, unknown> | null = null) =>
    reacaoDaEstacao({ tabela: 'maquinas', novo, antigo }, ctx)

  // OP de um cartao daqui — inclusive saindo da maquina (o UPDATE nao traz a antiga).
  assert.equal(op({ id: 'op-card', maquina_id: 'm1', status: 'pronto_envio' }), 'tela')
  assert.equal(op({ id: 'op-card', maquina_id: null, status: 'programado' }), 'tela')
  // OP entrando numa maquina daqui.
  assert.equal(op({ id: 'op-x', maquina_id: 'm2', status: 'em_producao' }), 'tela')
  // Saiu da fila pra maquina de OUTRA estacao: so os contadores.
  assert.equal(op({ id: 'op-fila', maquina_id: 'm9', status: 'em_producao' }), 'contadores')
  // OP nova ou mexida na fila (sem maquina) muda a fila de todas.
  assert.equal(op({ id: 'op-nova', maquina_id: null, status: 'programado' }), 'contadores')
  // Exclusao definitiva: so a chave no antigo.
  assert.equal(op({}, { id: 'op-terminada' }), 'contadores')
  // OP de maquina de outra estacao, que nunca foi desta: ignora.
  assert.equal(op({ id: 'op-outra', maquina_id: 'm9', status: 'pronto_envio' }), null)
  assert.equal(op({}, { id: 'op-outra' }), null)

  // Maquina daqui, maquina que entrou aqui, e maquina de outra estacao.
  assert.equal(maq({ id: 'm1', status: 'manutencao', estacao_id: 'e1' }), 'tela')
  assert.equal(maq({ id: 'm1', estacao_id: 'e2' }), 'tela')
  assert.equal(maq({ id: 'm7', estacao_id: 'e1' }), 'tela')
  assert.equal(maq({ id: 'm9', estacao_id: 'e2' }), null)
})

// -----------------------------------------------------------------
// Estoque de fios: resumo por cor, plano de retirada, grade
// (src/lib/fios/saldo.ts)
// -----------------------------------------------------------------

// Lote do jeito que a tela entrega: saldo ja calculado pelo banco.
// Os 51 lotes reais tem TODOS a mesma data de entrada — por isso o padrao
// aqui e a mesma data, que e o caso que o desempate precisa resolver.
function lote(p: Partial<LoteComSaldo> & { id: string }): LoteComSaldo {
  const caixas = p.caixas ?? p.saldoCaixas ?? 10
  const saldoCaixas = p.saldoCaixas ?? caixas
  return {
    id: p.id,
    numeroLote: p.numeroLote ?? null,
    corFornecedorId: p.corFornecedorId ?? 'cf-caqui',
    corId: p.corId ?? 'cor-caqui',
    corNome: p.corNome ?? 'Caqui',
    corHex: p.corHex ?? null,
    corFornecedorNome: p.corFornecedorNome ?? 'Caqui',
    caixas,
    pesoTotalKg: p.pesoTotalKg ?? String(caixas * 32),
    dataEntrada: p.dataEntrada ?? '2025-08-31',
    saldoCaixas,
    saldoPesoKg: p.saldoPesoKg ?? saldoCaixas * 32,
  }
}

test('fios: retirada FIFO cruza duas partidas e sugere o kg de cada lote', () => {
  const lotes = [
    // 25 kg/caixa contra 32: o kg sugerido nao pode ser proporcional ao total.
    lote({ id: 'l1', numeroLote: '1193', saldoCaixas: 2, saldoPesoKg: 50 }),
    lote({ id: 'l2', numeroLote: '4660', saldoCaixas: 5, saldoPesoKg: 160 }),
  ]
  const plano = planoDeRetirada(lotes, 4)

  assert.equal(plano.faltou, 0)
  assert.deepEqual(
    plano.partes.map((p) => [p.numeroLote, p.caixas, p.kgSugerido]),
    [
      ['1193', 2, 50],
      ['4660', 2, 64],
    ],
  )
})

test('fios: pedido maior que o saldo da cor devolve o que faltou', () => {
  const plano = planoDeRetirada(
    [lote({ id: 'l1', numeroLote: '1193', saldoCaixas: 3, saldoPesoKg: 96 })],
    5,
  )
  assert.equal(plano.partes.length, 1)
  assert.equal(plano.partes[0]!.caixas, 3)
  assert.equal(plano.faltou, 2)

  // Lote esgotado nao entra no plano nem vira parte de zero caixa.
  const semSaldo = planoDeRetirada(
    [lote({ id: 'l0', saldoCaixas: 0, saldoPesoKg: 0 })],
    2,
  )
  assert.deepEqual(semSaldo.partes, [])
  assert.equal(semSaldo.faltou, 2)
})

test('fios: lote sem partida vai pro fim e a ordem e sempre a mesma', () => {
  const entrada = [
    lote({ id: 'l-sem', numeroLote: null, saldoCaixas: 9 }),
    lote({ id: 'l-80450', numeroLote: '80450', saldoCaixas: 9 }),
    lote({ id: 'l-1193', numeroLote: '1193', saldoCaixas: 9 }),
    // Mesma partida repetida existe de verdade na planilha (Caqui 4660).
    lote({ id: 'l-4660-b', numeroLote: '4660', saldoCaixas: 9 }),
    lote({ id: 'l-4660-a', numeroLote: '4660', saldoCaixas: 9 }),
  ]
  const ordem = (ls: LoteComSaldo[]) =>
    planoDeRetirada(ls, 45).partes.map((p) => p.loteId)

  // 1193 antes de 4660 antes de 80450 (numerico, nao alfabetico), e o lote
  // sem partida no fim.
  assert.deepEqual(ordem(entrada), [
    'l-1193',
    'l-4660-a',
    'l-4660-b',
    'l-80450',
    'l-sem',
  ])
  // Mesma entrada embaralhada da a MESMA ordem — sem isso o plano mudaria
  // entre duas aberturas do dialogo, porque a data de todos e igual.
  assert.deepEqual(ordem([...entrada].reverse()), ordem(entrada))
})

test('fios: data de entrada vence a partida no FIFO', () => {
  const lotes = [
    lote({
      id: 'novo',
      numeroLote: '1000',
      dataEntrada: '2026-09-01',
      saldoCaixas: 5,
    }),
    lote({
      id: 'velho',
      numeroLote: '9999',
      dataEntrada: '2025-08-31',
      saldoCaixas: 5,
    }),
  ]
  assert.deepEqual(
    planoDeRetirada(lotes, 10).partes.map((p) => p.loteId),
    ['velho', 'novo'],
  )
})

test('fios: os tres estados do minimo, e cor sem minimo nunca acende', () => {
  const lotes = [
    lote({ id: 'a1', corFornecedorId: 'cf-caqui', corFornecedorNome: 'Caqui', saldoCaixas: 3, saldoPesoKg: 96 }),
    lote({ id: 'a2', corFornecedorId: 'cf-caqui', corFornecedorNome: 'Caqui', saldoCaixas: 2, saldoPesoKg: 64 }),
    lote({ id: 'b1', corFornecedorId: 'cf-black', corFornecedorNome: 'Black', saldoCaixas: 0, saldoPesoKg: 0 }),
    lote({ id: 'c1', corFornecedorId: 'cf-cru', corFornecedorNome: 'Cru La', saldoCaixas: 40, saldoPesoKg: 1280 }),
    // Zerada, mas ninguem cadastrou minimo: continua 'ok' e some do topo.
    lote({ id: 'd1', corFornecedorId: 'cf-rosa', corFornecedorNome: 'Rosa Prata', saldoCaixas: 0, saldoPesoKg: 0 }),
  ]
  const minimos = new Map<string, number | null>([
    ['cf-caqui', 10],
    ['cf-black', 5],
    ['cf-cru', 40],
    ['cf-rosa', null],
  ])
  const resumo = resumoPorCor(lotes, minimos)

  assert.deepEqual(
    resumo.map((r) => [r.corFornecedorNome, r.caixas, r.estado]),
    [
      ['Black', 0, 'acabou'],
      ['Caqui', 5, 'abaixo'],
      ['Rosa Prata', 0, 'ok'],
      ['Cru La', 40, 'ok'],
    ],
  )
  // Uma linha por cor, somando os lotes dela — e o minimo junto.
  const caqui = resumo.find((r) => r.corFornecedorId === 'cf-caqui')!
  assert.equal(caqui.lotes, 2)
  assert.equal(caqui.pesoKg, 160)
  assert.equal(caqui.minimoCaixas, 10)
  // No limite nao acende: 40 de minimo 40 e 'ok'.
  assert.equal(resumo.find((r) => r.corFornecedorId === 'cf-cru')!.estado, 'ok')
})

test('fios: o resumo somado bate com o total da grade', () => {
  const lotes = [
    lote({ id: 'a1', corFornecedorId: 'cf-caqui', corFornecedorNome: 'Caqui', caixas: 10, saldoCaixas: 3, saldoPesoKg: 95.55 }),
    lote({ id: 'b1', corFornecedorId: 'cf-black', corFornecedorNome: 'Black', caixas: 8, saldoCaixas: 8, saldoPesoKg: 247.04 }),
    lote({ id: 'b2', corFornecedorId: 'cf-black', corFornecedorNome: 'Black', caixas: 4, saldoCaixas: 0, saldoPesoKg: 0 }),
  ]
  const resumo = resumoPorCor(lotes, new Map())
  const total = totalDaGrade(lotes)

  assert.equal(
    resumo.reduce((s, r) => s + r.caixas, 0),
    total.saldoCaixas,
  )
  assert.equal(
    Math.round(resumo.reduce((s, r) => s + r.pesoKg, 0) * 100) / 100,
    total.saldoPesoKg,
  )
  assert.equal(
    resumo.reduce((s, r) => s + r.lotes, 0),
    total.lotes,
  )
})

test('fios: a grade ordena por cor, partida e id, e o rodape sai das linhas', () => {
  const lotes = [
    lote({ id: 'z', corFornecedorNome: 'Caqui', numeroLote: '80450', caixas: 5, saldoCaixas: 5, saldoPesoKg: 160 }),
    lote({ id: 'y', corFornecedorNome: 'Black', numeroLote: null, caixas: 2, saldoCaixas: 1, saldoPesoKg: 32 }),
    lote({ id: 'x', corFornecedorNome: 'Black', numeroLote: '1193', caixas: 3, saldoCaixas: 3, saldoPesoKg: 96.25 }),
  ]
  assert.deepEqual(
    ordenarParaGrade(lotes).map((l) => l.id),
    ['x', 'y', 'z'],
  )

  const total = totalDaGrade(lotes)
  assert.deepEqual(total, {
    lotes: 3,
    caixas: 10,
    // O que saiu: 10 de entrada menos 9 de saldo.
    retiradaCaixas: 1,
    saldoCaixas: 9,
    saldoPesoKg: 288.25,
  })
})

// -----------------------------------------------------------------
// Vendas: dias em aberto, contas paradas, conferencia
// (src/lib/vendas/conferencia.ts)
// -----------------------------------------------------------------

// Historico do jeito que a consulta entrega: uma linha por (dia, conta).
function hist(
  data: string,
  conta: string,
  quantidade: number,
  faturamento: number | null = null,
): LinhaDoHistorico {
  return { data, conta, quantidade, faturamento }
}

// As quintas anteriores a 2026-09-17 (que e uma quinta).
const QUINTAS = ['2026-09-10', '2026-09-03', '2026-08-27', '2026-08-20']

function quintasDe(conta: string, valores: number[]): LinhaDoHistorico[] {
  return valores.map((v, i) => hist(QUINTAS[i]!, conta, v))
}

test('vendas: so e pendencia depois de 3 dias, e hoje nunca entra', () => {
  // Hoje e 18/09 (sexta); lancados ate 17, e faltam o 16 e o 11.
  const lancados = [
    '2026-09-17',
    '2026-09-15',
    '2026-09-14',
    '2026-09-13',
    '2026-09-12',
    '2026-09-10',
    '2026-09-09',
    '2026-09-08',
  ]
  // O 16 tem 2 dias: ainda e rotina, nao aparece. O 11 tem 7: aparece.
  assert.deepEqual(diasEmAberto(lancados, '2026-09-18'), ['2026-09-11'])

  // Hoje fica de fora mesmo sem lancamento nenhum: o dia ainda nao fechou.
  assert.ok(!diasEmAberto([], '2026-09-18').includes('2026-09-18'))
  // Sem nada lancado, a janela de 10 dias mostra os 7 que passaram da folga.
  assert.equal(diasEmAberto([], '2026-09-18').length, 7)
  assert.equal(diasEmAberto([], '2026-09-18')[0], '2026-09-14')
})

test('vendas: sexta e fim de semana lancados na segunda nao viram pendencia', () => {
  // O ritmo da casa: quarta se lanca na quinta; sexta, sabado e domingo se
  // lancam todos na segunda. Na segunda (21/09), com tudo lancado ate a
  // quinta (17), nada disso pode aparecer como atraso.
  const ateQuinta = [
    '2026-09-17',
    '2026-09-16',
    '2026-09-15',
    '2026-09-14',
    '2026-09-13',
    '2026-09-12',
    '2026-09-11',
    '2026-09-10',
    '2026-09-09',
    '2026-09-08',
  ]
  assert.deepEqual(diasEmAberto(ateQuinta, '2026-09-21'), [])

  // Na terca, a sexta (18) passou de 3 dias e vira pendencia — junto com o
  // fim de semana, que tambem ficou pra tras.
  assert.deepEqual(diasEmAberto(ateQuinta, '2026-09-22'), [
    '2026-09-18',
  ])
  assert.deepEqual(diasEmAberto(ateQuinta, '2026-09-23'), [
    '2026-09-19',
    '2026-09-18',
  ])

  // E a quarta lancada so na quinta continua fora da faixa o tempo todo em
  // que isso e rotina.
  assert.deepEqual(diasEmAberto(ateQuinta, '2026-09-18'), [])
})

test('vendas: conta parada some, mas nao se tiver valor no dia aberto', () => {
  const catalogo = ['ml_1', 'shein_5', 'temu']
  const historico = [
    hist('2026-09-17', 'ml_1', 60),
    hist('2026-09-16', 'ml_1', 55),
    // shein_5 parou em julho — fora da janela de 30 dias.
    hist('2026-07-13', 'shein_5', 4),
    hist('2026-09-08', 'temu', 1),
  ]
  assert.deepEqual(contasParadas(historico, catalogo, '2026-09-17'), [
    'shein_5',
  ])

  // Editando o dia em que a shein_5 TEM valor, ela nao pode sumir: o numero
  // esta gravado ali, e o rodape deixaria de fechar com os campos visiveis.
  assert.deepEqual(contasParadas(historico, catalogo, '2026-07-13'), [
    'ml_1',
    'temu',
  ])
  // Sem historico nenhum, todas param — e o formulario oferece o "mostrar".
  assert.deepEqual(contasParadas([], catalogo, '2026-09-17'), catalogo)
})

test('vendas: referencia e a mediana das ate 4 ultimas do mesmo dia da semana', () => {
  const historico = [
    ...quintasDe('ml_1', [200, 180, 220, 190]),
    // Quinta mais antiga, fora das 4 ultimas: nao entra.
    hist('2026-08-13', 'ml_1', 5000),
    // Outros dias da semana nao entram.
    hist('2026-09-16', 'ml_1', 900),
    hist('2026-09-15', 'ml_1', 950),
  ]
  const ref = referenciaDaConta(historico, 'ml_1', '2026-09-17', 'quantidade')
  assert.equal(ref.amostras, 4)
  assert.equal(ref.mediana, 195)
})

test('vendas: sem 3 valores, ou em conta miuda, a conferencia se cala', () => {
  const duas = referenciaDaConta(
    quintasDe('ml_1', [200, 180]),
    'ml_1',
    '2026-09-17',
    'quantidade',
  )
  assert.equal(duas.amostras, 2)
  assert.equal(foraDoNormal(9999, duas), null)
  assert.equal(foraDoNormal(0, duas), null)

  // Temu: 3 amostras, mediana 1 — abaixo do piso de 10 pecas.
  const temu = referenciaDaConta(
    quintasDe('temu', [1, 1, 2]),
    'temu',
    '2026-09-17',
    'quantidade',
  )
  assert.equal(temu.amostras, 3)
  assert.equal(foraDoNormal(0, temu), null)
  assert.equal(foraDoNormal(30, temu), null)

  // Mesmo piso em reais, mas em outra escala: R$ 900 de mediana nao opina.
  const miudo = { mediana: 900, amostras: 4 }
  assert.equal(foraDoNormal(0, miudo, 'faturamento'), null)
  const gordo = { mediana: 12000, amostras: 4 }
  assert.equal(foraDoNormal(0, gordo, 'faturamento'), 'zerado')
})

test('vendas: 3x pra cima, 1/3 pra baixo, e o zerado', () => {
  const ref = { mediana: 200, amostras: 4 }
  assert.equal(foraDoNormal(2400, ref), 'alto')
  assert.equal(foraDoNormal(600, ref), 'alto')
  assert.equal(foraDoNormal(66, ref), 'baixo')
  assert.equal(foraDoNormal(60, ref), 'baixo')
  // Dentro da faixa: nao opina.
  assert.equal(foraDoNormal(210, ref), null)
  assert.equal(foraDoNormal(599, ref), null)
  assert.equal(foraDoNormal(67, ref), null)
  // Zerado e campo vazio sao a mesma coisa — e o aviso mais util, porque o
  // erro comum e PULAR a conta.
  assert.equal(foraDoNormal(0, ref), 'zerado')
  assert.equal(foraDoNormal(null, ref), 'zerado')
  // Sem referencia, nem zerado avisa: a conta pode nunca ter vendido.
  assert.equal(foraDoNormal(0, { mediana: 0, amostras: 4 }), null)
})

test('vendas: atacado com as duas origens no mesmo dia avisa', () => {
  const com = { quantidade: 3, faturamento: 4200 }
  const semNada = { quantidade: 0, faturamento: null }
  assert.equal(avisoDeAtacadoDuplo(com, { quantidade: 9, faturamento: 16195 }), true)
  assert.equal(avisoDeAtacadoDuplo(com, semNada), false)
  assert.equal(avisoDeAtacadoDuplo(semNada, com), false)
  assert.equal(avisoDeAtacadoDuplo(null, com), false)
  assert.equal(avisoDeAtacadoDuplo(com, null), false)
  // So faturamento, sem quantidade, ja conta como "tem numero".
  assert.equal(
    avisoDeAtacadoDuplo(
      { quantidade: 0, faturamento: 500 },
      { quantidade: 0, faturamento: 16195 },
    ),
    true,
  )
})

// -----------------------------------------------------------------
// Permissoes: a area de PRECO DO CATALOGO
// (src/lib/auth/permissoes.ts)
// -----------------------------------------------------------------

test('permissoes: preco do catalogo nasce so pro admin', () => {
  // O catalogo e aberto de proposito (operador, estoquista e vendas consultam
  // SKU, variacao e peso), mas o preco de ATACADO e a margem da casa: ele sai
  // dessa abertura e passa a ter linha propria em /permissoes.
  const semOverride = {}
  assert.equal(nivelEfetivo('admin', 'precosCatalogo', semOverride), 'total')
  for (const cargo of [
    'gerente_producao',
    'operador',
    'estoquista',
    'vendas',
  ] as const) {
    assert.equal(nivelEfetivo(cargo, 'precosCatalogo', semOverride), 'nenhum')
    // E o cargo continua vendo o catalogo: o que fechou foi o preco.
    assert.notEqual(nivelEfetivo(cargo, 'produtos', semOverride), 'nenhum')
  }
})

test('permissoes: override em permissoes_acesso vence o padrao', () => {
  // E o que a tela de /permissoes promete: o admin libera caso a caso, e o
  // padrao do codigo so vale enquanto ninguem escolheu nada.
  const soVer = {
    [chaveOverride('vendas', 'precosCatalogo')]: 'ver' as const,
  }
  assert.equal(nivelEfetivo('vendas', 'precosCatalogo', soVer), 'ver')
  assert.equal(podeEscrever(nivelEfetivo('vendas', 'precosCatalogo', soVer)), false)

  const total = {
    [chaveOverride('gerente_producao', 'precosCatalogo')]: 'total' as const,
  }
  assert.equal(
    podeEscrever(nivelEfetivo('gerente_producao', 'precosCatalogo', total)),
    true,
  )
  // O override de um cargo nao vaza pros outros.
  assert.equal(nivelEfetivo('vendas', 'precosCatalogo', total), 'nenhum')
  // E o admin nao e afetado nem por override que tente fecha-lo.
  const tentaFechar = {
    [chaveOverride('admin', 'precosCatalogo')]: 'nenhum' as const,
  }
  assert.equal(nivelEfetivo('admin', 'precosCatalogo', tentaFechar), 'total')
})

// -----------------------------------------------------------------
// Catalogo: a guarda da exclusao (src/lib/catalogo-em-uso.ts)
// -----------------------------------------------------------------

test('catalogo: so esta em uso quem tem onde', () => {
  assert.equal(uso('Novo', []).emUso, false)
  assert.equal(uso('King', ['8 variações de 6 produtos']).emUso, true)
})

test('catalogo: o erro diz ONDE esta em uso e oferece a saida', () => {
  const texto = erroDeUso(
    uso('King', ['8 variações de 6 produtos', '5 preços de atacado']),
    'o tamanho',
  )
  // O nome, cada lugar de uso e o caminho alternativo — quem le precisa saber
  // o que vai quebrar antes de insistir.
  assert.match(texto, /"King"/)
  assert.match(texto, /8 variações de 6 produtos/)
  assert.match(texto, /5 preços de atacado/)
  assert.match(texto, /Desative o tamanho/)
})

test('catalogo: no lote, os livres saem e os em uso aparecem na mensagem', () => {
  const rotulo = { um: 'tamanho', muitos: 'tamanhos' }
  // Nenhum bloqueado: a mensagem e so o que saiu.
  assert.equal(mensagemDoLote(2, [], rotulo), '2 tamanhos excluído(s)')

  const bloqueado = uso('King', ['8 variações de 6 produtos'])
  const parcial = mensagemDoLote(1, [bloqueado], rotulo)
  assert.match(parcial, /1 tamanho excluído/)
  assert.match(parcial, /"King" ficaram porque estão em uso/)
  assert.match(parcial, /8 variações de 6 produtos/)

  // Nada saiu: a mensagem nao pode dizer "0 excluidos" e pronto.
  const nenhum = mensagemDoLote(0, [bloqueado, uso('Casal', ['3 pedidos'])], rotulo)
  assert.match(nenhum, /Nenhum excluído/)
  assert.match(nenhum, /"King", "Casal"/)
})

test('catalogo: plural de uma coisa so nao vira "1 variações"', () => {
  assert.equal(plural(1, 'variação', 'variações'), '1 variação')
  assert.equal(plural(2, 'variação', 'variações'), '2 variações')
  assert.equal(plural(0, 'pedido', 'pedidos'), '0 pedidos')
})

// -----------------------------------------------------------------
// Tarefas: o que acende a bolinha e ha quanto tempo esta aberta
// (src/lib/validators/tarefas.ts)
// -----------------------------------------------------------------

test('tarefas: alta marcada a mao NAO acende mais a bolinha', () => {
  const hoje = '2026-09-21'
  // Foi o caso real: 5 tarefas "alta" mantendo o menu aceso por semanas,
  // duas delas vencendo so em 30/09 e 02/10, uma sem prazo nenhum.
  assert.equal(acendeOMenu('alta', null, hoje), null)
  assert.equal(acendeOMenu('alta', '2026-09-30', hoje), null)
  assert.equal(acendeOMenu('alta', '2026-10-02', hoje), null)
  assert.equal(acendeOMenu('normal', null, hoje), null)
  assert.equal(acendeOMenu('baixa', '2026-12-25', hoje), null)

  // Mas o SELO da lista nao mudou: continua dizendo "Alta" onde marcaram.
  assert.equal(prioridadeEfetiva('alta', null, hoje), 'alta')
  assert.equal(prioridadeEfetiva('alta', '2026-09-30', hoje), 'alta')
})

test('tarefas: a bolinha acende por urgente a mao e pela escalada do prazo', () => {
  const hoje = '2026-09-21'
  // Urgente a mao interrompe com ou sem prazo — e a palavra foi escolhida
  // por alguem.
  assert.equal(acendeOMenu('urgente', null, hoje), 'urgente')
  assert.equal(acendeOMenu('urgente', '2026-12-25', hoje), 'urgente')

  // Alta a mao com prazo perto acende — mas pela DATA, nao pela marcacao.
  assert.equal(acendeOMenu('alta', '2026-09-24', hoje), 'alta')
  assert.equal(acendeOMenu('normal', '2026-09-24', hoje), 'alta')

  // Dentro de 2 dias ja e urgente; vencido tambem.
  assert.equal(acendeOMenu('normal', '2026-09-23', hoje), 'urgente')
  assert.equal(acendeOMenu('baixa', '2026-09-20', hoje), 'urgente')
  assert.equal(acendeOMenu('normal', '2026-09-21', hoje), 'urgente')

  // Fora da janela de uma semana, nada.
  assert.equal(acendeOMenu('normal', '2026-09-29', hoje), null)
})

test('tarefas: parada e 21 dias aberta, e 20 nao e', () => {
  const hoje = '2026-09-21'
  const em = (iso: string) => new Date(`${iso}T12:00:00Z`)

  assert.equal(diasAberta(em('2026-09-21'), hoje), 0)
  assert.equal(diasAberta(em('2026-09-20'), hoje), 1)
  assert.equal(diasAberta(em('2026-09-01'), hoje), 20)
  assert.equal(diasAberta(em('2026-08-31'), hoje), 21)
  // A mais velha aberta de verdade: 12/08.
  assert.equal(diasAberta(em('2026-08-12'), hoje), 40)

  assert.equal(estaParada(20), false)
  assert.equal(estaParada(DIAS_PARA_PARADA), true)
  assert.equal(estaParada(21), true)
  assert.equal(estaParada(40), true)

  // Data no futuro (relogio errado) nao vira idade negativa.
  assert.equal(diasAberta(em('2026-09-25'), hoje), 0)
})

// -----------------------------------------------------------------
// Permissoes: o que vai pro banco quando o admin salva
// (planoDeGravacao, src/lib/auth/permissoes.ts)
// -----------------------------------------------------------------

// Areas de mentira, pra o teste nao depender do catalogo de verdade.
const AREAS_FALSAS = [
  {
    key: 'kanban' as const,
    secao: 'Producao',
    label: 'Kanban',
    descricao: '',
    href: '/producao',
    editavel: true,
    nivelPadrao: {
      admin: 'total' as const,
      gerente_producao: 'total' as const,
      operador: 'proprio' as const,
      estoquista: 'nenhum' as const,
      vendas: 'ver' as const,
    },
  },
  {
    key: 'usuarios' as const,
    secao: 'Administracao',
    label: 'Usuarios',
    descricao: '',
    href: '/usuarios',
    // Area travada: ninguem afrouxa em /permissoes.
    editavel: false,
    nivelPadrao: {
      admin: 'total' as const,
      gerente_producao: 'nenhum' as const,
      operador: 'nenhum' as const,
      estoquista: 'nenhum' as const,
      vendas: 'nenhum' as const,
    },
  },
]

test('permissoes: valor igual ao padrao APAGA a linha, diferente grava', () => {
  const plano = planoDeGravacao(
    [
      // igual ao padrao do gerente (total) → sai do banco
      { role: 'gerente_producao', area: 'kanban', nivel: 'total' },
      // diferente do padrao do estoquista (nenhum) → grava
      { role: 'estoquista', area: 'kanban', nivel: 'ver' },
    ],
    AREAS_FALSAS,
  )

  assert.deepEqual(plano.upserts, [
    { role: 'estoquista', area: 'kanban', nivel: 'ver' },
  ])
  assert.deepEqual(plano.remocoes, [
    { role: 'gerente_producao', area: 'kanban' },
  ])
})

test('permissoes: padrao "proprio" conta como total na comparacao', () => {
  // O operador no kanban tem padrao 'proprio' — a tela mostra e salva isso
  // como 'total'. Comparar cru marcaria a celula como alterada pra sempre, e
  // ela voltaria a gravar override em todo salvamento.
  const plano = planoDeGravacao(
    [{ role: 'operador', area: 'kanban', nivel: 'total' }],
    AREAS_FALSAS,
  )
  assert.deepEqual(plano.upserts, [])
  assert.deepEqual(plano.remocoes, [{ role: 'operador', area: 'kanban' }])

  // E 'ver' continua sendo diferente de 'proprio'.
  const outro = planoDeGravacao(
    [{ role: 'operador', area: 'kanban', nivel: 'ver' }],
    AREAS_FALSAS,
  )
  assert.equal(outro.upserts.length, 1)
  assert.deepEqual(outro.remocoes, [])
})

test('permissoes: cargo ou area nao editavel fica FORA dos dois lados', () => {
  const plano = planoDeGravacao(
    [
      // area travada: nem grava nem apaga, mesmo pedindo mudanca
      { role: 'gerente_producao', area: 'usuarios', nivel: 'total' },
      // admin nao e editavel: e sempre total, por regra
      { role: 'admin', area: 'kanban', nivel: 'nenhum' },
      // area que nao existe na lista recebida
      { role: 'vendas', area: 'inventada' as never, nivel: 'total' },
    ],
    AREAS_FALSAS,
  )
  assert.deepEqual(plano.upserts, [])
  assert.deepEqual(plano.remocoes, [])
})

test('permissoes: area desconhecida e a que sumiu do catalogo', () => {
  assert.equal(ehAreaDesconhecida('relatorios', AREAS_FALSAS), true)
  assert.equal(ehAreaDesconhecida('kanban', AREAS_FALSAS), false)
  // Sem lista, vale o catalogo de verdade: 'relatorios' virou aba de Vendas.
  assert.equal(ehAreaDesconhecida('relatorios'), true)
  assert.equal(ehAreaDesconhecida('produtos'), false)
})

// -----------------------------------------------------------------
// Variacoes: buscar e agrupar (src/lib/produtos/variacoes.ts)
// -----------------------------------------------------------------

const VAR = (sku: string, cor: string | null, modelo: string | null, tamanho: string | null) => ({
  skuVariacao: sku,
  cor,
  modelo,
  tamanho,
})

test('variacoes: busca sem acento e sem caixa', () => {
  const caqui = VAR('PES-ACO-CAQ-Q', 'Cáqui', 'ACONCHEGO', 'Queen')

  // O catalogo tem "Caqui" com acento; quem digita rapido escreve sem.
  assert.equal(casaComBusca(caqui, 'caqui'), true)
  assert.equal(casaComBusca(caqui, 'CÁQUI'), true)
  assert.equal(casaComBusca(caqui, 'aconchego'), true)
  assert.equal(casaComBusca(caqui, 'queen'), true)
  assert.equal(casaComBusca(caqui, 'pes-aco'), true)

  // Cada palavra pode cair num campo diferente: e assim que se procura.
  assert.equal(casaComBusca(caqui, 'caqui queen'), true)
  assert.equal(casaComBusca(caqui, 'queen caqui'), true)
  assert.equal(casaComBusca(caqui, 'caqui king'), false)

  // Termo vazio (ou so espaco) e o estado normal da tela: casa com tudo.
  assert.equal(casaComBusca(caqui, ''), true)
  assert.equal(casaComBusca(caqui, '   '), true)
})

test('variacoes: busca que nao acha nada devolve lista vazia', () => {
  const lista = [
    VAR('A', 'Marsala', 'ARAN', 'Casal'),
    VAR('B', 'Preto', 'ARAN', 'King'),
  ]
  assert.deepEqual(lista.filter((v) => casaComBusca(v, 'amarelo')), [])
  // E variacao sem cor/modelo/tamanho nao quebra a busca.
  assert.equal(casaComBusca(VAR('C', null, null, null), 'marsala'), false)
  assert.equal(casaComBusca(VAR('C', null, null, null), 'c'), true)
})

test('variacoes: agrupa por cor e ordena pelo cadastro de tamanhos', () => {
  const ordem = ['Casal', 'Queen', 'King']
  const lista = [
    VAR('1', 'Marsala', 'ARAN', 'King'),
    VAR('2', 'Preto', 'ARAN', 'Casal'),
    VAR('3', 'Marsala', 'ARAN', 'Casal'),
    VAR('4', 'Marsala', 'ARAN', 'Queen'),
  ]
  const grupos = agruparPorCor(lista, ordem)

  // A ordem das CORES e a de aparicao (a do cadastro), nao alfabetica.
  assert.deepEqual(grupos.map((g) => g.cor), ['Marsala', 'Preto'])
  // Dentro da cor, a ordem e a do cadastro de tamanhos — nao alfabetica
  // ("Casal, King, Queen" faria procurar).
  assert.deepEqual(grupos[0]!.itens.map((v) => v.tamanho), [
    'Casal',
    'Queen',
    'King',
  ])
})

test('variacoes: tamanho fora do cadastro vai pro fim, sem sumir', () => {
  const grupos = agruparPorCor(
    [
      VAR('1', 'Cru', 'LINKS', 'Gigante'),
      VAR('2', 'Cru', 'LINKS', 'Casal'),
      VAR('3', 'Cru', 'LINKS', 'Inventado'),
      VAR('4', 'Cru', 'LINKS', null),
    ],
    ['Casal', 'Queen'],
  )
  assert.equal(grupos.length, 1)
  // Casal primeiro; os tres desconhecidos preservam a ordem do cadastro.
  assert.deepEqual(grupos[0]!.itens.map((v) => v.skuVariacao), [
    '2',
    '1',
    '3',
    '4',
  ])
})

test('variacoes: variacao sem cor vira grupo proprio, e o resumo conta certo', () => {
  const lista = [
    VAR('1', 'Marsala', 'ARAN', 'Casal'),
    VAR('2', null, 'ARAN', 'Casal'),
    VAR('3', 'marsala', 'ARAN', 'King'),
  ]
  const grupos = agruparPorCor(lista, ['Casal', 'King'])
  assert.deepEqual(grupos.map((g) => g.cor), ['Marsala', '', 'marsala'])

  // O resumo conta cor sem caixa: "Marsala" e "marsala" sao a mesma cor, e o
  // vazio conta como um grupo.
  assert.equal(resumoDaLista(lista), '3 variações · 2 cores')
  assert.equal(resumoDaLista([VAR('1', 'Preto', null, null)]), '1 variação · 1 cor')
})

// -----------------------------------------------------------------
// Realtime: queda e volta do canal (src/lib/realtime/conexao.ts)
// -----------------------------------------------------------------

test('realtime: a PRIMEIRA conexao nao recarrega nada', () => {
  // A pagina acabou de carregar com dado fresco do servidor; recarregar aqui
  // seria uma segunda ida ao banco por tela aberta, sem nada de novo.
  const t = proximoEstadoDoCanal('inicial', 'SUBSCRIBED')
  assert.equal(t.conectado, true)
  assert.equal(t.recarregar, false)
  assert.equal(t.estado, 'conectado')
})

test('realtime: cair e voltar recarrega UMA vez', () => {
  const caiu = proximoEstadoDoCanal('conectado', 'CHANNEL_ERROR')
  assert.equal(caiu.conectado, false)
  assert.equal(caiu.recarregar, false)
  assert.equal(caiu.estado, 'caido')

  // A volta e o unico momento que recarrega: o que mudou no meio-tempo nao e
  // reenviado pelo Supabase.
  const voltou = proximoEstadoDoCanal(caiu.estado, 'SUBSCRIBED')
  assert.equal(voltou.conectado, true)
  assert.equal(voltou.recarregar, true)

  // E conectado seguido de conectado nao recarrega de novo.
  assert.equal(proximoEstadoDoCanal(voltou.estado, 'SUBSCRIBED').recarregar, false)
})

test('realtime: duas quedas seguidas nao acumulam recarga', () => {
  let estado = proximoEstadoDoCanal('inicial', 'SUBSCRIBED').estado
  for (const status of ['TIMED_OUT', 'CLOSED', 'CHANNEL_ERROR']) {
    const t = proximoEstadoDoCanal(estado, status)
    assert.equal(t.recarregar, false)
    assert.equal(t.conectado, false)
    estado = t.estado
  }
  // Tres quedas, uma volta: uma recarga so.
  assert.equal(proximoEstadoDoCanal(estado, 'SUBSCRIBED').recarregar, true)
})

test('realtime: status do meio do caminho nao muda nada', () => {
  const t = proximoEstadoDoCanal('conectado', 'SUBSCRIBING')
  assert.equal(t.estado, 'conectado')
  assert.equal(t.conectado, true)
  assert.equal(t.recarregar, false)

  const u = proximoEstadoDoCanal('caido', 'SUBSCRIBING')
  assert.equal(u.estado, 'caido')
  assert.equal(u.conectado, false)
})

test('realtime: 1 minuto escondida nao recarrega, 3 minutos sim', () => {
  // Trocar de aba pra ver uma nota e voltar e o caso comum; recarregar ai
  // seria desperdicio em toda alternancia.
  assert.equal(precisaRecarregarAoVoltar(60 * 1000), false)
  assert.equal(precisaRecarregarAoVoltar(MS_ESCONDIDA - 1), false)
  // Dois minutos e o ponto em que o Android ja suspendeu a aba e o socket
  // pode ter morrido sem avisar.
  assert.equal(precisaRecarregarAoVoltar(MS_ESCONDIDA), true)
  assert.equal(precisaRecarregarAoVoltar(3 * 60 * 1000), true)
  assert.equal(precisaRecarregarAoVoltar(0), false)
})

// -----------------------------------------------------------------
// Preco de marketplace: comparacao com o atacado e resumo dos canais
// (src/lib/preco-marketplace.ts)
// -----------------------------------------------------------------

test('marketplace: um centavo abaixo do atacado ja e "abaixo"', () => {
  // O caso real: Manta 3D anunciada a 54,99 contra 59,99 de atacado.
  assert.equal(comparadoAoAtacado(5499, 5999), 'abaixo')
  assert.equal(comparadoAoAtacado(5998, 5999), 'abaixo')
  assert.equal(comparadoAoAtacado(5999, 5999), 'igual')
  assert.equal(comparadoAoAtacado(6000, 5999), 'ok')
  assert.equal(comparadoAoAtacado(14999, 5000), 'ok')
})

test('marketplace: sem atacado cadastrado nao inventa "ok"', () => {
  assert.equal(comparadoAoAtacado(5499, null), null)
  assert.equal(comparadoAoAtacado(5499, undefined), null)
  // E sem anuncio tambem nao ha o que comparar.
  assert.equal(comparadoAoAtacado(null, 5999), null)
  // Zero e um valor, nao "nao tem": anuncio de graca fica abaixo do atacado.
  assert.equal(comparadoAoAtacado(0, 5999), 'abaixo')
})

test('marketplace: cinco canais iguais colapsam num valor so', () => {
  const r = resumoDosCanais({
    mercado_livre: 14999,
    shopee: 14999,
    shein: 14999,
    tiktok: 14999,
    amazon: 14999,
  })
  assert.equal(r.canaisComPreco, 5)
  assert.equal(r.todosIguais, true)
  assert.equal(r.valor, 14999)
})

test('marketplace: quatro iguais e um diferente NAO colapsam', () => {
  const r = resumoDosCanais({
    mercado_livre: 15999,
    shopee: 14999,
    shein: 14999,
    tiktok: 14999,
    amazon: 14999,
  })
  assert.equal(r.canaisComPreco, 5)
  assert.equal(r.todosIguais, false)
  assert.equal(r.valor, null)
})

test('marketplace: canal sem preco nao concorda nem discorda', () => {
  // A Temu esta no catalogo de canais e nao tem UM preco no banco.
  const r = resumoDosCanais({ shopee: 6999, tiktok: 6999, temu: null })
  assert.equal(r.canaisComPreco, 2)
  assert.equal(r.todosIguais, true)
  assert.equal(r.valor, 6999)

  // Linha sem preco nenhum: nao ha o que resumir.
  const vazio = resumoDosCanais({})
  assert.deepEqual(vazio, { canaisComPreco: 0, todosIguais: false, valor: null })
})

// -----------------------------------------------------------------
// Calendario: rotulo do evento Full e duplicata
// (src/lib/producao/prazo-da-remessa.ts)
// -----------------------------------------------------------------

test('calendario: o rotulo diz a conta quando existe', () => {
  assert.equal(rotuloDoEventoFull('full_ml', 'Conta 1'), 'Full ML · Conta 1')
  assert.equal(
    rotuloDoEventoFull('full_shopee', 'Conta 3'),
    'Full Shopee · Conta 3',
  )
  // Evento de julho/2026, de antes de as contas existirem: so o canal.
  assert.equal(rotuloDoEventoFull('full_ml', null), 'Full ML')
  assert.equal(rotuloDoEventoFull('full_shopee', null), 'Full Shopee')
  // Canal desconhecido aparece como veio, em vez de sumir.
  assert.equal(rotuloDoEventoFull('full_amazon', null), 'full_amazon')
  assert.equal(rotuloDoEventoFull('full_amazon', 'Conta X'), 'full_amazon · Conta X')
})

test('calendario: duplicata e mesmo dia E mesmo canal', () => {
  const remessas = [
    { data: '2026-09-25', canal: 'full_ml' },
    { data: '2026-09-28', canal: 'full_shopee' },
  ]
  assert.equal(
    ehEventoDuplicado({ data: '2026-09-25', canal: 'full_ml' }, remessas),
    true,
  )
  // Mesmo dia, canal diferente: sao dois envios.
  assert.equal(
    ehEventoDuplicado({ data: '2026-09-25', canal: 'full_shopee' }, remessas),
    false,
  )
  // Mesmo canal, dia diferente: tambem nao.
  assert.equal(
    ehEventoDuplicado({ data: '2026-09-26', canal: 'full_ml' }, remessas),
    false,
  )
  // Sem remessa no mes, nada e duplicata.
  assert.equal(ehEventoDuplicado({ data: '2026-09-25', canal: 'full_ml' }, []), false)
})

// -----------------------------------------------------------------
// Backup: o sistema vigia se ele esta acontecendo (src/lib/backup.ts)
// -----------------------------------------------------------------

test('backup: sem nenhum registro e "nunca"', () => {
  assert.equal(estadoDoBackup(null, new Date('2026-09-23T12:00:00Z')), 'nunca')
})

test('backup: 47 h depois ainda esta em dia; 49 h ja atrasou', () => {
  const feitoEm = new Date('2026-09-21T12:00:00Z')
  const depoisDe = (h: number) => new Date(feitoEm.getTime() + h * 3_600_000)
  assert.equal(DIAS_BACKUP_ATRASADO, 2)
  assert.equal(
    estadoDoBackup({ feitoEm, copiaDrive: true }, depoisDe(47)),
    'em_dia',
  )
  assert.equal(
    estadoDoBackup({ feitoEm, copiaDrive: true }, depoisDe(49)),
    'atrasado',
  )
})

test('backup: recente mas sem Drive e "sem_drive"', () => {
  const feitoEm = new Date('2026-09-23T12:02:00Z')
  const agora = new Date('2026-09-23T15:00:00Z')
  assert.equal(
    estadoDoBackup({ feitoEm, copiaDrive: false }, agora),
    'sem_drive',
  )
})

test('backup: atrasado E sem Drive e "atrasado" (o pior dos dois)', () => {
  const feitoEm = new Date('2026-09-20T12:00:00Z')
  const agora = new Date('2026-09-23T12:00:00Z')
  assert.equal(
    estadoDoBackup({ feitoEm, copiaDrive: false }, agora),
    'atrasado',
  )
})

test('backup: o "quando" conta dias de Brasilia', () => {
  const agora = new Date('2026-09-23T15:00:00Z') // 12:00 em Brasilia
  const quando = (iso: string) => quandoFoiOBackup(new Date(iso), agora)
  assert.equal(quando('2026-09-23T12:02:00Z'), 'hoje, 09:02')
  assert.equal(quando('2026-09-22T12:02:00Z'), 'ontem, 09:02')
  assert.equal(quando('2026-09-20T12:02:00Z'), '20/09, 09:02')
  // 01h UTC do dia 23 ainda e dia 22 em Brasilia.
  assert.equal(diasDesdeOBackup(new Date('2026-09-23T01:00:00Z'), agora), 1)
  assert.equal(tamanhoDoBackup(1_960_837), '1,87 MB')
})

// -----------------------------------------------------------------
// Catalogo: tamanho por grupo (src/lib/produtos/grupo-de-tamanho.ts)
// -----------------------------------------------------------------

const TAMANHOS_DO_CADASTRO = [
  { nome: 'Casal', grupo: 'casa' },
  { nome: 'King', grupo: 'casa' },
  { nome: '45x45', grupo: 'casa' },
  { nome: 'P', grupo: 'vestuario' },
  { nome: 'M', grupo: 'vestuario' },
  { nome: 'G1', grupo: 'vestuario' },
]
const nomesDe = (ts: { nome: string }[]) => ts.map((t) => t.nome)

test('grupo de tamanho: so os do grupo do produto, na ordem do cadastro', () => {
  assert.deepEqual(
    nomesDe(tamanhosDoGrupo(TAMANHOS_DO_CADASTRO, 'vestuario', [])),
    ['P', 'M', 'G1'],
  )
  assert.deepEqual(
    nomesDe(tamanhosDoGrupo(TAMANHOS_DO_CADASTRO, 'casa', [])),
    ['Casal', 'King', '45x45'],
  )
})

test('grupo de tamanho: o que o produto ja usa aparece mesmo sendo de outro grupo', () => {
  // Produto de casa antigo com uma variacao em "M": o seletor dela nao pode
  // abrir vazio. A comparacao ignora caixa e espaco, como o resto do catalogo.
  assert.deepEqual(
    nomesDe(tamanhosDoGrupo(TAMANHOS_DO_CADASTRO, 'casa', [' m ', null, ''])),
    ['Casal', 'King', '45x45', 'M'],
  )
})

test('grupo de tamanho: grupo sem tamanho nenhum da lista vazia (ou so os ja usados)', () => {
  const soCasa = TAMANHOS_DO_CADASTRO.filter((t) => t.grupo === 'casa')
  assert.deepEqual(tamanhosDoGrupo(soCasa, 'vestuario', []), [])
  assert.deepEqual(nomesDe(tamanhosDoGrupo(soCasa, 'vestuario', ['King'])), ['King'])
})

// -----------------------------------------------------------------
// Catalogo: produto de parceiro nao vira OP (src/lib/produtos/origem.ts)
// -----------------------------------------------------------------

test('origem: produto produzido passa; de parceiro e recusado dizendo qual', () => {
  assert.equal(erroDeOrigemParaOp([{ nome: 'Peseira LINKS', origem: 'producao' }]), null)
  assert.equal(erroDeOrigemParaOp([]), null)
  assert.equal(
    erroDeOrigemParaOp([{ nome: 'SUETER', origem: 'parceiro' }]),
    '"SUETER" é comprado de parceiro — não vira OP.',
  )
  // Kit: diz QUAL componente e nao repete o mesmo produto.
  assert.equal(
    erroDeOrigemParaOp([
      { nome: 'Peseira LINKS', origem: 'producao' },
      { nome: 'SUETER', origem: 'parceiro' },
      { nome: 'SUETER', origem: 'parceiro' },
    ]),
    '"SUETER" é comprado de parceiro — não vira OP.',
  )
  assert.equal(
    erroDeOrigemParaOp([
      { nome: 'SUETER', origem: 'parceiro' },
      { nome: 'CARDIGA', origem: 'parceiro' },
    ]),
    '"SUETER", "CARDIGA" são comprados de parceiro — não viram OP.',
  )
})

// -----------------------------------------------------------------
// Catalogo: renomear tamanho em uso (src/lib/catalogo-em-uso.ts)
// -----------------------------------------------------------------

test('origem: faltante de produto de parceiro e achado e recusado pelo nome certo', () => {
  const sueter = {
    id: 'p-sueter',
    nome: 'SUETER',
    origem: 'parceiro',
    variacoes: [{ id: 'v1', cor: 'Preto', tamanho: 'M' }],
  }
  const r = resolverVariacaoDoFaltante('sueter|m|preto', [sueter])
  // Nao "fora do catalogo": o produto esta la, so nao vira OP.
  assert.equal(r.ok, false)
  assert.match(!r.ok ? r.motivo : '', /parceiro/)
  // O mesmo produto como producao resolve normalmente.
  assert.deepEqual(
    resolverVariacaoDoFaltante('sueter|m|preto', [{ ...sueter, origem: 'producao' }]),
    { ok: true, produtoId: 'p-sueter', variacaoId: 'v1' },
  )
})

test('renomear tamanho: em uso e recusado, dizendo onde', () => {
  const emUso = uso('King', ['8 variações de 6 produtos', '2 preços de kit'])
  const erro = erroAoRenomearTamanho('King', 'Super King', emUso)
  assert.ok(erro)
  assert.match(erro, /"King" não pode ser renomeado/)
  assert.match(erro, /8 variações de 6 produtos, 2 preços de kit/)
  // So a caixa tambem e renomear: a variacao guarda o texto exato.
  assert.ok(erroAoRenomearTamanho('king', 'King', uso('king', ['1 pedido'])))
})

test('renomear tamanho: sem uso, ou sem mudar o nome, passa', () => {
  assert.equal(erroAoRenomearTamanho('XG', 'EXG', uso('XG', [])), null)
  // Mexer so em codigo/peso: o nome chega igual (espaco nas pontas nao conta).
  assert.equal(
    erroAoRenomearTamanho('King', ' King ', uso('King', ['8 variações de 6 produtos'])),
    null,
  )
})

// -----------------------------------------------------------------
// Reposicao de produto de parceiro (src/lib/producao/reposicao.ts)
// -----------------------------------------------------------------

test('reposicao de parceiro: aberto -> pedido_parceiro -> reposto', () => {
  assert.equal(acaoDaReposicao('parceiro'), 'pedir_parceiro')
  assert.equal(acaoDaReposicao('producao'), 'produzir')

  assert.equal(proximoEstadoDoParceiro('aberto', 'pedir'), 'pedido_parceiro')
  assert.equal(proximoEstadoDoParceiro('pedido_parceiro', 'chegou'), 'reposto')

  // Passos fora de ordem nao valem: pedir de novo, "chegou" sem pedido,
  // ou mexer num item que ja tem OP.
  assert.equal(proximoEstadoDoParceiro('pedido_parceiro', 'pedir'), null)
  assert.equal(proximoEstadoDoParceiro('aberto', 'chegou'), null)
  assert.equal(proximoEstadoDoParceiro('em_producao', 'pedir'), null)
  assert.equal(proximoEstadoDoParceiro('reposto', 'chegou'), null)
})

test('reposicao de parceiro: pedido_parceiro ocupa a fila como em_producao', () => {
  // Mesmo predicado do indice unico de "um item ativo por variacao" (59).
  assert.deepEqual(
    [...ESTADOS_ATIVOS_DE_REPOSICAO],
    ['aberto', 'em_producao', 'pedido_parceiro'],
  )
})

// -----------------------------------------------------------------
// A linha do Trello (src/lib/producao/rotulo-da-op.ts, `linhaDaOp`)
// -----------------------------------------------------------------

const peseiraLinks = {
  codigo: '059',
  produtoNome: 'Peseira - LINKS',
  tamanho: 'Queen',
  cor: 'Areia',
  quantidade: 55,
  tamanhoUnico: false,
}

test('linha da OP: com codigo, na ordem do Trello', () => {
  const l = linhaDaOp(peseiraLinks)
  assert.equal(l.texto, '059 - Peseira LINKS - QUEEN - AREIA - 55')
  assert.equal(l.codigo, '059')
  assert.equal(l.semCodigo, 'Peseira LINKS - QUEEN - AREIA - 55')
  // Sem codigo e sem quantidade: o que vai ao lado do codigo no cartao.
  assert.equal(l.descricao, 'Peseira LINKS - QUEEN - AREIA')
})

test('linha da OP: o " - " de DENTRO do nome vira espaco (so na tela)', () => {
  // O caso do print: cinco pedacos onde o Trello tem quatro.
  const aran = {
    codigo: '085',
    produtoNome: 'Peseira - ARAN',
    tamanho: 'Queen',
    cor: 'Azul Marinho',
    quantidade: 30,
    tamanhoUnico: false,
  }
  const l = linhaDaOp(aran)
  assert.equal(l.descricao, 'Peseira ARAN - QUEEN - AZUL MARINHO')
  assert.equal(l.texto, '085 - Peseira ARAN - QUEEN - AZUL MARINHO - 30')
  assert.equal(l.produto, 'Peseira ARAN')
  // O nome gravado nao muda.
  assert.equal(aran.produtoNome, 'Peseira - ARAN')
  // Traco cercado de espaco sai (qualquer um dos tres); hifen de palavra fica.
  assert.equal(nomeParaLinha('Capa de Almofada Baguete – ARAN'), 'Capa de Almofada Baguete ARAN')
  assert.equal(nomeParaLinha('Manta - SIENA'), 'Manta SIENA')
  assert.equal(nomeParaLinha('Peseira Semi-Nova'), 'Peseira Semi-Nova')
})

test('linha da OP: SEM codigo nao mostra "null" nem traco sobrando', () => {
  for (const codigo of [null, '', '   ']) {
    const l = linhaDaOp({ ...peseiraLinks, codigo })
    assert.equal(l.codigo, null)
    assert.equal(l.texto, 'Peseira LINKS - QUEEN - AREIA - 55')
    assert.doesNotMatch(l.texto, /null|^ ?-/)
  }
})

test('linha da OP: produto de tamanho unico omite o tamanho', () => {
  const capa = {
    ...peseiraLinks,
    produtoNome: 'Capa de Almofada - LINKS',
    tamanho: '45x45',
    quantidade: 110,
    tamanhoUnico: true,
  }
  assert.equal(linhaDaOp(capa).texto, '059 - Capa de Almofada LINKS - AREIA - 110')
  assert.equal(linhaDaOp(capa).tamanho, null)
  // Sem tamanho gravado e sem cor: tambem nao sobra traco.
  assert.equal(
    linhaDaOp({ ...capa, cor: null, tamanhoUnico: false, tamanho: null }).texto,
    '059 - Capa de Almofada LINKS - 110',
  )
})

test('linha da OP: maiusculas em tamanho e cor sem mudar o que esta gravado', () => {
  const op = { ...peseiraLinks, tamanho: ' king ', cor: 'Verde Musgo' }
  const l = linhaDaOp(op)
  assert.equal(l.tamanho, 'KING')
  assert.equal(l.cor, 'VERDE MUSGO')
  // O objeto de entrada (o que veio do banco) continua como estava.
  assert.equal(op.tamanho, ' king ')
  assert.equal(op.cor, 'Verde Musgo')
  // O nome do produto NAO vira maiusculo: so tamanho e cor, como no Trello.
  assert.equal(l.produto, 'Peseira LINKS')
})

// -----------------------------------------------------------------
// Pra onde vai a OP (src/lib/producao/prazo-da-remessa.ts, `rotuloDoDestino`)
// -----------------------------------------------------------------

test('destino da OP: remessa Full usa o mesmo texto da pasta do kanban', () => {
  const remessa = { canal: 'full_ml', dataEnvio: '2026-09-24' }
  assert.equal(rotuloDoDestino({ canal: 'full_ml', remessa }), 'Full ML · 24/09')
  assert.equal(
    rotuloDoDestino({ canal: 'full_ml', remessa }),
    rotuloDaRemessa(remessa.canal, remessa.dataEnvio),
  )
  assert.equal(
    rotuloDoDestino({
      canal: 'full_shopee',
      remessa: { canal: 'full_shopee', dataEnvio: '2026-10-02' },
    }),
    'Full Shopee · 02/10',
  )
})

test('destino da OP: pedido, venda direta, estoque, e nunca vazio', () => {
  assert.equal(rotuloDoDestino({ canal: 'venda_direta', pedidoNumero: 142 }), 'Pedido #142')
  assert.equal(rotuloDoDestino({ canal: 'venda_direta', pedidoNumero: null }), 'Venda direta')
  assert.equal(rotuloDoDestino({ canal: 'estoque' }), 'Estoque')
  // Full sem remessa (OP antiga): o canal, sem data inventada.
  assert.equal(rotuloDoDestino({ canal: 'full_ml', remessa: null }), 'Full ML')
  // Canal desconhecido aparece cru; vazio vira texto, nunca ''.
  assert.equal(rotuloDoDestino({ canal: 'full_amazon' }), 'full_amazon')
  assert.equal(rotuloDoDestino({ canal: '' }), 'Sem destino')
})

// -----------------------------------------------------------------
// Devolver a OP a fila — "Peguei errado" (transicoes-da-op.ts)
// -----------------------------------------------------------------

test('devolver: so a OP em producao volta pra fila', () => {
  assert.equal(erroDaDevolucao('em_producao'), null)
  for (const s of [
    'aguardando_materia_prima',
    'programado',
    'acabamento',
    'embalagem',
    'pronto_envio',
    'enviado',
    'cancelado',
  ] as const) {
    assert.equal(erroDaDevolucao(s), 'Só a OP em produção volta pra fila', s)
  }
})

test('devolver: desfaz EXATAMENTE o Iniciar — status, maquina, responsavel e data', () => {
  assert.deepEqual(OP_DEVOLVIDA, {
    status: 'programado',
    maquinaId: null,
    responsavelId: null,
    // A data TEM que sair: o Iniciar so grava quando esta vazia, e o
    // proximo herdaria o inicio falso.
    dataRealInicio: null,
  })
  // Remessa e prazo NAO estao no que volta a vazio: a OP continua indo pro
  // mesmo lugar.
  assert.equal('remessaFullId' in OP_DEVOLVIDA, false)
  assert.equal('dataPrevistaFim' in OP_DEVOLVIDA, false)
  // E a OP devolvida volta a poder ser excluida (nao produziu nada), a menos
  // que tenha apontamento.
  assert.equal(
    erroDaExclusao({ status: OP_DEVOLVIDA.status, dataRealInicio: null, temApontamento: false }),
    null,
  )
  assert.notEqual(
    erroDaExclusao({ status: OP_DEVOLVIDA.status, dataRealInicio: null, temApontamento: true }),
    null,
  )
})

// -----------------------------------------------------------------
// Full: conta no rotulo e OP sempre dentro de remessa (prazo-da-remessa.ts)
// -----------------------------------------------------------------

test('conta no rotulo: a palavra do canal sai quando repete o "Full …"', () => {
  assert.equal(nomeDaContaNoRotulo('full_shopee', 'Conta 5 Shopee'), 'Conta 5')
  assert.equal(nomeDaContaNoRotulo('full_ml', 'Conta 1 ML'), 'Conta 1')
  assert.equal(nomeDaContaNoRotulo('full_ml', 'Conta 2 Mercado Livre'), 'Conta 2')
  // Sem caixa: "shopee" tambem sai.
  assert.equal(nomeDaContaNoRotulo('full_shopee', 'Conta 6 shopee'), 'Conta 6')
  // Nome sem a palavra fica como esta.
  assert.equal(nomeDaContaNoRotulo('full_shopee', 'Loja Vanvest'), 'Loja Vanvest')
  // Palavra INTEIRA: "Mlk" nao perde o "Ml"; e a palavra de OUTRO canal fica.
  assert.equal(nomeDaContaNoRotulo('full_ml', 'Mlk Casa'), 'Mlk Casa')
  assert.equal(nomeDaContaNoRotulo('full_ml', 'Conta 5 Shopee'), 'Conta 5 Shopee')
  // Se sobrasse vazio, repete em vez de sumir com a conta.
  assert.equal(nomeDaContaNoRotulo('full_shopee', 'Shopee'), 'Shopee')
})

test('rotulo da remessa: canal · conta · data do ENVIO', () => {
  assert.equal(
    rotuloDaRemessa('full_shopee', '2026-09-30', 'Conta 5 Shopee'),
    'Full Shopee · Conta 5 · 30/09',
  )
  assert.equal(rotuloDaRemessa('full_ml', '2026-09-30', 'Conta 1 ML'), 'Full ML · Conta 1 · 30/09')
  // Sem conta (remessa antiga): so canal e data, sem ponto sobrando.
  assert.equal(rotuloDaRemessa('full_shopee', '2026-09-30', null), 'Full Shopee · 30/09')
  assert.equal(rotuloDaRemessa('full_shopee', '2026-09-30', '  '), 'Full Shopee · 30/09')
  // O calendario fala igual, so sem a data.
  assert.equal(rotuloDoEventoFull('full_shopee', 'Conta 5 Shopee'), 'Full Shopee · Conta 5')
  // E o destino do tablet tambem.
  assert.equal(
    rotuloDoDestino({
      canal: 'full_shopee',
      remessa: { canal: 'full_shopee', dataEnvio: '2026-09-30', contaNome: 'Conta 5 Shopee' },
    }),
    'Full Shopee · Conta 5 · 30/09',
  )
})

test('Full sempre dentro de remessa, e do mesmo canal', () => {
  assert.match(erroDaRemessaDaOp('full_shopee', null) ?? '', /precisa de uma remessa/)
  assert.equal(erroDaRemessaDaOp('full_shopee', { canal: 'full_ml' }), 'A remessa é de outro canal')
  assert.equal(erroDaRemessaDaOp('full_shopee', { canal: 'full_shopee' }), null)
  assert.equal(erroDaRemessaDaOp('full_ml', { canal: 'full_ml' }), null)
  // Fora do Full, sem remessa e pronto.
  assert.equal(erroDaRemessaDaOp('estoque', null), null)
  assert.equal(erroDaRemessaDaOp('venda_direta', null), null)
  assert.equal(erroDaRemessaDaOp('estoque', { canal: 'full_ml' }), 'Só OP de Full vai numa remessa')
})
