// O ESTADO DA MÁQUINA NA TELA DO OPERADOR — regra pura, sem banco.
//
// A tela da estação é uma lista de MÁQUINAS, não de OPs: um cartão por
// máquina, sempre na mesma posição. Isso só funciona se "em que pé está esta
// máquina" tiver uma resposta só, e é esta.
//
// ─────────────────────────────────────────────────────────────────────────
// OCUPADA NÃO SAI DE `maquinas.status` — SAI DA OP
// ─────────────────────────────────────────────────────────────────────────
//
// `maquinas.status` tem 'operando', mas ele é CADASTRO: alguém marca na tela
// de /maquinas e ninguém desmarca. Hoje, em produção, as 18 máquinas vivas
// estão todas em 'operando' — inclusive as 17 que não têm OP nenhuma. Ler
// 'operando' como "está produzindo" mostraria a estação inteira ocupada com
// uma OP só rodando.
//
// Quem responde "está produzindo?" é a OP: existe ordem em `em_producao`
// nesta máquina? Essa é a mesma verdade que o banco já defende com o índice
// único `ordens_producao_maquina_em_producao_uidx` (migration 50), que
// garante NO MÁXIMO UMA — então "a OP da máquina" é sempre singular, e o
// cartão nunca tem duas.
//
// ⚠️ E OCUPADA VENCE INDISPONÍVEL, nesta ordem e não na outra. Máquina
// rodando uma OP mas marcada 'manutencao' no cadastro mostra a OP. Esconder
// o trabalho real por causa de um cadastro desatualizado seria mentir pra
// quem está de pé na frente dela.
//
// ─────────────────────────────────────────────────────────────────────────
// LIVRE x INDISPONÍVEL
// ─────────────────────────────────────────────────────────────────────────
//
// Livre convida ao toque ("Iniciar produção"); indisponível não oferece botão
// nenhum, porque a máquina não pode receber OP. São visualmente diferentes de
// propósito: um cartão apagado sem botão responde "não é aqui" sozinho, sem o
// operador descobrir clicando e levando erro.
//
// ⚠️ E ISSO NÃO É SÓ DESENHO: `validarMaquinaParaOrdem` (ordens/actions.ts)
// recusa a mesma coisa no servidor, lendo `motivoDeImpedimento` daqui. A
// regra é UMA. Enquanto ela existia só na tela, esconder o botão era tudo
// que separava uma OP de entrar numa máquina desmontada — bastava a chamada
// vir de outro lugar (o kanban do gerente chama a mesma action) pra passar.
//
// ⚠️ HOJE 'indisponivel' NÃO APARECE PRA NINGUÉM, e isso não é bug: nenhuma
// máquina do banco está em 'manutencao' nem 'desativada'. O estado passa a
// valer no dia em que alguém marcar isso em /maquinas (a tela já tem o botão
// — `maquinas-grid.tsx`). 'parada' e 'setup' contam como LIVRE: são estados
// momentâneos de uma máquina que pode receber trabalho agora.

import type { maquinaStatusValues } from '@/lib/validators/maquinas'

export type MaquinaStatus = (typeof maquinaStatusValues)[number]

export type EstadoMaquina = 'ocupada' | 'livre' | 'indisponivel'

// Os únicos status que IMPEDEM a máquina de receber OP, cada um já com a
// frase que explica o porquê. Mapa explícito, e não a negação de 'operando':
// assim um status novo no enum entra como LIVRE (o padrão seguro, que só
// mostra um botão a mais) em vez de sumir da estação sem ninguém perceber.
//
// ⚠️ A LISTA E A FRASE SÃO O MESMO OBJETO de propósito. Enquanto eram duas
// coisas — um Set aqui, uma mensagem lá na action — dava pra acrescentar um
// status ao Set e esquecer o texto, e o operador levava um erro em branco.
// Agora não existe status impeditivo sem motivo escrito.
const MOTIVO_DE_IMPEDIMENTO = {
  manutencao: 'está em manutenção',
  desativada: 'está desativada',
} as const satisfies Partial<Record<MaquinaStatus, string>>

type StatusQueImpede = keyof typeof MOTIVO_DE_IMPEDIMENTO

function impedeTrabalho(status: MaquinaStatus): status is StatusQueImpede {
  return status in MOTIVO_DE_IMPEDIMENTO
}

/**
 * Por que esta máquina não pode receber OP, ou null se pode. A frase é
 * complemento de "A máquina TC-03 ___" — o servidor usa pra recusar e a
 * tela, pra explicar, sem que as duas possam divergir.
 */
export function motivoDeImpedimento(status: MaquinaStatus): string | null {
  return impedeTrabalho(status) ? MOTIVO_DE_IMPEDIMENTO[status] : null
}

export function estadoDaMaquina(
  status: MaquinaStatus,
  temOpEmProducao: boolean,
): EstadoMaquina {
  if (temOpEmProducao) return 'ocupada'
  if (impedeTrabalho(status)) return 'indisponivel'
  return 'livre'
}
