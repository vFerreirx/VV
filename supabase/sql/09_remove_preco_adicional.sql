-- ============================================================
-- 09_remove_preco_adicional.sql
-- Remove o campo preco_adicional das variações de produto.
-- Não é usado no cálculo de OP/estoque — era um extra de catálogo.
--
-- Idempotente: DROP ... IF EXISTS.
-- ============================================================

ALTER TABLE public.variacoes_produto DROP COLUMN IF EXISTS preco_adicional;
