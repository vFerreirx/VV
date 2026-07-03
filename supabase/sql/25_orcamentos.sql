-- ============================================================
-- 25_orcamentos.sql
-- Orçamentos pra clientes (ex.: atacado): cabeçalho + itens com preço
-- manual. Numeração sequencial simples (identity). Escrita segue o
-- padrão da área de vendas (admin/gerente/vendas).
--
-- Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.orcamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero integer GENERATED ALWAYS AS IDENTITY,
  cliente text NOT NULL,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS orcamentos_numero_idx ON public.orcamentos (numero);

CREATE TABLE IF NOT EXISTS public.orcamento_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orcamento_id uuid NOT NULL REFERENCES public.orcamentos (id) ON DELETE CASCADE,
  descricao text NOT NULL,
  quantidade integer NOT NULL DEFAULT 1,
  preco_unitario numeric(12, 2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orcamento_itens_orcamento_idx
  ON public.orcamento_itens (orcamento_id);

ALTER TABLE public.orcamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamento_itens ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'orcamentos'
      AND policyname = 'orcamentos_area_rw'
  ) THEN
    CREATE POLICY orcamentos_area_rw ON public.orcamentos
      FOR ALL TO authenticated
      USING (user_role() = ANY (ARRAY['admin','gerente_producao','vendas']::user_role[]))
      WITH CHECK (user_role() = ANY (ARRAY['admin','gerente_producao','vendas']::user_role[]));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'orcamento_itens'
      AND policyname = 'orcamento_itens_area_rw'
  ) THEN
    CREATE POLICY orcamento_itens_area_rw ON public.orcamento_itens
      FOR ALL TO authenticated
      USING (user_role() = ANY (ARRAY['admin','gerente_producao','vendas']::user_role[]))
      WITH CHECK (user_role() = ANY (ARRAY['admin','gerente_producao','vendas']::user_role[]));
  END IF;
END $$;
