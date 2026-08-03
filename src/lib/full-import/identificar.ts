import 'server-only'

import { linhasDoDocumento, normalizar, type PaginaPdf } from './pdf-texto'

// A pasta de cada envio tem vários PDFs parecidos e subir o errado é o
// engano mais provável. A identificação é pelo CONTEÚDO (o nome do arquivo
// pode ter sido renomeado) e tolerante a acento/maiúsculas, porque o acento
// sai diferente dependendo da fonte embutida.
//
// ⚠️ Cada marcador tem que caber DENTRO DE UMA LINHA. No ASN real o título
// vem intercalado com outro texto da página ("Solicitação de Envio ao" /
// "1 2" / "entrar no condomínio" / "Armazém da Shopee (ASN)"), então
// procurar a frase inteira contígua não funciona. Por isso cada documento
// é reconhecido por um CONJUNTO de marcadores curtos, testados um a um.

export type TipoDocumento =
  | 'ml_preparacao'
  | 'shopee_picking'
  | 'shopee_asn'
  | 'danfe'
  | 'desconhecido'

export type Identificacao = {
  tipo: TipoDocumento
  // Nome legível pra mostrar na conferência ("qual documento eu reconheci").
  documento: string
  canal: 'full_ml' | 'full_shopee' | null
  // Preenchido quando o documento não serve — a mensagem explica QUAL pegar.
  recusa: string | null
}

const RECUSA_DANFE =
  'Esse é o DANFE (nota fiscal). Ele não diz a cor de cada produto, então ' +
  'não dá pra gerar a produção. Suba a lista de preparação — o arquivo ' +
  "'Inbound-...-preparation-instructions.pdf'."

const RECUSA_ASN =
  'Esse é o ASN. Precisamos do Picking List — o arquivo com o código do ' +
  "envio, tipo 'FBSINBR2026072101587.pdf'."

const RECUSA_DESCONHECIDO =
  'Não reconheci esse PDF. Pro Mercado Livre, suba a lista de preparação ' +
  "('Inbound-...-preparation-instructions.pdf'); pra Shopee, o Picking " +
  "List ('FBSINBR....pdf')."

export function identificarDocumento(paginas: PaginaPdf[]): Identificacao {
  // Uma string só, com as linhas já remontadas — os marcadores costumam vir
  // quebrados em vários trechos dentro da linha.
  const texto = normalizar(linhasDoDocumento(paginas).join(' \n '))
  const tem = (s: string) => texto.includes(normalizar(s))
  const temTodos = (...ss: string[]) => ss.every(tem)

  // Os REJEITADOS vêm primeiro: o ASN e o DANFE também falam de SKU e
  // quantidade, e um deles poderia passar por documento válido se a ordem
  // fosse a inversa.
  if (tem('danfe') || temTodos('documento auxiliar da', 'nota fiscal')) {
    return {
      tipo: 'danfe',
      documento: 'DANFE (nota fiscal)',
      canal: null,
      recusa: RECUSA_DANFE,
    }
  }

  if (
    temTodos('solicitação de envio ao', 'armazém da shopee') ||
    temTodos('(asn)', 'informação do vendedor')
  ) {
    return {
      tipo: 'shopee_asn',
      documento: 'ASN da Shopee',
      canal: 'full_shopee',
      recusa: RECUSA_ASN,
    }
  }

  if (temTodos('shopee picking list', 'informação de inbound')) {
    return {
      tipo: 'shopee_picking',
      documento: 'Picking List da Shopee',
      canal: 'full_shopee',
      recusa: null,
    }
  }

  if (temTodos('código ml:', 'instruções de preparação')) {
    return {
      tipo: 'ml_preparacao',
      documento: 'Lista de preparação do Mercado Livre',
      canal: 'full_ml',
      recusa: null,
    }
  }

  return {
    tipo: 'desconhecido',
    documento: 'Documento não reconhecido',
    canal: null,
    recusa: RECUSA_DESCONHECIDO,
  }
}
