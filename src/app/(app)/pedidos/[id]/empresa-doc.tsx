import type { EmpresaDoDocumento } from '../../empresas/actions'
import { formatarDocumento } from '@/lib/validators/documento'

// Identificação do emissor nos três documentos impressos (pedido, via de
// separação e romaneio). Vive num lugar só porque são cinco pontos de
// impressão — antes era o mesmo texto escrito à mão em cada um.

// Sem empresa principal cadastrada o documento CONTINUA saindo, com o mesmo
// nome de sempre e sem CNPJ. Cabeçalho vazio faria um documento assinado
// parecer defeituoso, e imprimir um CNPJ de constante seria pior: ele pode
// não ser o da empresa que emitiu.
export const EMPRESA_FALLBACK = 'Vanvest Home Decor'

// Nome de destaque: o fantasia é o que o cliente reconhece; sem ele, a
// razão social sobe pro lugar grande.
export function nomeDestaque(empresa: EmpresaDoDocumento | null): string {
  if (!empresa) return EMPRESA_FALLBACK
  return empresa.nomeFantasia ?? empresa.razaoSocial
}

// Bloco do cabeçalho: nome grande, razão social e CNPJ miúdos embaixo. O
// romaneio é assinado, então precisa identificar quem entrega — não só a
// marca.
export function IdentidadeEmpresa({ empresa }: { empresa: EmpresaDoDocumento | null }) {
  return (
    <>
      <div className="text-lg font-semibold">{nomeDestaque(empresa)}</div>
      {/* A razão social só repete embaixo quando o destaque é o fantasia. */}
      {empresa?.nomeFantasia && (
        <div className="text-muted-foreground text-xs">{empresa.razaoSocial}</div>
      )}
      {empresa?.cnpj && (
        <div className="text-muted-foreground text-xs tabular-nums">
          CNPJ {formatarDocumento(empresa.cnpj)}
        </div>
      )}
    </>
  )
}
