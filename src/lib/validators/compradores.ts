import { z } from 'zod'

import {
  documentoValido,
  normalizarDocumento,
  soDigitos,
  tipoDocumento,
  UFS,
} from './documento'

// Campo opcional que vira null quando vazio (as colunas são nullable).
const opcional = (max: number) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v == null ? null : v.trim()))
    .refine((v) => v === null || v.length <= max, 'Texto muito longo')
    .transform((v) => (v === '' ? null : v))

export const compradorSchema = z.object({
  // Único campo obrigatório — o cadastro pode nascer só com o nome.
  nome: z
    .string()
    .trim()
    .min(2, 'Nome muito curto')
    .max(120, 'Nome muito longo'),

  // Guardado normalizado (sem pontuação, maiúsculas). Recusa DV inválido —
  // documento errado não entra.
  documento: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v == null ? null : normalizarDocumento(v)))
    .transform((v) => (v === '' ? null : v))
    .refine(
      (v) => v === null || tipoDocumento(v) !== null,
      'Documento deve ter 11 dígitos (CPF) ou 14 (CNPJ)',
    )
    .refine(
      (v) => v === null || documentoValido(v),
      'CPF/CNPJ inválido — confira os números',
    ),

  telefone: opcional(20),

  cep: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v == null ? null : soDigitos(v)))
    .transform((v) => (v === '' ? null : v))
    .refine((v) => v === null || v.length === 8, 'CEP deve ter 8 dígitos'),

  logradouro: opcional(160),
  numero: opcional(20),
  complemento: opcional(80),
  bairro: opcional(80),
  cidade: opcional(80),

  uf: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v == null ? null : v.trim().toUpperCase()))
    .transform((v) => (v === '' ? null : v))
    .refine(
      (v) => v === null || (UFS as readonly string[]).includes(v),
      'UF inválida',
    ),

  observacao: opcional(500),
})

export type CompradorInput = z.input<typeof compradorSchema>
export type CompradorData = z.output<typeof compradorSchema>
