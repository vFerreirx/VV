-- ============================================================
-- 15_vendas.sql
-- Registro manual de vendas diárias (não mexe no estoque).
--
-- Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.vendas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id uuid NOT NULL REFERENCES public.produtos (id),
  variacao_id uuid REFERENCES public.variacoes_produto (id),
  quantidade integer NOT NULL,
  canal text NOT NULL,
  data date NOT NULL,
  observacao text,
  usuario_id uuid REFERENCES public.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS vendas_data_idx ON public.vendas (data);

-- `canal` foi removida por 16_vendas_simples.sql (rodada em cima desta
-- versão de vendas já existente). Reaplicar este arquivo do zero contra um
-- banco onde vendas já existe (sem `canal`) não deve tentar indexar uma
-- coluna que não existe mais.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vendas' AND column_name = 'canal'
  ) THEN
    CREATE INDEX IF NOT EXISTS vendas_canal_idx ON public.vendas (canal);
  END IF;
END $$;

ALTER TABLE public.vendas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vendas_select ON public.vendas;
CREATE POLICY vendas_select ON public.vendas
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS vendas_all ON public.vendas;
CREATE POLICY vendas_all ON public.vendas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
