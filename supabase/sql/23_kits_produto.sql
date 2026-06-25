-- ============================================================
-- 23_kits_produto.sql
-- O item do kit passa a referenciar o PRODUTO (não a variação). Tamanho e
-- cor são escolhidos só na hora de gerar as OPs. kit_itens estava vazia.
--
-- Idempotente.
-- ============================================================

ALTER TABLE public.kit_itens DROP COLUMN IF EXISTS variacao_id;

ALTER TABLE public.kit_itens
  ADD COLUMN IF NOT EXISTS produto_id uuid REFERENCES public.produtos (id);

-- Tabela vazia: garante NOT NULL.
ALTER TABLE public.kit_itens ALTER COLUMN produto_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS kit_itens_produto_idx
  ON public.kit_itens (produto_id);
