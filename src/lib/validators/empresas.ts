import { z } from 'zod'

import { normalizarDocumento, tipoDocumento, validarCnpj } from './documento'

// Empresa do grupo. O CNPJ segue o mesmo tratamento do documento do
// comprador: guardado normalizado (sem pontuação, maiúsculas) e recusado
// quando o dígito verificador não fecha. `validarCnpj` já cobre o CNPJ
// alfanumérico, então nada aqui precisa saber disso.
export const empresaSchema = z.object({
  razaoSocial: z
    .string()
    .trim()
    .min(2, 'Razão social muito curta')
    .max(160, 'Razão social muito longa'),

  nomeFantasia: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v == null ? null : v.trim()))
    .refine((v) => v === null || v.length <= 120, 'Nome fantasia muito longo')
    .transform((v) => (v === '' ? null : v)),

  // Opcional, mas quando vem tem que ser um CNPJ de verdade — é ele que sai
  // no romaneio, que é documento assinado.
  cnpj: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v == null ? null : normalizarDocumento(v)))
    .transform((v) => (v === '' ? null : v))
    .refine(
      (v) => v === null || tipoDocumento(v) === 'cnpj',
      'CNPJ deve ter 14 caracteres',
    )
    .refine(
      (v) => v === null || validarCnpj(v),
      'CNPJ inválido — confira os números',
    ),

  principal: z.boolean().default(false),
})

export type EmpresaInput = z.input<typeof empresaSchema>
export type EmpresaData = z.output<typeof empresaSchema>

// Nome que identifica a empresa nos documentos e nos seletores: o fantasia
// é o que as pessoas reconhecem; sem ele, vale a razão social.
export function nomeDaEmpresa(e: {
  razaoSocial: string
  nomeFantasia: string | null
}): string {
  return e.nomeFantasia ?? e.razaoSocial
}
