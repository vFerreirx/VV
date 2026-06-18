-- ============================================================
-- 16_vendas_simples.sql
-- Vendas viram um registro simples POR DIA: unidades + faturamento +
-- observação (não mais por produto/canal).
--
-- Idempotente. (Sem dados — vendas estava vazia.)
-- ============================================================

DROP INDEX IF EXISTS public.vendas_canal_idx;

ALTER TABLE public.vendas DROP COLUMN IF EXISTS produto_id;
ALTER TABLE public.vendas DROP COLUMN IF EXISTS variacao_id;
ALTER TABLE public.vendas DROP COLUMN IF EXISTS canal;

ALTER TABLE public.vendas
  ADD COLUMN IF NOT EXISTS faturamento numeric(12, 2);

-- Um registro por dia.
CREATE UNIQUE INDEX IF NOT EXISTS vendas_data_unica_idx
  ON public.vendas (data) WHERE deleted_at IS NULL;
