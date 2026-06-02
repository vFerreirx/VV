-- ============================================================
-- 08_produtos_dimensoes.sql
-- Produtos passam a ter apenas dimensões da peça: comprimento + largura.
-- Remove gramatura e rendimento (specs de malharia que não se aplicam
-- a peseiras/capas).
--
-- Idempotente: ADD ... IF NOT EXISTS / DROP ... IF EXISTS.
-- ============================================================

-- Novo campo de comprimento (cm)
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS comprimento_cm numeric(8, 2);

-- Remove specs que não se aplicam
ALTER TABLE public.produtos DROP COLUMN IF EXISTS gramatura;
ALTER TABLE public.produtos DROP COLUMN IF EXISTS rendimento_kg_por_metro;
