-- ============================================================
-- 17_vendas_marketplace.sql
-- Detalhamento das vendas do dia por conta de marketplace.
-- O total do dia (vendas.quantidade / vendas.faturamento) passa a ser a
-- soma das linhas aqui. Catálogo de contas vive no código
-- (src/lib/validators/vendas.ts).
--
-- Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.vendas_marketplace (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id uuid NOT NULL REFERENCES public.vendas (id) ON DELETE CASCADE,
  marketplace text NOT NULL,
  conta text NOT NULL,
  quantidade integer NOT NULL DEFAULT 0,
  faturamento numeric(12, 2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vendas_marketplace_venda_idx
  ON public.vendas_marketplace (venda_id);

CREATE UNIQUE INDEX IF NOT EXISTS vendas_marketplace_venda_conta_idx
  ON public.vendas_marketplace (venda_id, conta);

ALTER TABLE public.vendas_marketplace ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'vendas_marketplace'
      AND policyname = 'vendas_marketplace_authenticated'
  ) THEN
    CREATE POLICY vendas_marketplace_authenticated
      ON public.vendas_marketplace
      FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;
