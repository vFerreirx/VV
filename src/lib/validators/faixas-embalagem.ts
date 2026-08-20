import { z } from 'zod'

import { avaliarMedidas } from '@/lib/frete'

// Medida do pacote em cm. Aceita decimal — pacote medido com fita dá meio
// centímetro, e arredondar por conta própria seria o código decidindo o que
// é do usuário. Guardada como string porque a coluna é numeric.
// O `.optional()` no fim é essencial: Server Action descarta `undefined` e a
// chave pode chegar ausente.
const medidaCm = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim().replace(',', '.'))
  .refine(
    (v) => v !== '' && !Number.isNaN(Number(v)) && Number(v) > 0,
    'Informe uma medida maior que zero',
  )

const pesoAte = z
  .union([z.string(), z.number()])
  .transform((v) => (v === '' ? NaN : Number(v)))
  .refine((v) => Number.isInteger(v) && v > 0, 'Informe o peso em gramas inteiras, maior que zero')

// Os limites dos Correios são validados AQUI, no cadastro — não só na hora de
// cotar. Uma faixa que gere volume inválido, checada só na cotação, aparece
// como erro no meio de um pedido e sem dizer que a culpa é do cadastro.
// A conta vai na mensagem: quem cadastrou precisa saber quanto passou.
// (Taxa extra acima de 70 cm é AVISO e não entra aqui — a tela mostra, o
// usuário decide.)
export const faixaEmbalagemSchema = z
  .object({
    pesoAteGramas: pesoAte,
    alturaCm: medidaCm,
    larguraCm: medidaCm,
    comprimentoCm: medidaCm,
  })
  .superRefine((data, ctx) => {
    const { erros } = avaliarMedidas({
      alturaCm: Number(data.alturaCm),
      larguraCm: Number(data.larguraCm),
      comprimentoCm: Number(data.comprimentoCm),
    })
    for (const erro of erros) {
      ctx.addIssue({ code: 'custom', message: erro })
    }
  })

export type FaixaEmbalagemInput = z.input<typeof faixaEmbalagemSchema>
export type FaixaEmbalagemOutput = z.output<typeof faixaEmbalagemSchema>
