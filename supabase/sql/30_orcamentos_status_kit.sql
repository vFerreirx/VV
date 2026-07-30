-- ============================================================
-- 30_orcamentos_status_kit.sql
-- Orçamentos: status (aguardando/aprovado) + item de orçamento ganha
-- kit estruturado (kit_id + snapshot dos componentes) e tamanho, pra
-- viabilizar a via de separação (sem preço, kit quebrado em componentes).
--
-- Idempotente.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'orcamento_status') THEN
    CREATE TYPE public.orcamento_status AS ENUM ('aguardando', 'aprovado');
  END IF;
END $$;

ALTER TABLE public.orcamentos
  ADD COLUMN IF NOT EXISTS status public.orcamento_status NOT NULL DEFAULT 'aguardando';

-- kit_id: nulo pra item avulso e pra orçamentos antigos (sem kit estruturado).
ALTER TABLE public.orcamento_itens
  ADD COLUMN IF NOT EXISTS kit_id uuid REFERENCES public.kits (id) ON DELETE SET NULL;

ALTER TABLE public.orcamento_itens
  ADD COLUMN IF NOT EXISTS tamanho text;

-- Snapshot dos componentes do kit no momento do orçamento:
-- [{ produtoNome, cor, quantidade }] — quantidade é POR KIT (igual a
-- kit_itens.quantidade); a via de separação multiplica pela quantidade
-- do item do orçamento na hora de montar a lista.
ALTER TABLE public.orcamento_itens
  ADD COLUMN IF NOT EXISTS kit_componentes jsonb;
