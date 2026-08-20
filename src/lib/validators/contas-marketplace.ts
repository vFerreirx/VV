import { z } from 'zod'

import { fullCanalValues } from './remessas'

// Conta de marketplace (3 no ML, 3 na Shopee). O nome é livre — quem
// cadastra escolhe como chama ("ML Principal", "Shopee Outlet").
export const contaMarketplaceSchema = z.object({
  canal: z.enum(fullCanalValues),
  // Empresa (CNPJ) dona da conta. Obrigatória AQUI, no formulário — a
  // coluna do banco é nullable porque as contas cadastradas antes deste
  // vínculo não têm empresa e não houve backfill.
  empresaId: z.uuid('Escolha a empresa dona da conta'),
  nome: z.string().trim().min(2, 'Nome muito curto').max(80, 'Nome muito longo'),
  ativo: z.boolean().default(true),
})

export type ContaMarketplaceInput = z.input<typeof contaMarketplaceSchema>
