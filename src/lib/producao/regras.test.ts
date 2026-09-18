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
import { chaveDaPeca, chaveDeTextoLivre } from '../separacao.ts'
import {
  estadoDaReposicaoPelaOp,
  ordenarFila,
  podeSubirSituacao,
} from './reposicao.ts'
import { destinoDaOrdem } from './destino-da-ordem.ts'
import {
  erroDaExclusao,
  erroDaTransicaoGenerica,
  erroDaTransicaoPeloFormulario,
  erroDoCancelamento,
  podeConcluirProducao,
} from './transicoes-da-op.ts'
import { buscarVariacoes, erroDaVariacao } from './catalogo-op.ts'
import {
  FOLGA_DIAS_PRODUCAO,
  avisoDoProducaoAte,
  erroDoProducaoAte,
  prazoDaOp,
  producaoAteEfetivo,
  producaoAtePadrao,
  riscoDaRemessa,
  rotuloDaRemessa,
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
  agruparPorModelo,
  destaqueDaVariacao,
  familiaDoProduto,
  prazoEmPalavras,
  SEM_MODELO,
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

test('agrupa por modelo SEM reordenar', () => {
  // A lista chega ordenada por prioridade/prazo; o grupo entra na posicao da
  // primeira OP dele, entao a urgencia decide a ordem dos grupos tambem.
  const fila = [
    { id: 'a', variacaoModelo: 'ACONCHEGO' },
    { id: 'b', variacaoModelo: 'RELEVO' },
    { id: 'c', variacaoModelo: 'SIENA' },
    { id: 'd', variacaoModelo: 'RELEVO' },
    { id: 'e', variacaoModelo: 'RELEVO' },
  ]
  const g = agruparPorModelo(fila)
  assert.deepEqual(
    g.map((x) => [x.modelo, x.ops.map((o) => o.id)]),
    [
      ['ACONCHEGO', ['a']],
      ['RELEVO', ['b', 'd', 'e']],
      ['SIENA', ['c']],
    ],
  )
})

test('sem modelo vira um grupo proprio, nao some', () => {
  const g = agruparPorModelo([
    { id: 'a', variacaoModelo: null },
    { id: 'b', variacaoModelo: 'RELEVO' },
  ])
  assert.deepEqual(g.map((x) => x.modelo), [SEM_MODELO, 'RELEVO'])
})

test('fila vazia nao vira grupo vazio', () => {
  assert.deepEqual(agruparPorModelo([]), [])
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
