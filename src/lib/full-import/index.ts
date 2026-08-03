import 'server-only'

import { identificarDocumento, type Identificacao } from './identificar'
import { parseMl } from './ml'
import { lerPdf } from './pdf-texto'
import { parseShopee } from './shopee'
import { ErroLeitura, type LeituraPdf } from './tipos'

export { ErroLeitura }
export type { Identificacao }

// Lê o PDF, identifica qual documento é e extrai os itens do envio.
// O arquivo NÃO é guardado em lugar nenhum: entra como bytes, sai como
// dados, e os bytes são descartados junto com a requisição.
export async function lerEnvioFull(bytes: Uint8Array): Promise<LeituraPdf> {
  let paginas
  try {
    paginas = await lerPdf(bytes)
  } catch (e) {
    // O usuário recebe a mensagem amigável, mas a causa real vai pro log do
    // servidor — sem isso, um problema de leitura vira "não abriu" e ninguém
    // consegue diagnosticar.
    console.error('[full-import] falha ao abrir o PDF:', e)
    throw new ErroLeitura(
      'Não consegui abrir esse arquivo como PDF. Confira se o download ' +
        'terminou e se o arquivo não está protegido por senha.',
    )
  }

  const id = identificarDocumento(paginas)
  if (id.recusa) throw new ErroLeitura(id.recusa)

  const leitura = id.tipo === 'ml_preparacao' ? parseMl(paginas) : parseShopee(paginas)

  // Rede de segurança principal: a soma do que eu li tem que bater com o
  // total que o próprio documento declara. Se não bater, eu li errado — e
  // uma leitura errada vira produção errada.
  if (leitura.totalLido !== leitura.totalDeclarado) {
    throw new ErroLeitura(
      `A conta não fecha: somei ${leitura.totalLido} unidades, mas o ` +
        `documento declara ${leitura.totalDeclarado}. Não vou importar uma ` +
        'leitura que eu não consigo conferir.',
    )
  }

  // Código repetido no mesmo envio: some as quantidades, senão o de-para
  // seria aplicado duas vezes e a conferência mostraria a mesma linha 2x.
  const porCodigo = new Map<string, (typeof leitura.itens)[number]>()
  for (const it of leitura.itens) {
    const atual = porCodigo.get(it.codigo)
    if (atual) atual.quantidade += it.quantidade
    else porCodigo.set(it.codigo, { ...it })
  }
  leitura.itens = [...porCodigo.values()]

  return leitura
}
