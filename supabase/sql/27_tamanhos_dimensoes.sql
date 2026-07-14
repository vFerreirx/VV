-- ============================================================
-- 27_tamanhos_dimensoes.sql
-- Largura e comprimento passam a ser do TAMANHO (ex.: "45x45" tem
-- dimensões próprias) em vez do produto. Aditivo; as colunas antigas em
-- produtos ficam (não usadas) pra preservar o histórico.
--
-- Idempotente.
-- ============================================================

ALTER TABLE public.tamanhos
  ADD COLUMN IF NOT EXISTS largura_cm numeric(8, 2),
  ADD COLUMN IF NOT EXISTS comprimento_cm numeric(8, 2);
