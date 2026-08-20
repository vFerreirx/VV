import 'server-only'

import { linhasDaPagina, type PaginaPdf } from './pdf-texto'
import { ErroLeitura, type ItemLido, type LeituraPdf } from './tipos'

// Parser do Picking List da Shopee.
//
// O documento é uma tabela de verdade, com as colunas em X fixos. Duas
// coisas obrigam a trabalhar por COLUNA e não "pegando algum número do
// bloco":
//
// 1. O campo "SKU do Armazém" normalmente é "Item without GTIN", mas às
//    vezes vem com números grudados ("Item without GTIN,41426561550_...") —
//    isso cria um número solto ANTES da quantidade real. Ele fica preso na
//    coluna dele (x≈467) e nunca encosta na de quantidade (x≈529).
//
// 2. Cada célula quebra em várias linhas, e a regra de junção MUDA por
//    coluna: SKU emenda sem espaço ("104-K-MANTA-"+"2CA-45-"+"AMBAR-"+
//    "DOURADO"), enquanto a variação emenda COM espaço ("Âmbar"+"Dourado").
//
// O cabeçalho não serve pra achar todas as colunas: "Shopee SKU ID Nome do
// Produto" sai como UM trecho só. Por isso ancoramos nos 4 rótulos que têm
// X próprio e ignoramos o que não cair perto de nenhum — o nome do produto,
// que não é usado pra decidir nada.

const TOLERANCIA_X = 6

type Coluna = 'skuVendedor' | 'codigo' | 'variacao' | 'quantidade'

// Rótulo do cabeçalho → coluna. Casados por prefixo, sem acento.
const ANCORAS: { rotulo: string; coluna: Coluna }[] = [
  { rotulo: 'sku do vendedor', coluna: 'skuVendedor' },
  { rotulo: 'shopee sku id', coluna: 'codigo' },
  { rotulo: 'variacao', coluna: 'variacao' },
  { rotulo: 'qnt.', coluna: 'quantidade' },
]

// Como cada coluna remonta as linhas quebradas da célula. A variação é a
// única sem regra fixa — ver `emendarVariacao`.
const SEPARADOR: Record<Exclude<Coluna, 'variacao'>, string> = {
  skuVendedor: '',
  codigo: '',
  quantidade: '',
}

// A célula da variação quebra em dois lugares diferentes, e só o pedaço
// seguinte diz qual foi:
//
//   "Âmbar"       + "Dourado" → quebrou NO ESPAÇO  → "Âmbar Dourado"
//   "Vermelho,Qu" + "een"     → quebrou NO MEIO DA PALAVRA → "Vermelho,Queen"
//
// Emendar tudo com espaço mostrava "Vermelho,Qu een" e "Caramelo,Ca sal" na
// conferência. Quem continua uma palavra começa em minúscula; quem começa
// palavra nova, em maiúscula — as cores e os tamanhos da Shopee vêm todos
// capitalizados. Depois de vírgula nunca entra espaço, que é como a Shopee
// escreve ("Caqui,Queen").
function emendarVariacao(partes: string[]): string {
  return partes.reduce((acc, parte) => {
    if (!acc) return parte
    return /^\p{Ll}/u.test(parte) || /[,-]$/.test(acc) ? acc + parte : `${acc} ${parte}`
  }, '')
}

function semAcento(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export function parseShopee(paginas: PaginaPdf[]): LeituraPdf {
  const avisos: string[] = []
  const itens: ItemLido[] = []

  for (const pagina of paginas) {
    // ---- Âncoras de coluna, tiradas do cabeçalho desta página ---------
    // O rótulo pode vir QUEBRADO em duas linhas ("SKU do" / "vendedor"), então
    // vale tanto o trecho começar com o rótulo quanto ser um pedaço inicial
    // dele. Como "SKU do" aparece duas vezes (vendedor e Armazém), fico com o
    // X mais à ESQUERDA — o do vendedor.
    const ancoras = new Map<Coluna, number>()
    let yCabecalho = -Infinity
    for (const t of pagina.trechos) {
      const s = semAcento(t.str)
      if (!s) continue
      for (const a of ANCORAS) {
        if (!s.startsWith(a.rotulo) && !a.rotulo.startsWith(s)) continue
        const atual = ancoras.get(a.coluna)
        if (atual === undefined || t.x < atual) ancoras.set(a.coluna, t.x)
        yCabecalho = Math.max(yCabecalho, t.y)
      }
    }
    // A coluna de quantidade é a única indispensável (ancora as linhas).
    if (!ancoras.has('quantidade') || !ancoras.has('codigo')) continue

    const xQtd = ancoras.get('quantidade')!

    const corpo = pagina.trechos.filter((t) => t.y < yCabecalho)

    // ---- Linhas: cada uma tem exatamente UMA quantidade ---------------
    const marcos = corpo
      .filter((t) => Math.abs(t.x - xQtd) <= TOLERANCIA_X && /^\d+$/.test(t.str.trim()))
      .sort((a, b) => b.y - a.y)

    if (marcos.length === 0) continue

    for (let i = 0; i < marcos.length; i++) {
      const yTopo = marcos[i]!.y
      // A linha vai do Y da quantidade até logo acima da próxima.
      const yBase = i + 1 < marcos.length ? marcos[i + 1]!.y : -Infinity
      const daLinha = corpo.filter((t) => t.y <= yTopo + 1 && t.y > yBase)

      const celula = (col: Coluna): string => {
        const x = ancoras.get(col)
        if (x === undefined) return ''
        const partes = daLinha
          .filter((t) => Math.abs(t.x - x) <= TOLERANCIA_X)
          .sort((a, b) => b.y - a.y)
          .map((t) => t.str.trim())
          .filter(Boolean)
        const junto =
          col === 'variacao' ? emendarVariacao(partes) : partes.join(SEPARADOR[col])
        return junto.replace(/\s+/g, ' ').trim()
      }

      const codigo = celula('codigo')
      const quantidade = Number(marcos[i]!.str.trim())

      if (!codigo) {
        throw new ErroLeitura(
          `Li uma linha com quantidade ${quantidade} mas sem o "Shopee SKU ` +
            'ID". Sem o código eu não sei o que produzir — confira o arquivo.',
        )
      }

      // O nome do produto fica entre as colunas de código e variação; junta
      // separado porque emenda COM espaço e não é usado pra decidir nada.
      const xCodigo = ancoras.get('codigo')!
      const xVariacao = ancoras.get('variacao') ?? Infinity
      const descricao = daLinha
        .filter((t) => t.x > xCodigo + TOLERANCIA_X && t.x < xVariacao - TOLERANCIA_X)
        .sort((a, b) => b.y - a.y)
        .map((t) => t.str.trim())
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()

      itens.push({
        codigo,
        sku: celula('skuVendedor'),
        descricao,
        variacao: celula('variacao'),
        quantidade,
      })
    }
  }

  if (itens.length === 0) {
    throw new ErroLeitura(
      'Não achei nenhum item na tabela do Picking List. Confira se o PDF ' + 'está completo.',
    )
  }

  const texto = paginas.flatMap(linhasDaPagina).join(' \n ')

  // O rodapé traz "Total <n>". Ancorado no fim da linha pra não pegar o
  // "Total" de outro contexto.
  const mTotal = texto.match(/Total\s+([\d.]+)\s*(?:\n|$)/)
  if (!mTotal) {
    throw new ErroLeitura(
      'Não achei o "Total" no documento. Sem o total declarado eu não tenho ' +
        'como conferir a leitura, então não vou importar.',
    )
  }
  const totalDeclarado = Number(mTotal[1]!.replace(/\./g, ''))

  // "ID de Envio (ASN ID)" — o FBSINBR do nome do arquivo NÃO aparece no
  // Picking List, então o identificador do envio é o ASN ID.
  const mEnvio = texto.match(/\b(INBR[A-Z0-9]+)\b/)

  if (itens.some((i) => !i.sku)) {
    avisos.push('Algum item veio sem "SKU do vendedor" no PDF — confira o de-para dele.')
  }

  return {
    canal: 'full_shopee',
    documento: 'Picking List da Shopee',
    envioId: mEnvio ? mEnvio[1]! : null,
    itens,
    totalDeclarado,
    totalLido: itens.reduce((s, i) => s + i.quantidade, 0),
    avisos,
  }
}
