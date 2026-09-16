import { z } from 'zod'

import { VALORES_DE_MOTIVO } from '@/lib/producao/parada-de-maquina'

// Helpers (mesmo padrão de validators/produtos.ts).
// `.optional()` no fim é essencial: a Server Action do Next descarta valores
// undefined, então a chave pode chegar AUSENTE ao servidor — sem optional o
// Zod 4 falha com "expected nonoptional, received undefined".
const stringOpt = (max: number, label = 'Texto') =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v == null || v === '' ? undefined : v))
    .refine((v) => v === undefined || v.length <= max, `${label} muito longo`)
    .optional()

// -----------------------------------------------------------------
// Máquina
// -----------------------------------------------------------------

export const maquinaStatusValues = [
  'operando',
  'parada',
  'manutencao',
  'setup',
  'desativada',
] as const

// OS STATUS QUE ALGUÉM ESCOLHE NUM FORMULÁRIO.
//
// Este campo declara DISPONIBILIDADE — a máquina pode produzir? —, nunca
// ocupação. Quem diz que a máquina está produzindo é a OP, e o rótulo da tela
// é derivado (src/lib/producao/estado-maquina.ts).
//
// ⚠️ 'operando' ENTRA, MAS COMO "APTA". O valor do banco continua 'operando'
// (é o que as 18 máquinas têm e o que o botão "Ativar" grava), e ele passou a
// significar só "pode produzir". Com o rótulo "Operando", escolher aqui era
// o que fazia a aba Máquinas dizer que as 18 estavam produzindo com a fábrica
// parada; com "Apta" a pergunta é a certa. Sem ele na lista, a máquina posta
// em setup pelo cadastro só voltava pelo cartão, e editar uma apta mostrava o
// valor cru no campo.
//
// 'parada' fica DE FORA: é valor histórico do enum com o mesmo sentido de
// apto (`disponibilidadeDe`), e o formulário o lê como 'operando'.
//
// ⚠️ 'manutencao' TAMBÉM FICA DE FORA. Manutenção é PARADA, e parada tem
// motivo: pelo cadastro ela entrava sem motivo nenhum, e o histórico ganhava
// linhas "Sem motivo registrado" que ninguém sabe ler. Parar e liberar é pelo
// cartão ("Registrar parada" / "Voltou"). Máquina que já está em manutenção
// mostra o status desabilitado, com "(histórico)", e salva sem mexer nele —
// `atualizarMaquinaAction` só recusa ENTRAR em manutenção por aqui.
export const STATUS_ESCOLHIVEIS = [
  'operando',
  'setup',
  'desativada',
] as const satisfies readonly (typeof maquinaStatusValues)[number][]

export const maquinaSchema = z.object({
  codigo: z
    .string()
    .trim()
    .min(2, 'Código obrigatório')
    .max(20, 'Código muito longo')
    .regex(/^[A-Z0-9-]+$/i, 'Use apenas letras, números e hífen'),
  nome: z.string().trim().min(2, 'Nome obrigatório').max(120, 'Nome muito longo'),
  status: z.enum(maquinaStatusValues),

  // ⚠️ `operadorAtualId` SAIU DAQUI. A coluna continua no banco (histórico),
  // mas o app não escreve mais nela: quem responde "este operador manda
  // nesta máquina" é `estacao_operadores`, e a policy RLS passou a seguir a
  // estação (56_maquinas_rls_estacao.sql). Enquanto o campo era editável,
  // preencher um cadastro concedia permissão sem ninguém perceber — e em
  // produção ele apontava, em três máquinas, pra um usuário APAGADO.
  observacoes: stringOpt(500, 'Observações'),
})

export type MaquinaInput = z.input<typeof maquinaSchema>
export type MaquinaOutput = z.output<typeof maquinaSchema>

// -----------------------------------------------------------------
// Quick action: trocar status apenas
// -----------------------------------------------------------------

export const trocarStatusMaquinaSchema = z.object({
  status: z.enum(maquinaStatusValues),
  observacoes: stringOpt(300, 'Observações'),

  // ⚠️ OS CAMPOS DA PARADA VIAJAM JUNTO COM O STATUS, e não numa action
  // própria. É a mesma regra que o topo de 57_maquina_paradas.sql defende: a
  // parada é CONSEQUÊNCIA do status. Se fossem duas chamadas, a segunda
  // poderia falhar sozinha e a máquina ficaria impedida sem parada aberta —
  // ou pior, com uma parada aberta e o status já de volta.
  //
  // Qual dos dois vale depende da direção: ao IMPEDIR, valem `motivo` e
  // `observacaoAbertura`; ao LIBERAR, vale `observacaoFechamento`. Mandar o
  // que não se aplica é inofensivo — a action ignora.
  motivo: z
    .union([z.enum(VALORES_DE_MOTIVO), z.null(), z.undefined()])
    .transform((v) => v ?? undefined)
    .optional(),
  observacaoAbertura: stringOpt(300, 'Observação'),
  observacaoFechamento: stringOpt(300, 'Observação'),
})

export type TrocarStatusMaquinaInput = z.input<typeof trocarStatusMaquinaSchema>

// -----------------------------------------------------------------
// Filtros
// -----------------------------------------------------------------

export const maquinasFiltrosSchema = z.object({
  status: z
    .union([z.enum(maquinaStatusValues), z.literal('todos')])
    .optional(),
})

export type MaquinasFiltros = z.infer<typeof maquinasFiltrosSchema>

// -----------------------------------------------------------------
// Labels (UI)
// -----------------------------------------------------------------

export const STATUS_LABEL: Record<
  (typeof maquinaStatusValues)[number],
  string
> = {
  // "Apta", e não "Operando": o valor diz que a máquina PODE produzir, não
  // que está produzindo — ver STATUS_ESCOLHIVEIS.
  operando: 'Apta',
  parada: 'Apta',
  manutencao: 'Manutenção',
  setup: 'Setup',
  desativada: 'Desativada',
}

// Ordem visual dos grupos no grid.
export const STATUS_ORDER: (typeof maquinaStatusValues)[number][] = [
  'operando',
  'setup',
  'parada',
  'manutencao',
  'desativada',
]
