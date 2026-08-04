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

// DOMMatrix e Path2D não existem no Node. O pdfjs tenta pegar os dois do
// `@napi-rs/canvas`, que ele declara como optionalDependency — e "opcional"
// quer dizer que pode não estar instalado. Na máquina de desenvolvimento ele
// veio junto e tudo funciona; no serverless da Vercel ele não vai, o pdfjs
// avisa que não conseguiu fazer o polyfill e o módulo estoura ao ser
// avaliado, num `new DOMMatrix()` de escopo de módulo (pdf.mjs:16713) —
// antes mesmo de ver um PDF.
//
// A saída não é instalar o binário nativo (dezenas de MB numa função
// serverless): aqui a leitura é SÓ DE TEXTO, nenhuma página é renderizada,
// então esses objetos de desenho nunca chegam a ser usados de verdade. Eles
// só precisam existir.
//
// Só definimos o que ainda não existir, pra nunca sobrescrever quem chegou
// antes. Na prática isto roda ANTES do pdfjs, então são estes objetos que
// ele enxerga em todo ambiente — inclusive onde o @napi-rs/canvas está
// instalado. É de propósito: assim o desenvolvimento roda exatamente como a
// produção, e um problema desse tipo não consegue mais se esconder aqui.
//
// NÃO REMOVER — sem isto a importação de PDF volta a quebrar na Vercel.
function garantirGlobaisDoPdfjs(): void {
  const g = globalThis as Record<string, unknown>

  if (typeof g.DOMMatrix === 'undefined') {
    // Os 6 campos da matriz 2D são tudo que o pdfjs lê de um DOMMatrix
    // (`Util.multiplyByDOMMatrix`). O construtor aceita a mesma forma que
    // ele usa: nada, ou o array [a, b, c, d, e, f].
    g.DOMMatrix = class {
      a = 1
      b = 0
      c = 0
      d = 1
      e = 0
      f = 0

      constructor(init?: number[]) {
        if (init && init.length >= 6) {
          this.a = init[0]!
          this.b = init[1]!
          this.c = init[2]!
          this.d = init[3]!
          this.e = init[4]!
          this.f = init[5]!
        }
      }
    }
  }

  if (typeof g.Path2D === 'undefined') {
    // Só existe pra `new Path2D()` e `x instanceof Path2D` não estourarem.
    // Sem métodos de propósito: se algum dia alguém renderizar página por
    // aqui, é melhor falhar alto do que desenhar no vazio em silêncio.
    g.Path2D = class {}
  }
}

// Em Node o pdfjs não sobe Worker de verdade: ele carrega o motor de parsing
// (`pdf.worker.mjs`, 2,3 MB) na própria thread. Só que faz isso com
// `import(GlobalWorkerOptions.workerSrc)` — caminho montado em RUNTIME, que o
// rastreador de arquivos do Next não tem como enxergar. Resultado: o worker
// não é copiado pra função serverless e a leitura morre em produção com
//   Setting up fake worker failed: "Cannot find module
//   '/var/task/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'"
// Aqui nunca deu, porque o node_modules inteiro está no disco.
//
// A saída é carregar o worker nós mesmos, com o caminho LITERAL: assim o
// rastreador vê o arquivo e o inclui no pacote. O pdfjs olha primeiro pra
// `globalThis.pdfjsWorker` (`PDFWorker.#mainThreadWorkerMessageHandler`) e,
// achando o módulo pronto lá, nem chega no import dinâmico.
async function carregarWorkerDoPdfjs(): Promise<void> {
  const g = globalThis as Record<string, unknown>
  if (g.pdfjsWorker) return
  g.pdfjsWorker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
}

export async function lerPdf(bytes: Uint8Array): Promise<PaginaPdf[]> {
  garantirGlobaisDoPdfjs()
  await carregarWorkerDoPdfjs()

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
