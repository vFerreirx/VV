-- ============================================================
-- 22_kits.sql
-- Kits = combos de venda (ex.: 1 peseira + 2 capas). Para a PRODUÇÃO o
-- kit é explodido em itens unitários (uma OP por componente). Os itens
-- referenciam variações específicas de produto.
--
-- Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.kits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL,
  nome text NOT NULL,
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS kits_ativo_idx ON public.kits (ativo);
CREATE UNIQUE INDEX IF NOT EXISTS kits_sku_ativo_uidx
  ON public.kits (sku) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.kit_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_id uuid NOT NULL REFERENCES public.kits (id) ON DELETE CASCADE,
  variacao_id uuid NOT NULL REFERENCES public.variacoes_produto (id),
  quantidade integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kit_itens_kit_idx ON public.kit_itens (kit_id);

ALTER TABLE public.kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kit_itens ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'kits'
      AND policyname = 'kits_authenticated'
  ) THEN
    CREATE POLICY kits_authenticated ON public.kits
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'kit_itens'
      AND policyname = 'kit_itens_authenticated'
  ) THEN
    CREATE POLICY kit_itens_authenticated ON public.kit_itens
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
