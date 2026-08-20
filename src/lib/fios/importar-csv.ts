// Parser do CSV de controle de fios da fábrica (planilha do fornecedor).
//
// Formato real ("CONTROLE DE FIOS - FRUCHI - AGOSTO.csv"):
//   COR,PARTIDA (LOTE),CAIXAS,RETIRADA,TOTAL CAIXA,QUANTIDADE (KG),,,,
//   Âmbar Dourado,1202,52,14,38,1216,,,CAIXAS,3792
//
// - separador vírgula, com cabeçalho, decimais com VÍRGULA e às vezes entre
//   aspas ("113364,3");
// - da 7ª coluna em diante é lixo: algumas linhas carregam um bloco de
//   totais ali. Tudo além da 6ª é ignorado;
// - a última linha é o total geral e vem com COR vazia.
//
// ⚠️ QUANTIDADE (KG) É O PESO DO SALDO, NÃO O DA ENTRADA.
// Confirmado no lote 1202 do Âmbar Dourado: 52 caixas, 14 retiradas, 38 de
// saldo e 1.216 kg — e 1.216 / 38 = 32 kg por caixa, não 1.216 / 52.
// Ler QUANTIDADE como peso de entrada faz o estoque fechar em kg e mentir
// em caixas; ler CAIXAS × 32 faz o contrário. Só a divisão resolve:
//
//   kg_por_caixa = QUANTIDADE / TOTAL CAIXA
//   entrada      = CAIXAS × kg_por_caixa
//   retirada     = RETIRADA × kg_por_caixa   (só quando RETIRADA > 0)
//
// E o kg por caixa NÃO é constante: a maioria dos lotes é 32, mas há lotes
// de 25 (Cru Lã, Rosa Prata, Vermelho 80332) e valores quebrados de verdade
// (30,91 no Azul Marinho 16470; 31,88 no Verde Musgo 80690). Derive linha a
// linha — assumir 32 erra 2.700 kg num lote só.

// Peso por caixa usado quando não dá pra derivar (TOTAL CAIXA = 0, lote
// inteiro já retirado). É chute, e por isso vira aviso.
export const KG_POR_CAIXA_PADRAO = 32

// A cor do fornecedor como está cadastrada — o parser recebe a lista em vez
// de consultar o banco, e continua puro.
export type CorConhecida = {
  id: string
  nomeFornecedor: string
}

export type LinhaFio = {
  // Número FÍSICO da linha no arquivo, pra mensagem mandar o usuário no
  // lugar certo mesmo com linhas em branco no meio.
  linha: number
  corFornecedorId: string
  corFornecedorNome: string
  numeroLote: string | null
  caixas: number
  pesoTotalKg: string // decimal "1234.56"
  retiradaCaixas: number
  retiradaPesoKg: string | null // null quando não houve retirada
  kgPorCaixa: number
}

export type TotaisImport = {
  lotes: number
  caixasEntrada: number
  caixasRetirada: number
  caixasSaldo: number
  kgSaldo: number
}

// Os avisos vêm em DUAS listas porque significam coisas opostas, igual ao
// import de vendas:
//  - `ignoradas`: a linha não entrou. Dado perdido — os totais não fecham
//    com o rodapé da planilha.
//  - `atencoes`: a linha ENTROU, mas tem algo suspeito.
export type ResultadoImportFios = {
  linhas: LinhaFio[]
  ignoradas: string[]
  atencoes: string[]
  totais: TotaisImport
}

function normalizar(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// Divide uma linha de CSV por vírgula respeitando aspas — sem isso o
// "113364,3" entre aspas viraria duas colunas e deslocaria tudo à direita.
function camposDaLinha(linha: string): string[] {
  const out: string[] = []
  let atual = ''
  let dentroDeAspas = false
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i]
    if (dentroDeAspas) {
      if (c === '"') {
        if (linha[i + 1] === '"') {
          atual += '"'
          i++
        } else dentroDeAspas = false
      } else atual += c
    } else if (c === '"') dentroDeAspas = true
    else if (c === ',') {
      out.push(atual)
      atual = ''
    } else atual += c
  }
  out.push(atual)
  return out.map((c) => c.trim())
}

// "113364,3" -> 113364.3 ; "2725,5" -> 2725.5 ; "1.234,5" -> 1234.5
// Só trata o ponto como separador de milhar quando há vírgula na string:
// assim um eventual "1.5" (decimal com ponto) não vira 15.
function numeroBR(s: string): number {
  const limpo = s.trim()
  if (limpo === '') return NaN
  const texto = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo
  return Number(texto)
}

// Arredonda pra 2 casas — é a precisão da coluna numeric(10,2) no banco.
// Feito aqui pra que o que a prévia mostra seja exatamente o que é gravado.
function dec2(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2)
}

function kgBR(n: number): string {
  return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg`
}

// "linhas 19 e 24" / "linhas 3, 7 e 9"
function listaDeLinhas(ns: number[]): string {
  if (ns.length === 1) return `linha ${ns[0]}`
  return `linhas ${ns.slice(0, -1).join(', ')} e ${ns[ns.length - 1]}`
}

/**
 * Lê a planilha de fios. Função PURA: recebe o texto e as cores cadastradas,
 * devolve o que dá pra importar e o que há de errado. Quem grava (e quem
 * checa duplicata contra o banco) é a action; o diálogo só exibe.
 */
export function parseFiosCSV(texto: string, coresConhecidas: CorConhecida[]): ResultadoImportFios {
  const ignoradas: string[] = []
  const atencoes: string[] = []
  const linhas: LinhaFio[] = []

  // Casamento por nome, ignorando acento e caixa. Sem aproximação de
  // propósito: "Capuccino" x "Cappucino" são cores diferentes até que
  // alguém decida que não são, e essa decisão é do usuário, não do parser.
  const porNome = new Map<string, CorConhecida>()
  for (const c of coresConhecidas) porNome.set(normalizar(c.nomeFornecedor), c)

  // Guarda o índice físico junto: filtrar as vazias antes de numerar
  // deslocaria as mensagens e mandaria o usuário pra linha errada.
  const comConteudo = texto
    .split(/\r?\n/)
    .map((bruta, idx) => ({ numero: idx + 1, texto: bruta.trim() }))
    .filter((l) => l.texto !== '')

  const ultima = comConteudo.length - 1

  comConteudo.forEach((registro, posicao) => {
    const { numero } = registro
    const campos = camposDaLinha(registro.texto)
    const corCsv = (campos[0] ?? '').trim()

    // Cabeçalho: primeira linha com conteúdo cuja coluna COR é literalmente
    // "COR". Ignorada em silêncio — não é dado perdido.
    if (posicao === 0 && normalizar(corCsv) === 'cor') return

    // Rodapé de totais: vem com COR vazia. Só a ÚLTIMA linha ganha esse
    // perdão — uma linha sem cor no meio do arquivo é dado perdido, e
    // sumir com ela calada é o que essa tela existe pra não fazer.
    if (corCsv === '') {
      if (posicao === ultima) return
      ignoradas.push(`Linha ${numero}: sem cor.`)
      return
    }

    if (campos.length < 6) {
      ignoradas.push(`Linha ${numero}: colunas insuficientes ("${corCsv}").`)
      return
    }

    const cor = porNome.get(normalizar(corCsv))
    const caixas = numeroBR(campos[2] ?? '')
    const retirada = numeroBR(campos[3] ?? '')
    const totalCaixa = numeroBR(campos[4] ?? '')
    const quantidade = numeroBR(campos[5] ?? '')

    if (!Number.isFinite(caixas) || !Number.isInteger(caixas) || caixas <= 0) {
      ignoradas.push(
        `Linha ${numero} (${corCsv}): número de caixas inválido ` + `("${campos[2]}").`,
      )
      return
    }
    const ret =
      Number.isFinite(retirada) && Number.isInteger(retirada) && retirada > 0 ? retirada : 0
    if (ret > caixas) {
      ignoradas.push(
        `Linha ${numero} (${corCsv}): retirada (${ret}) maior que a ` + `entrada (${caixas}).`,
      )
      return
    }

    // Cor não cadastrada: linha ignorada, dizendo o TAMANHO do buraco. Sem
    // isso o usuário não sabe se corrigir o cadastro vale 3 caixas ou 300.
    if (!cor) {
      const kg = Number.isFinite(quantidade) ? kgBR(quantidade) : '?'
      ignoradas.push(
        `Linha ${numero}: cor "${corCsv}" não está cadastrada — ficam de ` +
          `fora ${caixas} caixa(s) e ${kg} de saldo. Cadastre a cor do ` +
          `fornecedor com esse nome exato e importe de novo.`,
      )
      return
    }

    // O peso por caixa sai da divisão, e é aqui que mora o erro silencioso
    // (ver o cabeçalho do arquivo). Sem TOTAL CAIXA não há divisão possível.
    let kgPorCaixa: number
    if (!Number.isFinite(totalCaixa) || totalCaixa <= 0) {
      kgPorCaixa = KG_POR_CAIXA_PADRAO
      atencoes.push(
        `Linha ${numero} (${corCsv}${campos[1] ? ` · lote ${campos[1]}` : ''}): ` +
          `sem saldo em caixas pra derivar o peso — usei o padrão de ` +
          `${KG_POR_CAIXA_PADRAO} kg por caixa.`,
      )
    } else if (!Number.isFinite(quantidade) || quantidade < 0) {
      ignoradas.push(
        `Linha ${numero} (${corCsv}): quantidade em kg inválida ` + `("${campos[5]}").`,
      )
      return
    } else {
      kgPorCaixa = quantidade / totalCaixa
    }

    // A planilha discordando de si mesma. Não impede a importação — o que
    // vale é CAIXAS e RETIRADA —, mas o saldo vai sair diferente do que
    // está escrito lá, e isso precisa aparecer antes e não depois.
    if (Number.isFinite(totalCaixa) && caixas - ret !== totalCaixa) {
      atencoes.push(
        `Linha ${numero} (${corCsv}): a planilha diz ${totalCaixa} de saldo, ` +
          `mas ${caixas} − ${ret} = ${caixas - ret}. Vale a conta.`,
      )
    }

    const numeroLote = (campos[1] ?? '').trim() || null

    linhas.push({
      linha: numero,
      corFornecedorId: cor.id,
      corFornecedorNome: cor.nomeFornecedor,
      numeroLote,
      caixas,
      pesoTotalKg: dec2(caixas * kgPorCaixa),
      retiradaCaixas: ret,
      retiradaPesoKg: ret > 0 ? dec2(ret * kgPorCaixa) : null,
      kgPorCaixa,
    })
  })

  // Mesmo lote repetido DENTRO do arquivo (acontece com o Cáqui 4660, que
  // aparece com 312 e com 161 caixas). Pode ser real — duas remessas da
  // mesma partida — ou digitação. Quem sabe é o usuário, então avisa e
  // importa as duas.
  const porLote = new Map<string, number[]>()
  for (const l of linhas) {
    const chave = chaveDeLote(l.corFornecedorId, l.numeroLote, l.caixas, l.pesoTotalKg)
    porLote.set(chave, [...(porLote.get(chave) ?? []), l.linha])
  }
  for (const ns of porLote.values()) {
    if (ns.length < 2) continue
    const exemplo = linhas.find((l) => l.linha === ns[0])!
    const quem = exemplo.numeroLote
      ? `O lote ${exemplo.numeroLote} (${exemplo.corFornecedorNome})`
      : `Um lote sem número de ${exemplo.corFornecedorNome} ` + `(${exemplo.caixas} caixas)`
    atencoes.push(
      `${quem} aparece ${ns.length}× no arquivo (${listaDeLinhas(ns)}). ` +
        `Todos entram — confira se são remessas diferentes mesmo.`,
    )
  }

  return { linhas, ignoradas, atencoes, totais: calcularTotais(linhas) }
}

/**
 * Os totais do que vai entrar. É o que a prévia mostra pra conferir contra o
 * rodapé da planilha ANTES de gravar — se os quatro números batem, o
 * mapeamento está certo; se um bate e outro não, está errado.
 *
 * Exportado porque a prévia recalcula ao ligar/desligar as linhas
 * duplicadas, e essa conta não pode divergir da que o parser faz.
 */
export function calcularTotais(linhas: LinhaFio[]): TotaisImport {
  const caixasEntrada = linhas.reduce((s, l) => s + l.caixas, 0)
  const caixasRetirada = linhas.reduce((s, l) => s + l.retiradaCaixas, 0)
  const kgSaldo = linhas.reduce(
    (s, l) => s + Number(l.pesoTotalKg) - Number(l.retiradaPesoKg ?? 0),
    0,
  )
  return {
    lotes: linhas.length,
    caixasEntrada,
    caixasRetirada,
    caixasSaldo: caixasEntrada - caixasRetirada,
    kgSaldo: Math.round(kgSaldo * 100) / 100,
  }
}

/**
 * Identidade de um lote pra detectar repetição — no arquivo e contra o
 * banco. A checagem contra o banco roda na action (precisa consultar), mas a
 * CHAVE mora aqui: se as duas divergirem, o aviso da prévia deixa de
 * corresponder ao que o import de fato pula.
 *
 * Com número de lote, é ele que identifica. SEM número, cai na impressão
 * digital (cor + caixas + peso): duas linhas sem lote não têm nada que as
 * distinga, e sem esse segundo caso reimportar a mesma planilha voltaria a
 * inserir justamente as linhas que ninguém consegue conferir depois. Custa
 * um falso positivo — duas remessas realmente iguais e realmente sem lote
 * —, e esse é o lado certo pra errar: aparece na prévia com o botão de
 * "importar mesmo assim" ao lado.
 */
export function chaveDeLote(
  corFornecedorId: string,
  numeroLote: string | null,
  caixas: number,
  pesoTotalKg: string,
): string {
  if (numeroLote) return `${corFornecedorId}|n|${normalizar(numeroLote)}`
  return `${corFornecedorId}|s|${caixas}|${Number(pesoTotalKg).toFixed(2)}`
}
