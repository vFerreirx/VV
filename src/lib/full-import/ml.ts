import 'server-only'

import { linhasDaPagina, type PaginaPdf, type TrechoPdf } from './pdf-texto'
import { ErroLeitura, type ItemLido, type LeituraPdf } from './tipos'

// Parser da lista de preparação do Mercado Livre.
//
// Duas pegadinhas do documento:
//
// 1. As quantidades NÃO ficam junto do produto no fluxo interno do PDF —
//    todas saem no fim, depois do cabeçalho "PRODUTO / UNIDADES /
//    IDENTIFICAÇÃO / INSTRUÇÕES DE PREPARAÇÃO". Na PÁGINA cada número está
//    na linha visual do seu produto, então o pareamento é pela COORDENADA
//    Y, nunca pela ordem de leitura.
//
// 2. As três colunas COMPARTILHAM a linha visual: "Etiquetagem" (coluna
//    IDENTIFICAÇÃO) tem o mesmo Y da linha "Código ML: ... SKU:". Se a
//    linha for remontada inteira, "Etiquetagem" gruda no SKU. Por isso o
//    bloco do produto é lido SÓ na coluna da esquerda, recortada pelo X do
//    cabeçalho "UNIDADES".

// Distância vertical máxima entre o bloco do produto e o seu número. No
// arquivo real a diferença é de 2.9pt (o número fica levemente acima do
// texto do bloco); 6pt dá folga sem alcançar o produto de cima ou de baixo,
// que estão ~69pt de distância.
const TOLERANCIA_Y = 6

// Folga em volta do X da coluna UNIDADES.
const TOLERANCIA_X = 8

// Linha de continuação do SKU. O ML quebra o SKU no meio da palavra
// ("...SKU: 094-K-" / "MANTA-AMBAR-DOURADO-2CA-45-CAQUI-AMBAR-" / "DOURA"),
// então as partes se juntam SEM espaço. A continuação é reconhecida por ser
// maiúscula/dígito/hífen sem espaço nenhum — a descrição, que vem logo
// depois, sempre tem espaços e minúsculas.
const CONTINUACAO_SKU = /^[A-Z0-9][A-Z0-9-]*$/

type LinhaY = { texto: string; y: number }

function agruparPorY(trechos: TrechoPdf[]): LinhaY[] {
  const grupos: TrechoPdf[][] = []
  for (const t of [...trechos].sort((a, b) => b.y - a.y)) {
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && Math.abs(ultimo[0]!.y - t.y) <= 2) ultimo.push(t)
    else grupos.push([t])
  }
  return grupos.map((g) => ({
    y: g[0]!.y,
    texto: g
      .sort((a, b) => a.x - b.x)
      .map((t) => t.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim(),
  }))
}

export function parseMl(paginas: PaginaPdf[]): LeituraPdf {
  const avisos: string[] = []
  const itens: ItemLido[] = []

  for (const pagina of paginas) {
    // O cabeçalho "UNIDADES" define onde termina a coluna do produto e onde
    // ficam os números. Sem ele não dá pra separar as colunas.
    const cab = pagina.trechos.find((t) => t.str.trim().toUpperCase() === 'UNIDADES') ?? null
    if (!cab) {
      // Página sem tabela de produtos (capa/instruções) — segue.
      continue
    }

    // Coluna da ESQUERDA: só o bloco do produto.
    const coluna = pagina.trechos.filter((t) => t.x < cab.x - TOLERANCIA_X)
    const porY = agruparPorY(coluna)

    type Bloco = { codigo: string; sku: string; descricao: string; y: number }
    const blocos: Bloco[] = []

    for (let i = 0; i < porY.length; i++) {
      const { texto, y } = porY[i]!
      const m = texto.match(/Código ML:\s*(\S+)/i)
      if (!m) continue

      const codigo = m[1]!.trim()
      // O que vem depois de "SKU:" na mesma linha — às vezes vazio, às
      // vezes o começo do SKU ("094-K-").
      let sku = (texto.split(/SKU:\s*/i)[1] ?? '').trim()

      // Emenda as linhas seguintes que ainda são SKU.
      let j = i + 1
      while (j < porY.length && CONTINUACAO_SKU.test(porY[j]!.texto.trim())) {
        sku += porY[j]!.texto.trim()
        j++
      }

      // Descrição: o que vem depois do SKU até o próximo bloco.
      const desc: string[] = []
      for (let k = j; k < porY.length; k++) {
        const t = porY[k]!.texto.trim()
        if (/Código ML:/i.test(t)) break
        desc.push(t)
      }

      blocos.push({
        codigo,
        sku: sku.replace(/\s+/g, ''),
        descricao: desc.join(' ').replace(/\s+/g, ' ').trim(),
        y,
      })
    }

    if (blocos.length === 0) continue

    // Números da coluna UNIDADES, abaixo do cabeçalho.
    const numeros = pagina.trechos.filter(
      (t) => Math.abs(t.x - cab.x) <= TOLERANCIA_X && t.y < cab.y && /^\d+$/.test(t.str.trim()),
    )

    if (numeros.length !== blocos.length) {
      throw new ErroLeitura(
        `Na página ${pagina.numero} li ${blocos.length} produto(s) mas ` +
          `${numeros.length} quantidade(s). Não dá pra saber qual número é ` +
          'de qual produto — confira se o PDF é a lista de preparação completa.',
      )
    }

    // Pareamento por Y: pra cada bloco, o número mais próximo na vertical.
    const usados = new Set<number>()
    for (const b of blocos) {
      let melhor = -1
      let menorDist = Infinity
      for (let n = 0; n < numeros.length; n++) {
        if (usados.has(n)) continue
        const d = Math.abs(numeros[n]!.y - b.y)
        if (d < menorDist) {
          menorDist = d
          melhor = n
        }
      }
      if (melhor === -1 || menorDist > TOLERANCIA_Y) {
        throw new ErroLeitura(
          `Não consegui casar a quantidade do produto ${b.codigo} com a ` +
            'linha dele no documento. Não vou chutar — confira o arquivo.',
        )
      }
      usados.add(melhor)
      itens.push({
        codigo: b.codigo,
        sku: b.sku,
        descricao: b.descricao,
        variacao: '',
        quantidade: Number(numeros[melhor]!.str.trim()),
      })
    }
  }

  if (itens.length === 0) {
    throw new ErroLeitura(
      'Não achei nenhum produto na lista de preparação. Confira se o PDF ' + 'está completo.',
    )
  }

  // Cabeçalho do documento — aqui a linha inteira serve (o total fica na
  // faixa de cima, longe das colunas da tabela).
  const cabecalho = paginas.flatMap(linhasDaPagina).join(' ')

  const mTotal = cabecalho.match(/Total de unidades:\s*([\d.]+)/i)
  if (!mTotal) {
    throw new ErroLeitura(
      'Não achei "Total de unidades" no documento. Sem o total declarado eu ' +
        'não tenho como conferir a leitura, então não vou importar.',
    )
  }
  const totalDeclarado = Number(mTotal[1]!.replace(/\./g, ''))

  // Conferência extra que o próprio ML oferece no cabeçalho.
  const mQtd = cabecalho.match(/Produtos do envio:\s*(\d+)/i)
  if (mQtd && Number(mQtd[1]) !== itens.length) {
    throw new ErroLeitura(
      `O documento diz ter ${mQtd[1]} produtos, mas eu li ${itens.length}. ` +
        'Não vou importar uma leitura incompleta.',
    )
  }

  if (itens.some((i) => !i.sku)) {
    avisos.push('Algum item veio sem SKU no PDF — confira o de-para dele.')
  }

  const mEnvio = cabecalho.match(/Frete\s*#\s*(\w+)/i)

  return {
    canal: 'full_ml',
    documento: 'Lista de preparação do Mercado Livre',
    envioId: mEnvio ? mEnvio[1]! : null,
    itens,
    totalDeclarado,
    totalLido: itens.reduce((s, i) => s + i.quantidade, 0),
    avisos,
  }
}
