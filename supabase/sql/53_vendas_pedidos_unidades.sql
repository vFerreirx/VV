-- ============================================================
-- 53_vendas_pedidos_unidades.sql
-- `vendas_pedidos.quantidade` vira `unidades`.
--
-- POR QUE O RENAME: as duas tabelas tinham uma coluna `quantidade` com
-- significados DIFERENTES, e a de baixo alimenta a de cima.
--
--   vendas_marketplace.quantidade = VENDAS (a coluna da tela se chama
--     "Vendas": uma conta do Mercado Livre com 196 no dia teve 196 PEDIDOS,
--     não 196 peças);
--   vendas_pedidos.quantidade     = peças do pedido.
--
-- Ligadas assim, um pedido de 86 peças entrava no dia como 86 vendas e o
-- número da tela virava outra coisa — o mesmo nome de coluna somando duas
-- unidades de medida diferentes, que é o tipo de erro que passa no
-- type-check e some no meio de um total plausível.
--
-- UM PEDIDO É UMA VENDA. A linha espelho passa a contar LINHAS de
-- vendas_pedidos (uma por pedido), e as peças continuam guardadas aqui, com
-- nome próprio, porque o bloco "Pedidos finalizados" da tela de vendas
-- mostra elas por pedido.
--
-- RENAME preserva os dados das linhas já lançadas; o valor delas não muda,
-- só o nome da coluna. Quem recalcula o total do dia é
-- src/lib/vendas/lancamento-pedido.ts.
--
-- Idempotente (consulta information_schema, porque RENAME COLUMN não tem
-- IF EXISTS). Nada de DROP, DELETE, TRUNCATE ou UPDATE.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vendas_pedidos'
      AND column_name = 'quantidade'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vendas_pedidos'
      AND column_name = 'unidades'
  ) THEN
    ALTER TABLE public.vendas_pedidos RENAME COLUMN quantidade TO unidades;
  END IF;
END $$;
