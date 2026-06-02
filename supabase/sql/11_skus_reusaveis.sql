-- ============================================================
-- 11_skus_reusaveis.sql
-- SKUs de produtos/variações EXCLUÍDOS deixam de bloquear reuso.
-- Troca a unicidade total por unicidade PARCIAL (só linhas com
-- deleted_at IS NULL) e propaga o soft-delete pras variações.
--
-- Idempotente.
-- ============================================================

-- 1) variações ganham deleted_at (acompanha o produto pai).
ALTER TABLE public.variacoes_produto
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- 2) Backfill: variações de produtos já excluídos herdam o deleted_at.
UPDATE public.variacoes_produto v
SET deleted_at = p.deleted_at
FROM public.produtos p
WHERE v.produto_id = p.id
  AND p.deleted_at IS NOT NULL
  AND v.deleted_at IS NULL;

-- 3) Remove qualquer UNIQUE total de produtos.sku e cria índice parcial.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.produtos'::regclass AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE public.produtos DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS produtos_sku_ativo_uidx
  ON public.produtos (sku) WHERE deleted_at IS NULL;

-- 4) Mesma coisa em variacoes_produto.sku_variacao.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.variacoes_produto'::regclass AND contype = 'u'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.variacoes_produto DROP CONSTRAINT %I', r.conname
    );
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS variacoes_sku_ativo_uidx
  ON public.variacoes_produto (sku_variacao) WHERE deleted_at IS NULL;
