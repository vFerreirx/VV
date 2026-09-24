// COMO UMA OP SE APRESENTA NUMA LISTA — regra pura, sem banco.
//
// Quinto irmão de `estado-maquina.ts`, `destino-da-ordem.ts`,
// `inicio-da-op.ts` e `conclusao.ts`. Este responde: dentre tudo que a OP
// tem, o que o operador precisa ler PRIMEIRO pra distinguir uma da outra?
//
// ─────────────────────────────────────────────────────────────────────────
// O NOME DO PRODUTO NÃO DISTINGUE QUASE NADA
// ─────────────────────────────────────────────────────────────────────────
//
// O catálogo tem 25 produtos e os nomes compartilham prefixo: "Capa de
// Almofada - ACONCHEGO", "Capa de Almofada - LINKS", "Peseira - ACONCHEGO",
// "Peseira - LINKS", "Peseira - ARAN"… Numa lista de vinte, o olho lê o
// mesmo começo vinte vezes.
//
// Quem distingue é a VARIAÇÃO. Cada produto tem 15 a 19 cores e até 4
// tamanhos — são 466 variações no catálogo. Por isso `cor · tamanho` vem em
// primeiro e maior, e o nome do produto vem depois e menor. É o inverso do
// que a tela fazia, e o inverso do que parece certo à primeira vista.
//
// ⚠️ E O MODELO APARECIA DUAS VEZES. `variacoes_produto.modelo` guarda
// "ACONCHEGO" enquanto `produtos.nome` guarda "Capa de Almofada -
// ACONCHEGO". A linha da variação exibia "Caqui · ACONCHEGO · 45x45" logo
// abaixo do nome que já dizia ACONCHEGO — ruído puro ocupando o segundo
// lugar de destaque. `destaqueDaVariacao` corta o modelo QUANDO ele já está
// no nome do produto, e só então: se um dia um produto não seguir o padrão
// de nomes, o modelo continua aparecendo em vez de sumir em silêncio.

export type Variacao = {
  cor: string | null
  modelo: string | null
  tamanho: string | null
}

/**
 * O que vai em primeiro e maior: "Caqui · 45x45". Sem o nome do produto, e
 * sem o modelo quando ele já está lá dentro.
 */
export function destaqueDaVariacao(
  produtoNome: string,
  { cor, modelo, tamanho }: Variacao,
): string {
  const modeloRedundante =
    modelo !== null && normalizar(produtoNome).includes(normalizar(modelo))
  return [cor, modeloRedundante ? null : modelo, tamanho]
    .filter(Boolean)
    .join(' · ')
}

// Comparação frouxa de propósito: "Capa de Almofada - ACONCHEGO" contra
// "aconchego" tem que casar. Acento e caixa não deveriam decidir se uma
// palavra some da tela.
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

// ─────────────────────────────────────────────────────────────────────────
// O PRAZO ERA INVISÍVEL
// ─────────────────────────────────────────────────────────────────────────
//
// A fila é ordenada por `prioridade DESC, data_prevista_fim ASC` — mas o
// prazo não aparecia em lugar nenhum. O operador via a ordem sem ver o
// motivo dela, e uma OP que vence hoje parecia igual a uma que vence em três
// semanas.
//
// ⚠️ EM DIAS DE CALENDÁRIO, não em horas. "vence hoje" às 23h de uma OP que
// venceu às 8h da manhã continua sendo hoje: quem está na máquina pensa em
// dias, não em janelas de 24 horas.

export type Prazo = {
  texto: string
  /** Vence hoje ou já venceu — a tela pinta isso, não só escreve. */
  urgente: boolean
}

export function prazoEmPalavras(
  dataPrevistaFim: Date | null,
  agora: Date = new Date(),
): Prazo | null {
  if (!dataPrevistaFim) return null

  const dias = diasDeCalendario(agora, dataPrevistaFim)
  if (dias < 0) {
    const atraso = Math.abs(dias)
    return {
      texto: atraso === 1 ? 'ATRASADA 1 dia' : `ATRASADA ${atraso} dias`,
      urgente: true,
    }
  }
  if (dias === 0) return { texto: 'vence HOJE', urgente: true }
  if (dias === 1) return { texto: 'vence amanhã', urgente: false }
  return { texto: `${dias} dias`, urgente: false }
}

// Diferença em dias de calendário, ignorando a hora. `date-fns` faria isso,
// mas seria a única coisa que este módulo importaria — e ele é puro de
// propósito, pra rodar no runner do Node sem resolver dependência nenhuma.
function diasDeCalendario(de: Date, ate: Date): number {
  const a = Date.UTC(de.getFullYear(), de.getMonth(), de.getDate())
  const b = Date.UTC(ate.getFullYear(), ate.getMonth(), ate.getDate())
  return Math.round((b - a) / 86_400_000)
}

// ─────────────────────────────────────────────────────────────────────────
// A FAMÍLIA, SEM O MODELO
// ─────────────────────────────────────────────────────────────────────────
//
// Quando a fila é agrupada por modelo, o cabeçalho do grupo já diz "RELEVO"
// — e aí cada linha repetindo "Peseira - RELEVO" volta a ser a redundância
// que `destaqueDaVariacao` tinha acabado de tirar de cima. A linha mostra só
// a família: "Peseira", "Capa de Almofada".
//
// ⚠️ CORTE CONSERVADOR, de propósito. Só corta quando o nome TERMINA com o
// modelo; qualquer outra forma devolve o nome inteiro. Mostrar "Peseira -
// RELEVO" dentro do grupo RELEVO é feio; mostrar "Peseira" onde o produto na
// verdade se chamava outra coisa é errado, e errado em silêncio.

export function familiaDoProduto(
  produtoNome: string,
  modelo: string | null,
): string {
  if (!modelo) return produtoNome
  // Comparação nas strings CRUAS (só ignorando caixa), e não nas
  // normalizadas de `destaqueDaVariacao`: tirar acento muda o comprimento
  // do texto, e aí o índice do corte não bate mais com o original.
  if (!produtoNome.toLowerCase().endsWith(modelo.toLowerCase())) {
    return produtoNome
  }
  const cortado = produtoNome
    .slice(0, produtoNome.length - modelo.length)
    // Sobra o separador do nome ("Capa de Almofada - " vira "Capa de
    // Almofada"). Vários candidatos porque o cadastro é texto livre.
    .replace(/[\s\-–—·|]+$/u, '')
    .trim()
  return cortado.length > 0 ? cortado : produtoNome
}

// ─────────────────────────────────────────────────────────────────────────
// AGRUPAR A FILA POR PRODUTO — pelo PROGRAMA da máquina
// ─────────────────────────────────────────────────────────────────────────
//
// O motivo de agrupar é o SETUP DA MÁQUINA: espalhar três OPs da mesma peça
// pelas posições 2, 5 e 6 da fila — que é o que a ordem por prioridade
// fazia — obriga a armar a máquina três vezes pra mesma coisa.
//
// ⚠️ O SETUP SEGUE O PROGRAMA, E O PROGRAMA É POR PRODUTO. Agrupava por
// MODELO, na ideia de que o modelo era o ponto da malha — mas o programa que
// a máquina roda é o código do produto (`produtos.codigo`, migration 73), e
// ele não acompanha o modelo: o EFEITO 3D é 076 na peseira e 115 na manta; o
// PIENZA é 100 na peseira e 116 na manta e na capa. Agrupar por modelo
// juntava peseira e manta 3D como se não houvesse troca de programa entre
// elas. E o cabeçalho "ARAN" só repetia a palavra que já está na linha.
//
// Por isso o grupo é o PRODUTO, e o cabeçalho diz o que o Trello dizia na
// coluna: "085 · Peseira ARAN" (`cabecalhoDoProduto`).
//
// ⚠️ A URGÊNCIA NÃO AFUNDA. A ordem de chegada já é `prioridade DESC, prazo
// ASC` (vem assim do SQL), e o grupo entra na posição da PRIMEIRA OP dele —
// ou seja, pela mais urgente que ele contém. Um grupo com uma OP urgente
// fica no topo; dentro dele, a ordem original se mantém. Por isso este
// agrupamento NÃO reordena nada: só junta, preservando a sequência.

export type GrupoDeProduto<T> = {
  /** "085 · Peseira ARAN", ou só "Peseira ARAN" quando não há código. */
  cabecalho: string
  ops: T[]
}

/** "085 · Peseira ARAN" — o código e o nome sem o traço interno. */
export function cabecalhoDoProduto(
  codigo: string | null,
  produtoNome: string,
): string {
  const c = (codigo ?? '').trim()
  const nome = nomeParaLinha(produtoNome)
  return c ? `${c} · ${nome}` : nome
}

export function agruparPorProduto<
  T extends { produtoCodigo: string | null; produtoNome: string },
>(ops: readonly T[]): GrupoDeProduto<T>[] {
  const grupos: GrupoDeProduto<T>[] = []
  const porProduto = new Map<string, GrupoDeProduto<T>>()

  for (const op of ops) {
    // Código E nome na chave: o código não é único (o 059 é da peseira e da
    // capa LINKS, peças diferentes), e o nome sozinho juntaria dois produtos
    // homônimos com programas diferentes.
    const chave = `${(op.produtoCodigo ?? '').trim()}|${op.produtoNome}`
    let grupo = porProduto.get(chave)
    if (!grupo) {
      grupo = {
        cabecalho: cabecalhoDoProduto(op.produtoCodigo, op.produtoNome),
        ops: [],
      }
      porProduto.set(chave, grupo)
      // Primeira aparição define a posição — e como a lista chega ordenada
      // por urgência, isso ordena os grupos pela OP mais urgente de cada um.
      grupos.push(grupo)
    }
    grupo.ops.push(op)
  }
  return grupos
}

// ─────────────────────────────────────────────────────────────────────────
// AGRUPAR POR DESTINO — e, dentro dele, por produto
// ─────────────────────────────────────────────────────────────────────────
//
// No Trello, o Full era a coisa mais visível: um PAINEL por Full, e dentro
// dele uma COLUNA por produto. Agrupando só por produto, três OPs do mesmo
// Full ("Full ML · Conta 1 · 29/09") apareciam espalhadas em três grupos —
// e o Full, como unidade, sumia. O operador escolhe a OP pensando "o que o
// caminhão de amanhã precisa", não "qual peseira".
//
// DOIS NÍVEIS: DESTINO → produto → OP.
//   - cada REMESSA Full é um bloco (duas remessas do mesmo canal, duas);
//   - cada PEDIDO é um bloco;
//   - o ESTOQUE é um bloco só;
//   - OP de Full SEM remessa (as de teste antigas) cai num bloco próprio por
//     canal, sem quebrar nada e sem se misturar com as que têm remessa;
//   - venda direta sem pedido, um bloco por canal (não tem pra quem ir).
//
// ⚠️ NÃO REORDENA, como `agruparPorProduto`: cada bloco entra na posição da
// OP mais urgente que ele contém. A lista chega por prioridade + prazo, então
// o Full com o caminhão mais perto vem primeiro — e uma OP marcada URGENTE
// pelo gerente ainda puxa o bloco dela pro topo.

export type OpComDestino = {
  canalDestino: string
  remessaFullId: string | null
  orcamentoId: string | null
  /** O cabeçalho do bloco, já pronto — `rotuloDoBlocoDeDestino`. */
  destinoBloco: string
  produtoCodigo: string | null
  produtoNome: string
}

export type BlocoDeDestino<T> = {
  /** Estável entre recargas: é por ela que a tela lembra o que está aberto. */
  chave: string
  /** "Full ML · Conta 1 · envio 29/09" · "Pedido #142" · "Estoque". */
  cabecalho: string
  /** O canal, pra cor (`corDoCanal`) — só Full tem cor. */
  canal: string
  ops: T[]
  /** As colunas do Trello: os produtos dentro do bloco, sem reordenar. */
  produtos: GrupoDeProduto<T>[]
}

export function chaveDoDestino(op: {
  canalDestino: string
  remessaFullId: string | null
  orcamentoId: string | null
}): string {
  if (op.remessaFullId) return `remessa:${op.remessaFullId}`
  if (op.orcamentoId) return `pedido:${op.orcamentoId}`
  if (op.canalDestino === 'estoque') return 'estoque'
  // Full sem remessa e venda direta sem pedido: um bloco por canal.
  return `canal:${op.canalDestino}`
}

export function agruparPorDestino<T extends OpComDestino>(
  ops: readonly T[],
): BlocoDeDestino<T>[] {
  const blocos: BlocoDeDestino<T>[] = []
  const porChave = new Map<string, BlocoDeDestino<T>>()
  for (const op of ops) {
    const chave = chaveDoDestino(op)
    let bloco = porChave.get(chave)
    if (!bloco) {
      bloco = {
        chave,
        cabecalho: op.destinoBloco,
        canal: op.canalDestino,
        ops: [],
        produtos: [],
      }
      porChave.set(chave, bloco)
      // Primeira aparição = a OP mais urgente do bloco (a lista chega por
      // urgência): é ela que decide a posição do bloco.
      blocos.push(bloco)
    }
    bloco.ops.push(op)
  }
  // Dentro de cada bloco, as colunas por produto — pela mesma regra de
  // sempre, que também não reordena.
  for (const b of blocos) b.produtos = agruparPorProduto(b.ops)
  return blocos
}

// ─────────────────────────────────────────────────────────────────────────
// O TÍTULO DA OP — uma função só, duas telas
// ─────────────────────────────────────────────────────────────────────────
//
// A fila de escolha e o cartão da máquina mostram A MESMA OP, com meia hora
// de diferença: ele escolhe na fila, e depois passa o turno olhando o
// cartão. Se as duas montarem o texto por conta própria, a peça que ele
// escolheu como "Peseira · Marsala · Queen" vira "Peseira - RELEVO / Marsala
// · Queen" no cartão — e conferir se pegou a OP certa passa a exigir
// tradução. Por isso o título sai daqui, em PARTES, e cada tela só decide o
// tamanho de cada uma.
//
// ⚠️ A FAMÍLIA VEM PRIMEIRO E EM NEGRITO. É o que a peça É — peseira, manta,
// capa de almofada —, e isso decide o setup da máquina tanto quanto o ponto.
// Ela perdeu destaque quando o nome do produto desceu pra segunda linha; o
// título devolve isso sem ressuscitar o nome inteiro com o modelo colado.
//
// ⚠️ A COR NÃO PRECISA SER A PRIMEIRA PALAVRA porque o SWATCH já está ali,
// do lado, nas duas telas. O olho pega a cor pela mancha; o texto serve pra
// confirmar de perto e pra quem não distingue tons próximos.

export type TituloDaOp = {
  /** "Peseira", "Capa de Almofada" — o que a peça é. Vem em negrito. */
  familia: string
  /** "Marsala · Queen" — o que separa esta OP das outras da mesma peça. */
  variacao: string
  /** "RELEVO" — o ponto da malha, ou null quando não há modelo. */
  modelo: string | null
}

export function tituloDaOp(
  produtoNome: string,
  { cor, modelo, tamanho }: Variacao,
): TituloDaOp {
  return {
    familia: familiaDoProduto(produtoNome, modelo),
    // Sem o modelo: na fila ele está no cabeçalho do grupo, no cartão ele
    // vem na linha de baixo. Repetir aqui é a redundância de sempre.
    variacao: [cor, tamanho].filter(Boolean).join(' · '),
    modelo,
  }
}

// ─────────────────────────────────────────────────────────────────────────
// A LINHA DO TRELLO — como o chão de fábrica LÊ a OP
// ─────────────────────────────────────────────────────────────────────────
//
// O operador lia as OPs no Trello, uma por cartão, sempre na mesma ordem:
//
//     "059 - Peseira Links - QUEEN - AREIA - 55"
//      código · produto (com o modelo) · tamanho · cor · quantidade
//
// e o tablet montava tudo pelo nome ("Peseira · Areia · Casal"), sem código
// em lugar nenhum — embora a busca da fila já achasse "059". Ele digitava uma
// coisa e lia outra.
//
// ⚠️ O CÓDIGO É O DO PROGRAMA DA MÁQUINA (`produtos.codigo`, migration 73), e
// não o SKU: "059", nunca "059-P" — o tipo da peça já vem no nome. Produto
// sem programa (novo, ou comprado de parceiro) fica SEM código: nada de
// "null", e nada de traço sobrando no começo da linha.
//
// ⚠️ PRODUTO DE UM TAMANHO SÓ NÃO MOSTRA TAMANHO: "059 - Capa de Almofada
// LINKS - AREIA - 110". Quem diz se é tamanho único são as VARIAÇÕES VIVAS
// do produto, contadas na consulta — nunca adivinhado pelo nome ("capa é
// sempre 45x45" deixou de ser verdade quando a ACONCHEGO ganhou 4 tamanhos).
//
// ⚠️ TAMANHO E COR EM MAIÚSCULAS SÓ NA TELA. O que está gravado não muda: a
// variação guarda "Areia", e é por esse texto que preço, peso e amostra de
// cor casam (tudo por nome).
//
// É o complemento do `tituloDaOp`, não o substituto: o título em partes
// continua servindo onde a tela precisa dar pesos diferentes à família e à
// variação. A LINHA é o que se lê de relance, igual ao papel.

export type OpParaLinha = {
  /** `produtos.codigo` — o programa. Nulo ou vazio = sem código. */
  codigo: string | null
  produtoNome: string
  tamanho: string | null
  cor: string | null
  quantidade: number
  /** O produto tem no máximo um tamanho entre as variações vivas. */
  tamanhoUnico: boolean
}

export type LinhaDaOp = {
  /** "059", ou null. É o que a tela põe em destaque. */
  codigo: string | null
  /**
   * "Peseira LINKS" — o nome do cadastro ("Peseira - LINKS") sem o traço
   * interno, que na linha parecia mais um campo. Ver `nomeParaLinha`.
   */
  produto: string
  /** "QUEEN", ou null (tamanho único ou sem tamanho). */
  tamanho: string | null
  /** "AREIA", ou null. */
  cor: string | null
  quantidade: number
  /** Tudo, na ordem do Trello, unido por " - ". */
  texto: string
  /** O mesmo texto sem o código — pra quando a tela já desenhou o código. */
  semCodigo: string
  /**
   * Só produto - tamanho - cor: sem código e sem quantidade. É o que vai ao
   * lado do código quando a quantidade tem lugar próprio na tela ("Meta: 55
   * peças" no cartão, "55 pç" na lista).
   */
  descricao: string
}

/**
 * O nome do produto como o Trello escrevia: sem o " - " de DENTRO do nome.
 *
 * O cadastro guarda "Peseira - ARAN", e na linha — cujos campos já são
 * separados por " - " — esse traço interno parecia mais um campo: "085 -
 * Peseira - ARAN - QUEEN - AZUL MARINHO" são cinco pedaços onde o Trello tem
 * quatro. Aqui ele vira espaço: "Peseira ARAN".
 *
 * SÓ NA EXIBIÇÃO: o nome gravado não muda (é por ele que o faltante de
 * pedido acha o produto). Só o traço CERCADO DE ESPAÇO sai — hífen de
 * palavra composta fica.
 */
export function nomeParaLinha(produtoNome: string): string {
  return produtoNome.trim().replace(/\s+[-–—]\s+/g, ' ')
}

const limpo = (s: string | null | undefined): string | null => {
  const t = (s ?? '').trim()
  return t.length > 0 ? t : null
}

export function linhaDaOp(op: OpParaLinha): LinhaDaOp {
  const codigo = limpo(op.codigo)
  const tamanho = op.tamanhoUnico ? null : limpo(op.tamanho)?.toUpperCase() ?? null
  const cor = limpo(op.cor)?.toUpperCase() ?? null
  // Sem o " - " interno, senão ele parece mais um campo (`nomeParaLinha`).
  const produto = nomeParaLinha(op.produtoNome)

  const descricao = [produto, tamanho, cor].filter(
    (p): p is string => p !== null && p !== '',
  )
  const resto = [...descricao, String(op.quantidade)]
  return {
    codigo,
    produto,
    tamanho,
    cor,
    quantidade: op.quantidade,
    texto: [codigo, ...resto].filter(Boolean).join(' - '),
    semCodigo: resto.join(' - '),
    descricao: descricao.join(' - '),
  }
}
