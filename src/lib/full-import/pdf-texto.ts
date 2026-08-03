import 'server-only'

// Leitura de texto POSICIONADO do PDF.
//
// Por que uma biblioteca de verdade e não regex no binário: o PDF do ML
// devolve texto fatiado pelo kerning ("WLJX9"+"7155") e acentos corrompidos
// ("Cdigo") quando lido na mão; o da Shopee usa fontes Type0/CIDFontType2
// com o texto em hexadecimal de glifos (<002C0051...>) e devolve ZERO sem o
// ToUnicode. O pdfjs aplica o ToUnicode e dá a posição (x/y) de cada trecho,
// que é o que permite remontar palavras e parear colunas.

export type TrechoPdf = {
  str: string
  x: number
  y: number
  pagina: number
}

export type PaginaPdf = {
  numero: number
  trechos: TrechoPdf[]
}

// Trechos consecutivos são considerados da MESMA linha visual quando os Y
// diferem menos que isso. O PDF do ML usa passo de linha ~8.6pt e o da
// Shopee ~26pt, então 2pt é folgado o suficiente sem juntar linhas vizinhas.
const TOLERANCIA_LINHA = 2

export async function lerPdf(bytes: Uint8Array): Promise<PaginaPdf[]> {
  // Import dinâmico: o pdfjs é pesado e só é necessário quando alguém sobe
  // um arquivo. O build `legacy` é o que roda em Node sem DOM.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')

  const tarefa = pdfjs.getDocument({
    data: bytes,
    // Sem fontes do sistema: só queremos o texto.
    useSystemFonts: false,
    // Silencia os avisos de fonte padrão — irrelevantes pra extração de
    // texto e ruidosos no log do servidor.
    verbosity: 0,
  })
  const doc = await tarefa.promise

  const paginas: PaginaPdf[] = []
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n)
      const conteudo = await page.getTextContent()
      const trechos: TrechoPdf[] = []
      for (const item of conteudo.items) {
        if (!('str' in item)) continue
        if (item.str.trim() === '') continue
        // transform = [a, b, c, d, e, f]; e/f são a translação (x/y).
        const [, , , , x, y] = item.transform as number[]
        trechos.push({ str: item.str, x: x!, y: y!, pagina: n })
      }
      paginas.push({ numero: n, trechos })
      page.cleanup()
    }
  } finally {
    // Libera o worker; sem isso o processo do servidor segura memória a
    // cada arquivo lido.
    await tarefa.destroy()
  }
  return paginas
}

// Junta os trechos de uma mesma linha visual (Y próximo), ordenados pelo X.
// Usar isso — e não trecho a trecho — é o que faz frases quebradas em vários
// trechos ("Documento Auxiliar da" + "Nota Fiscal Eletrônica") aparecerem
// inteiras pra identificação do documento.
export function linhasDaPagina(pagina: PaginaPdf): string[] {
  const grupos: TrechoPdf[][] = []
  for (const t of [...pagina.trechos].sort((a, b) => b.y - a.y)) {
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && Math.abs(ultimo[0]!.y - t.y) <= TOLERANCIA_LINHA) {
      ultimo.push(t)
    } else {
      grupos.push([t])
    }
  }
  return grupos.map((g) =>
    g
      .sort((a, b) => a.x - b.x)
      .map((t) => t.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim(),
  )
}

export function linhasDoDocumento(paginas: PaginaPdf[]): string[] {
  return paginas.flatMap(linhasDaPagina)
}

// Minúsculas e SEM ACENTO. A comparação de marcadores tem que ser tolerante:
// dependendo da fonte embutida os acentos saem diferentes (ou não saem).
export function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

// Normalização de SKU/código pro casamento automático: maiúsculas, sem
// espaço nenhum. Não mexe em hífen — ele faz parte do SKU.
export function normalizarSku(s: string): string {
  return s.toUpperCase().replace(/\s+/g, '')
}
