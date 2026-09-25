// O PRAZO DA PRODUÇÃO DE UMA REMESSA FULL — regra pura, sem banco.
//
// Remessa Full é um envio pro Mercado Livre ou pra Shopee com data marcada.
// Só que a peça que sai da malharia ainda passa por COSTURA e SEPARAÇÃO antes
// do caminhão. Enquanto o sistema tratava a data de envio como prazo da
// produção, o "atrasada" só acendia quando o envio já tinha saído — tarde
// demais pra qualquer coisa além de lamentar.
//
// Então a remessa tem DOIS prazos:
//
//   data de envio   — quando o caminhão sai. É o marketplace que decide.
//   produção até    — quando a malharia tem que ter terminado. É a data de
//                     envio menos a folga, ou o dia que alguém escolher.
//
// ⚠️ ESTE ARQUIVO É A FONTE ÚNICA. Os dois formulários que criam remessa, a
// edição, o risco do card, o alerta do dashboard e o prazo das OPs leem daqui.
// Duas contas de "envio menos a folga" em dois lugares viram, um dia, um card
// "no prazo" com as OPs dele atrasadas.

import { diasEntre, fimDoDiaEmBrasilia, somarDias } from '../dia-brasil.ts'

/**
 * Folga entre o fim da produção e o envio, em dias de calendário.
 *
 * ESTIMATIVA de costura + separação, definida em 15/09/2026. É o PADRÃO do
 * "Produção até", e NÃO um mínimo: menos que isso é permitido, com aviso
 * (`avisoDoProducaoAte`). Remessa urgente — envio em 1 ou 2 dias — precisa
 * poder nascer com um prazo possível; com a folga como bloqueio, ela nascia
 * atrasada e sem como ajustar.
 *
 * O único bloqueio é a produção terminar DEPOIS do envio — o mesmo CHECK de
 * 58_remessa_producao_ate.sql. A folga é política e muda aqui, sem migration.
 */
export const FOLGA_DIAS_PRODUCAO = 3

/** Quantos dias (ou menos) faltando pro prazo da produção já são "em risco". */
export const RISCO_DIAS = 2

/** O padrão: data de envio menos a folga. */
export function producaoAtePadrao(dataEnvio: string): string {
  return somarDias(dataEnvio, -FOLGA_DIAS_PRODUCAO)
}

/**
 * O prazo que VALE: o escolhido, ou o padrão quando ninguém escolheu.
 *
 * NULO É O PADRÃO, e não "sem prazo": é o que faz mudar a data de envio
 * arrastar o prazo junto enquanto ninguém mexeu nele.
 */
export function producaoAteEfetivo(remessa: {
  dataEnvio: string
  producaoAte: string | null
}): string {
  return remessa.producaoAte ?? producaoAtePadrao(remessa.dataEnvio)
}

/**
 * Por que este "Produção até" NÃO PODE ser salvo, ou null se pode. Nulo sempre
 * pode — é o padrão.
 *
 * ⚠️ SÓ O IMPOSSÍVEL BLOQUEIA: data inválida, ou a produção terminar depois
 * do envio (o CHECK da migration 58). Folga curta é AVISO, e mora na função
 * de baixo — misturar as duas era o que travava a remessa urgente.
 */
export function erroDoProducaoAte(
  dataEnvio: string,
  producaoAte: string | null,
): string | null {
  if (producaoAte === null) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(producaoAte)) return 'Data inválida'
  if (producaoAte > dataEnvio) {
    return 'A produção não pode terminar depois do envio'
  }
  return null
}

/**
 * O aviso de folga curta, ou null. Não impede salvar.
 *
 * Null no padrão (que é a folga exata), quando já há erro (a tela não mostra
 * erro e aviso juntos) e com folga suficiente.
 */
export function avisoDoProducaoAte(
  dataEnvio: string,
  producaoAte: string | null,
): string | null {
  if (producaoAte === null) return null
  if (erroDoProducaoAte(dataEnvio, producaoAte) !== null) return null
  if (diasEntre(producaoAte, dataEnvio) < FOLGA_DIAS_PRODUCAO) {
    return `Menos de ${FOLGA_DIAS_PRODUCAO} dias pra costura e separação`
  }
  return null
}

/**
 * O prazo da OP: fim do dia do "produção até", no horário de Brasília — a
 * mesma hora que as OPs de Full sempre usaram, só que no dia certo.
 *
 * A conta mora em `fimDoDiaEmBrasilia` (src/lib/dia-brasil.ts), a mesma do
 * prazo DIGITADO na Nova OP: o "-03:00" escrito aqui era uma segunda fonte do
 * fuso, e as duas portas de prazo têm que dar o mesmo instante.
 */
export function prazoDaOp(producaoAte: string): Date {
  return fimDoDiaEmBrasilia(producaoAte)
}

export type RiscoDaRemessa =
  | 'no_prazo'
  | 'em_risco'
  | 'atrasada'
  | 'baixa_pendente'

/**
 * A situação da remessa ABERTA (com alguma OP não despachada).
 *
 * ⚠️ O VERMELHO É SÓ PRAZO DE PRODUÇÃO FURADO. "O envio passou e ainda tem OP
 * não despachada" com a produção toda concluída não é atraso da malharia: é
 * pendência de DESPACHO — âmbar, com nome próprio ("Falta despachar"), pra
 * ninguém ler como "atrasou" o que é "esqueceram de fechar".
 *
 * ⚠️ É A ÚNICA PENDÊNCIA DO FULL. OP de Full pronta esperando a data de
 * envio é normal e não acende nada; o card "Falta despachar" do dashboard
 * conta as remessas em 'baixa_pendente' daqui (o nome ficou do tempo da
 * baixa).
 *
 * `diasAteProducao` e `diasAteEnvio` são dias de calendário a partir de hoje
 * em Brasília; negativo = já passou.
 */
export function riscoDaRemessa({
  producaoConcluida,
  diasAteProducao,
  diasAteEnvio,
}: {
  producaoConcluida: boolean
  diasAteProducao: number
  diasAteEnvio: number
}): RiscoDaRemessa {
  if (producaoConcluida) {
    return diasAteEnvio < 0 ? 'baixa_pendente' : 'no_prazo'
  }
  if (diasAteProducao < 0) return 'atrasada'
  if (diasAteProducao <= RISCO_DIAS) return 'em_risco'
  return 'no_prazo'
}

// -----------------------------------------------------------------
// O NOME DE UMA REMESSA: canal · conta · data do envio
// -----------------------------------------------------------------
//
// "Full Shopee · Conta 5 · 30/09". SEM A CONTA, dois Fulls do mesmo canal no
// mesmo dia, de contas diferentes, tinham o mesmo nome — e a conta é o que
// decide o CNPJ da caixa. A DATA É A DO ENVIO (o dia do caminhão); o prazo da
// produção aparece ao lado, onde já aparecia.
//
// ⚠️ UMA FUNÇÃO PRA TODO LUGAR: pasta do kanban, destino do tablet, tela de
// remessas, histórico da OP, "mudar destino" e o evento do calendário
// (`rotuloDoEventoFull`, que é o mesmo nome sem a data). Se cada tela montasse
// o seu, o operador e o gerente chamariam a mesma caixa de nomes diferentes.

const NOME_DO_CANAL_FULL: Record<string, string> = {
  full_ml: 'Full ML',
  full_shopee: 'Full Shopee',
}

// As palavras que "Full ML" / "Full Shopee" JÁ DIZEM, por canal. ENUMERADAS,
// e não comparação solta com o rótulo: "Conta Mercado Livre 2" tem que perder
// "Mercado Livre", e uma conta chamada "Mlk" não pode perder nada.
const PALAVRAS_DO_CANAL: Record<string, readonly string[]> = {
  full_shopee: ['Shopee'],
  full_ml: ['Mercado Livre', 'ML'],
}

/**
 * O nome da conta como vai no rótulo. A conta está gravada como "Conta 5
 * Shopee"; ao lado de "Full Shopee", o "Shopee" é repetido e sai: "Conta 5".
 *
 * Só a palavra INTEIRA (sem diferenciar maiúscula): "Conta 1 ML" perde o
 * "ML", "Mlk" não perde nada. O que sobrar vazio devolve o nome como estava —
 * melhor repetir do que sumir com a conta.
 */
export function nomeDaContaNoRotulo(canal: string, contaNome: string): string {
  const original = contaNome.trim()
  let nome = original
  for (const palavra of PALAVRAS_DO_CANAL[canal] ?? []) {
    const alvo = palavra.replace(/\s+/g, '\\s+')
    // Fronteira de palavra à mão: começo, espaço ou separador antes e depois.
    const re = new RegExp(`(^|[\\s\\-–—·/(])${alvo}(?=$|[\\s\\-–—·/)])`, 'gi')
    nome = nome.replace(re, '$1')
  }
  const limpo = nome
    .replace(/\(\s*\)/g, '')
    .replace(/\s*[-–—·/]\s*$/u, '')
    .replace(/^\s*[-–—·/]\s*/u, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return limpo || original
}

/**
 * "Full Shopee · Conta 5 · 30/09" — como uma remessa se chama em todo lugar.
 * Sem conta (remessa antiga, de antes do cadastro de contas): "Full Shopee ·
 * 30/09". Aqui, e não com o CANAL_LABEL dos validators, pra este módulo
 * continuar sem dependência e rodar no runner do Node.
 */
export function rotuloDaRemessa(
  canal: string,
  dataEnvio: string,
  contaNome?: string | null,
): string {
  const [, m, d] = dataEnvio.split('-')
  return [rotuloDoEventoFull(canal, contaNome ?? null), `${d}/${m}`].join(' · ')
}

// -----------------------------------------------------------------
// OP DE FULL SÓ EXISTE DENTRO DE UMA REMESSA
// -----------------------------------------------------------------
//
// A Nova OP deixava escolher "Full Shopee" SEM remessa: a OP nascia sem conta
// e sem data de envio — ninguém sabia em que caixa ela ia, nem até quando.
// Toda action que cria OP pergunta aqui (um guarda só), e a tela só oferece
// Full com remessa escolhida ou criada na hora.
//
// ⚠️ NÃO HÁ CHECK NO BANCO, de propósito: existe OP de teste que viola a
// regra (a 0167), e soft delete não tira a linha da tabela — o CHECK
// falharia na criação. A regra vale pra OP NOVA.

const CANAIS_FULL = ['full_ml', 'full_shopee'] as const

export function ehCanalFull(canal: string): boolean {
  return (CANAIS_FULL as readonly string[]).includes(canal)
}

/**
 * Por que esta OP não pode nascer com este canal e esta remessa, ou null se
 * pode. `remessa` é a remessa que a OP vai receber (a escolhida ou a criada
 * na hora), ou null.
 */
export function erroDaRemessaDaOp(
  canal: string,
  remessa: { canal: string } | null,
): string | null {
  if (ehCanalFull(canal)) {
    if (!remessa) {
      return 'OP de Full precisa de uma remessa: escolha uma ou crie com a conta e a data de envio'
    }
    if (remessa.canal !== canal) return 'A remessa é de outro canal'
    return null
  }
  if (remessa) return 'Só OP de Full vai numa remessa'
  return null
}

// -----------------------------------------------------------------
// PRA ONDE VAI A OP — o que o operador vê no tablet
// -----------------------------------------------------------------
//
// O operador tecia sem saber pra quem: uma OP do Full que sai amanhã e uma de
// estoque pareciam iguais no tablet. O destino fica EM CIMA de
// `rotuloDaRemessa` e não ao lado dele: se a OP é de uma remessa Full, o texto
// É o da remessa ("Full ML · 24/09"), o mesmo da pasta do kanban — o gerente e
// o operador falam da mesma caixa com as mesmas palavras.
//
// NUNCA VAZIO. Canal desconhecido aparece cru, como `rotuloDaRemessa` já faz:
// um destino esquisito na tela é um defeito que alguém vê; um destino em
// branco é um que ninguém vê.

export type DestinoDaOp = {
  canal: string
  /** A remessa Full da OP, quando ela tem uma — com a conta, se tiver. */
  remessa?: {
    canal: string
    dataEnvio: string
    contaNome?: string | null
  } | null
  /** O número do pedido, quando a OP produz o faltante de um. */
  pedidoNumero?: number | null
  /**
   * O cliente do pedido. Só o cabeçalho do bloco usa
   * (`rotuloDoBlocoDeDestino`); a linha de destino continua "Pedido #142".
   */
  pedidoCliente?: string | null
}

const DESTINO_DO_CANAL: Record<string, string> = {
  full_ml: 'Full ML',
  full_shopee: 'Full Shopee',
  venda_direta: 'Venda direta',
  estoque: 'Estoque',
}

/** "Full ML · 24/09" · "Pedido #142" · "Venda direta" · "Estoque" · canal cru. */
export function rotuloDoDestino({
  canal,
  remessa,
  pedidoNumero,
}: DestinoDaOp): string {
  if (remessa) {
    return rotuloDaRemessa(remessa.canal, remessa.dataEnvio, remessa.contaNome)
  }
  if (pedidoNumero != null) return `Pedido #${pedidoNumero}`
  const c = canal.trim()
  if (c === '') return 'Sem destino'
  return DESTINO_DO_CANAL[c] ?? c
}

/**
 * O CABEÇALHO DO BLOCO DE DESTINO no diálogo "Iniciar" do tablet:
 * "Full ML · Conta 1 · envio 29/09". É o `rotuloDoDestino` com a palavra
 * "envio" — no cabeçalho a data está sozinha, longe do prazo da OP, e "29/09"
 * solto faria o operador perguntar "29/09 o quê?". O pedido ganha o CLIENTE,
 * "Pedido #142 · Loja Bela": o Full diz a conta, o pedido diz pra quem é.
 * Venda direta e Estoque saem iguais ao destino. Full SEM remessa (OP de
 * teste antiga): "Full ML · sem remessa", pra não se misturar com as que têm.
 */
export function rotuloDoBlocoDeDestino(d: DestinoDaOp): string {
  if (d.remessa) {
    const [, m, dia] = d.remessa.dataEnvio.split('-')
    return `${rotuloDoEventoFull(d.remessa.canal, d.remessa.contaNome ?? null)} · envio ${dia}/${m}`
  }
  if (d.pedidoNumero != null) {
    const pedido = rotuloDoDestino(d)
    const cliente = d.pedidoCliente?.trim()
    return cliente ? `${pedido} · ${cliente}` : pedido
  }
  if (ehCanalFull(d.canal)) {
    return `${rotuloDoEventoFull(d.canal, null)} · sem remessa`
  }
  return rotuloDoDestino(d)
}

/** "27/09" — dia e mês de uma data 'YYYY-MM-DD'. */
export function diaMes(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

// -----------------------------------------------------------------
// O EVENTO DO CALENDÁRIO: de qual conta é este envio
// -----------------------------------------------------------------
//
// São 6 contas (3 do ML, 3 da Shopee), cada uma com um CNPJ atrás. Dizer só
// "Full ML" no calendário deixa de fora justamente o que decide o que vai na
// caixa — e quem separa o lote precisa saber ANTES de montar, não depois.
//
// Evento antigo não tem conta, e isso é permanente (ver a migration 69): o
// rótulo cai no canal sozinho, sem inventar uma conta que ninguém escolheu.

/**
 * "Full ML · Conta 1" — ou só "Full ML" quando o evento não tem conta. É o
 * começo de `rotuloDaRemessa`: o calendário e a remessa falam igual. A
 * palavra do canal sai do nome da conta (`nomeDaContaNoRotulo`).
 */
export function rotuloDoEventoFull(
  canal: string,
  contaNome: string | null,
): string {
  // Canal desconhecido aparece como veio: o rótulo é pra LER, e esconder o
  // valor cru deixaria o dado estranho invisível.
  const nome = NOME_DO_CANAL_FULL[canal] ?? canal
  const conta = contaNome?.trim() ? nomeDaContaNoRotulo(canal, contaNome) : null
  return conta ? `${nome} · ${conta}` : nome
}

// -----------------------------------------------------------------
// Evento manual que já virou remessa
// -----------------------------------------------------------------

/**
 * O evento agendado à mão corresponde a uma remessa REAL?
 *
 * Quem agenda o envio no calendário e depois cadastra a remessa em Ordens
 * acaba com duas marcas no mesmo dia — uma que é plano e outra que é fato.
 * A tela mostra as duas e marca a manual como "já virou remessa", com o
 * excluir ali: apagar sozinho seria decidir por quem agendou, e pode ser que
 * sejam dois envios mesmo, no mesmo dia e canal.
 *
 * MESMO DIA **E** MESMO CANAL. Só o dia não basta (dois canais podem sair no
 * mesmo dia) e só o canal, menos ainda.
 */
export function ehEventoDuplicado(
  evento: { data: string; canal: string },
  remessas: readonly { data: string; canal: string }[],
): boolean {
  return remessas.some(
    (r) => r.data === evento.data && r.canal === evento.canal,
  )
}
