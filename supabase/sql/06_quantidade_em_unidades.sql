-- ============================================================
-- 06_quantidade_em_unidades.sql
-- Migra o sistema de quantidade em kg (numeric) pra unidades (integer)
-- em ordens_producao, apontamentos_producao e movimentacoes_estoque.
--
-- Idempotente: DROP IF EXISTS + ADD IF NOT EXISTS. Pode rodar várias
-- vezes sem quebrar.
-- ============================================================

-- ordens_producao
ALTER TABLE public.ordens_producao DROP COLUMN IF EXISTS quantidade_kg;
ALTER TABLE public.ordens_producao DROP COLUMN IF EXISTS quantidade_metros;
ALTER TABLE public.ordens_producao DROP COLUMN IF EXISTS rendimento_snapshot;
ALTER TABLE public.ordens_producao ADD COLUMN IF NOT EXISTS quantidade integer NOT NULL DEFAULT 0;
ALTER TABLE public.ordens_producao ALTER COLUMN quantidade DROP DEFAULT;

-- apontamentos_producao
ALTER TABLE public.apontamentos_producao DROP COLUMN IF EXISTS kg_produzidos;
ALTER TABLE public.apontamentos_producao DROP COLUMN IF EXISTS kg_refugo;
ALTER TABLE public.apontamentos_producao ADD COLUMN IF NOT EXISTS quantidade_produzida integer NOT NULL DEFAULT 0;
ALTER TABLE public.apontamentos_producao ADD COLUMN IF NOT EXISTS quantidade_refugo integer NOT NULL DEFAULT 0;

-- movimentacoes_estoque: unifica em uma única coluna `quantidade`.
ALTER TABLE public.movimentacoes_estoque DROP COLUMN IF EXISTS quantidade_kg;
ALTER TABLE public.movimentacoes_estoque DROP COLUMN IF EXISTS quantidade_unidades;
ALTER TABLE public.movimentacoes_estoque ADD COLUMN IF NOT EXISTS quantidade integer NOT NULL DEFAULT 0;
