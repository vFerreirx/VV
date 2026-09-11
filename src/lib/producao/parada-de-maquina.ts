// A PARADA DE MÁQUINA — regra pura, sem banco.
//
// Uma parada é um INTERVALO: abriu quando a máquina ficou impedida, fechou
// quando voltou. Quem abre e fecha é sempre a troca de status
// (`trocarStatusAction`), nunca um botão separado — o porquê está no topo de
// supabase/sql/57_maquina_paradas.sql, e o resumo é: se desse pra abrir
// parada por um caminho e mudar o status por outro, a máquina apareceria
// "Livre" no cartão com uma parada correndo há três dias no histórico.
//
// ⚠️ QUEM DECIDE SE ABRE É `estado-maquina.ts`, NÃO UMA LISTA DAQUI. Os
// status que abrem parada são exatamente os que IMPEDEM produzir, e essa
// lista já existe num lugar só. Uma segunda cópia aqui significaria que
// acrescentar um impedimento amanhã (digamos, "falta de energia" como status)
// mudaria o cartão e não mudaria o histórico — e o relatório de
// disponibilidade passaria a contar horas a menos sem ninguém notar.

import { motivoDeImpedimento, type MaquinaStatus } from './estado-maquina.ts'

// ⚠️ ESTA LISTA TEM UMA CÓPIA NO BANCO: o CHECK `maquina_paradas_motivo_ck`
// (57_maquina_paradas.sql). As duas andam juntas — mexer aqui sem mexer lá
// faz o INSERT estourar em produção com erro de constraint, que chega na tela
// do operador como "erro ao salvar" e nada mais.
//
// São duas cópias de propósito, e não uma tabela de motivos: seis valores que
// mudam de ano em ano não justificam um JOIN em toda leitura do histórico, e
// o CHECK é o que impede o motivo escrito errado de entrar por um caminho que
// não seja a tela.
// ⚠️ TUPLA `as const` E NÃO UM ARRAY DE OBJETOS. É dela que saem o tipo
// `MotivoDeParada` E o `z.enum` do validator — sem a tupla, o Zod receberia
// `string[]` e aceitaria qualquer texto, deixando a validação pro CHECK do
// banco, que chega na tela como "erro ao salvar" e nada mais.
export const VALORES_DE_MOTIVO = [
  'quebra',
  'preventiva',
  'troca_agulha',
  'falta_fio',
  'sem_operador',
  'energia',
  'outro',
] as const

export type MotivoDeParada = (typeof VALORES_DE_MOTIVO)[number]

// `Record` completo: acrescentar um valor à tupla QUEBRA O BUILD aqui até
// alguém escrever o rótulo dele.
const ROTULO: Record<MotivoDeParada, string> = {
  quebra: 'Quebra',
  preventiva: 'Manutenção preventiva',
  troca_agulha: 'Troca de agulha',
  falta_fio: 'Falta de fio',
  sem_operador: 'Sem operador',
  energia: 'Energia',
  outro: 'Outro',
}

/** A lista pronta pros botões do diálogo, na ordem da tupla. */
export const MOTIVOS_DE_PARADA: readonly {
  valor: MotivoDeParada
  rotulo: string
}[] = VALORES_DE_MOTIVO.map((valor) => ({ valor, rotulo: ROTULO[valor] }))

export function ehMotivoValido(v: unknown): v is MotivoDeParada {
  return (
    typeof v === 'string' && (VALORES_DE_MOTIVO as readonly string[]).includes(v)
  )
}

/**
 * O rótulo pra exibir.
 *
 * Nulo é caso NORMAL e não erro: `setup` e `desativada` são marcados no
 * formulário de cadastro, sem diálogo de motivo. O histórico não pode ficar
 * com um buraco em branco na linha — ele diz que a parada existiu e que
 * ninguém escolheu motivo.
 */
export function rotuloDoMotivo(motivo: string | null): string {
  if (motivo === null) return 'Sem motivo registrado'
  // Motivo fora da lista só aparece se o CHECK do banco e esta tupla
  // divergirem. Mostra o valor cru em vez de sumir com a linha.
  return ehMotivoValido(motivo) ? ROTULO[motivo] : motivo
}

/**
 * "Outro" obriga a dizer o quê.
 *
 * É o escape da lista, então é o que mais vai ser escolhido — e uma linha
 * "Outro" sem texto é a que ninguém consegue interpretar seis meses depois.
 * O banco também exige (`maquina_paradas_outro_ck`); isto aqui é pra tela
 * avisar antes de tentar salvar.
 */
export function exigeObservacao(motivo: MotivoDeParada): boolean {
  return motivo === 'outro'
}

/**
 * Este status abre parada?
 *
 * DERIVADO do impedimento, nunca de uma lista própria — ver o bloco do topo.
 */
export function abreParada(status: MaquinaStatus): boolean {
  return motivoDeImpedimento(status) !== null
}

// ─────────────────────────────────────────────────────────────────────────
// QUANTO TEMPO
// ─────────────────────────────────────────────────────────────────────────
//
// ⚠️ NÃO É `diasDeCalendario` NEM `diasEntre`. Aquelas respondem "quantas
// viradas de meia-noite", que é a pergunta certa pra prazo de OP e vencimento
// de parcela. Parada de máquina se mede em MINUTOS E HORAS: uma que começou
// 23h50 e acabou 00h10 durou vinte minutos, e contá-la como "1 dia" seria
// errado por um fator de setenta.
//
// Sem `date-fns` de propósito: este módulo roda no runner do Node sem
// resolver dependência nenhuma, igual aos irmãos em src/lib/producao/.

const UM_MINUTO = 60_000
const UMA_HORA = 60 * UM_MINUTO
const UM_DIA = 24 * UMA_HORA

/**
 * A duração em palavras curtas: "12 min", "3 h", "2 dias".
 *
 * Devolve só a medida, sem "há" nem "durou" — quem chama escolhe a moldura,
 * porque a mesma função serve pro cartão ("parada há 3 h") e pro histórico
 * ("durou 3 h").
 *
 * A precisão cai conforme a escala de propósito: quem olha uma parada de dois
 * dias não quer saber dos 14 minutos, e quem olha uma de 12 minutos não quer
 * ver "0 h".
 */
export function duracaoEmPalavras(inicio: Date, fim: Date): string {
  const ms = fim.getTime() - inicio.getTime()
  // Relógio de tablet fora de hora deixa `fim` antes de `inicio`. O banco
  // recusa gravar assim (`maquina_paradas_intervalo_ck`), mas o cartão
  // calcula contra o relógio do NAVEGADOR, que é de quem está olhando.
  // "-5 min" na tela é pior do que arredondar pra zero.
  if (ms < UM_MINUTO) return 'menos de 1 min'
  if (ms < UMA_HORA) return `${Math.floor(ms / UM_MINUTO)} min`
  if (ms < UM_DIA) return `${Math.floor(ms / UMA_HORA)} h`
  const dias = Math.floor(ms / UM_DIA)
  return dias === 1 ? '1 dia' : `${dias} dias`
}
