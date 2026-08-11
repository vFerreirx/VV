import { pgEnum } from 'drizzle-orm/pg-core'

// Papéis dos usuários do sistema
export const userRoleEnum = pgEnum('user_role', [
  'admin',
  'gerente_producao',
  'operador',
  'estoquista',
  'vendas',
])

// Estado operacional da máquina
export const maquinaStatusEnum = pgEnum('maquina_status', [
  'operando',
  'parada',
  'manutencao',
  'setup',
  'desativada',
])

// Canal de destino da ordem de produção
export const ordemCanalEnum = pgEnum('ordem_canal_destino', [
  'full_ml',
  'full_shopee',
  'venda_direta',
  'estoque',
])

// Prioridade da OP
export const ordemPrioridadeEnum = pgEnum('ordem_prioridade', [
  'baixa',
  'normal',
  'alta',
  'urgente',
])

// Estado do fluxo da OP — usado tanto na tabela ordens_producao
// quanto nas colunas status_anterior/status_novo de eventos_kanban
export const ordemStatusEnum = pgEnum('ordem_status', [
  'aguardando_materia_prima',
  'programado',
  'em_producao',
  'acabamento',
  'embalagem',
  'pronto_envio',
  'enviado',
  'cancelado',
])

// Tipo de movimentação de estoque
export const movimentacaoTipoEnum = pgEnum('movimentacao_tipo', [
  'entrada_producao',
  'saida_full_ml',
  'saida_full_shopee',
  'saida_venda_direta',
  'ajuste',
  'devolucao',
])

// Status do pedido. A ORDEM é o fluxo, e tem que bater com a ordem interna
// do enum no Postgres (`supabase/sql/41_orcamento_status.sql`) e com
// `FLUXO_PEDIDO` em src/lib/pedido-status.ts, que é quem decide quais
// transições valem.
export const orcamentoStatusEnum = pgEnum('orcamento_status', [
  'aguardando',
  'aprovado',
  'separado',
  'finalizado',
])
