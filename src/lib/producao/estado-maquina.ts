// A SITUAÇÃO DE UMA MÁQUINA — regra pura, sem banco.
//
// Quatro telas perguntam "em que pé está esta máquina?" e precisam da MESMA
// resposta: a aba Máquinas (/fabrica), a tela do operador, o seletor de
// máquina do kanban e a validação de servidor que autoriza iniciar uma OP.
// Enquanto cada uma respondia por conta própria, a aba dizia "Operando" nas
// 18 máquinas com a fábrica parada, e o kanban oferecia máquina que o
// servidor recusava.
//
// ─────────────────────────────────────────────────────────────────────────
// SÃO DOIS EIXOS, E COLAPSÁ-LOS PERDE INFORMAÇÃO
// ─────────────────────────────────────────────────────────────────────────
//
//   OCUPAÇÃO       — existe OP em produção nesta máquina? Sai da OP.
//   DISPONIBILIDADE — ela está apta a produzir, ou impedida? Sai do cadastro.
//
// ⚠️ Os dois são INDEPENDENTES, e a versão anterior deste arquivo escolhia um
// vencedor ("ocupada vence indisponível"), o que escondia a manutenção de uma
// máquina que tinha trabalho dentro. O caso que quebra o colapso é justamente
// esse: máquina EM MANUTENÇÃO COM OP PARADA DENTRO. Quem olha precisa ver as
// duas coisas — que ela está parada por manutenção, e que tem trabalho preso
// ali. Mostrar só uma delas manda a pessoa tomar a decisão errada.
//
// ─────────────────────────────────────────────────────────────────────────
// OCUPAÇÃO NÃO SAI DE `maquinas.status`
// ─────────────────────────────────────────────────────────────────────────
//
// `maquinas.status` é CADASTRO: alguém marca numa tela e ninguém desmarca.
// Hoje, em produção, as 18 máquinas vivas estão TODAS em 'operando' — e há
// ZERO OPs em produção. Ler 'operando' como "está produzindo" é exatamente o
// que fazia a aba inteira mentir.
//
// Quem responde "está produzindo?" é a OP: existe ordem em `em_producao`
// nesta máquina? É a mesma verdade que o banco já defende com o índice único
// `ordens_producao_maquina_em_producao_uidx` (migration 50), que garante NO
// MÁXIMO UMA — então "a OP da máquina" é sempre singular.
//
// ⚠️ 'operando' PASSOU A SIGNIFICAR SÓ "APTA A PRODUZIR". Ele continua no
// enum e nas 18 linhas do banco (nada de migration pra renomear valor em
// sistema em produção), mas nenhuma tela o exibe: o rótulo é DERIVADO. E
// ninguém mais escolhe 'operando' num select — o botão da aba se chama
// "Ativar", que é o que ele de fato declara.
//
// ─────────────────────────────────────────────────────────────────────────
// O QUE IMPEDE PRODUZIR
// ─────────────────────────────────────────────────────────────────────────
//
// `manutencao` e `desativada` impedem, e agora `setup` também: setup é troca
// de configuração da máquina, e começar outra OP no meio disso é o tipo de
// coisa que só se descobre depois. A diferença entre eles é de DURAÇÃO, e é
// por isso que têm rótulos e cores diferentes — setup passa em minutos,
// manutenção em horas, desativada é decisão.
//
// ⚠️ A LISTA DE IMPEDIMENTOS E AS FRASES SÃO O MESMO OBJETO de propósito.
// Enquanto eram duas coisas — um Set aqui e a mensagem lá na action — dava
// pra acrescentar um status e esquecer o texto, e o operador levava um erro
// em branco.

import type { maquinaStatusValues } from '@/lib/validators/maquinas'

export type MaquinaStatus = (typeof maquinaStatusValues)[number]

/** Tem OP em produção? Vem da OP, nunca do cadastro. */
export type Ocupacao = 'com_op' | 'livre'

/** Pode produzir? Vem do cadastro. */
export type Disponibilidade = 'apta' | 'em_setup' | 'manutencao' | 'desativada'

export type SituacaoDaMaquina = {
  ocupacao: Ocupacao
  disponibilidade: Disponibilidade
  /**
   * A máquina pode receber uma OP NOVA agora?
   *
   * Exige as duas coisas: apta E livre. A segunda o banco já garante pelo
   * índice único, mas a tela precisa saber pra não oferecer um botão que só
   * devolve erro.
   */
  aceitaNovaOp: boolean
  /**
   * A manchete do cartão. NÃO inclui a OP: quando há uma, a tela mostra os
   * dados dela embaixo, e é isso que faz manutenção e trabalho preso
   * aparecerem juntos em vez de um esconder o outro.
   */
  rotulo: string
  /** Chave de cor — a tela decide o tom exato, a regra decide qual é. */
  tom: 'producao' | 'livre' | 'atencao' | 'inativa'
}

// Os status que IMPEDEM produzir, cada um com a frase que explica. Mapa, e
// não lista: não existe impedimento sem motivo escrito.
const MOTIVO_DE_IMPEDIMENTO = {
  em_setup: 'está em setup',
  manutencao: 'está em manutenção',
  desativada: 'está desativada',
} as const satisfies Partial<Record<Disponibilidade, string>>

type DisponibilidadeQueImpede = keyof typeof MOTIVO_DE_IMPEDIMENTO

function impede(d: Disponibilidade): d is DisponibilidadeQueImpede {
  return d in MOTIVO_DE_IMPEDIMENTO
}

/**
 * O cadastro vira disponibilidade.
 *
 * ⚠️ `switch` sem `default` e com guarda `never`: acrescentar um valor ao
 * enum `maquina_status` QUEBRA O BUILD aqui até alguém decidir se ele impede
 * ou não. O padrão seguro nunca é inferido — é escrito.
 */
export function disponibilidadeDe(status: MaquinaStatus): Disponibilidade {
  switch (status) {
    // Os dois significam "apta". 'parada' não aparece hoje em nenhuma
    // máquina e sobrevive por ser valor histórico do enum.
    case 'operando':
    case 'parada':
      return 'apta'
    case 'setup':
      return 'em_setup'
    case 'manutencao':
      return 'manutencao'
    case 'desativada':
      return 'desativada'
    default: {
      const nunca: never = status
      throw new Error(`Status de máquina sem disponibilidade: ${String(nunca)}`)
    }
  }
}

/**
 * Por que esta máquina não pode receber OP, ou null se pode. A frase é
 * complemento de "A máquina TC-03 ___" — o servidor recusa com ela e a tela
 * explica com ela, sem que as duas possam divergir.
 */
export function motivoDeImpedimento(status: MaquinaStatus): string | null {
  const d = disponibilidadeDe(status)
  return impede(d) ? MOTIVO_DE_IMPEDIMENTO[d] : null
}

const ROTULO: Record<Disponibilidade, string> = {
  apta: 'Livre',
  em_setup: 'Em setup',
  manutencao: 'Em manutenção',
  desativada: 'Desativada',
}

const TOM: Record<Disponibilidade, SituacaoDaMaquina['tom']> = {
  apta: 'livre',
  em_setup: 'atencao',
  manutencao: 'atencao',
  desativada: 'inativa',
}

export function situacaoDaMaquina(
  status: MaquinaStatus,
  temOpEmProducao: boolean,
): SituacaoDaMaquina {
  const disponibilidade = disponibilidadeDe(status)
  const ocupacao: Ocupacao = temOpEmProducao ? 'com_op' : 'livre'

  // APTA + COM OP é o único caso em que a ocupação vira manchete. Nos
  // demais, a manchete é o impedimento — e a OP, quando existe, aparece
  // embaixo pela tela. É o que faz "em manutenção com trabalho preso dentro"
  // ser legível numa linha só.
  const ehProducao = disponibilidade === 'apta' && ocupacao === 'com_op'

  return {
    ocupacao,
    disponibilidade,
    aceitaNovaOp: disponibilidade === 'apta' && ocupacao === 'livre',
    rotulo: ehProducao ? 'Em produção' : ROTULO[disponibilidade],
    tom: ehProducao ? 'producao' : TOM[disponibilidade],
  }
}
