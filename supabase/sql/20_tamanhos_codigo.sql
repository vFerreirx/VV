-- ============================================================
-- 20_tamanhos_codigo.sql
-- Código de SKU por tamanho (ex.: KING -> "K", Manta -> "MANTA"), usado na
-- geração automática do SKU da variação do produto.
--
-- Idempotente.
-- ============================================================

ALTER TABLE public.tamanhos
  ADD COLUMN IF NOT EXISTS codigo text;
