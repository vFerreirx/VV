-- ============================================================
-- 26_remessas_full.sql
-- Remessas Full: agrupador de OPs por envio (Full ML/Shopee + data).
-- Cadastra-se o Full e os produtos dentro dele viram OPs com
-- remessa_full_id; a data de envio vira o prazo (data_prevista_fim).
--
-- Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.remessas_full (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canal ordem_canal_destino NOT NULL,
  data_envio date NOT NULL,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS remessas_full_data_idx
  ON public.remessas_full (data_envio);

ALTER TABLE public.ordens_producao
  ADD COLUMN IF NOT EXISTS remessa_full_id uuid REFERENCES public.remessas_full (id);

CREATE INDEX IF NOT EXISTS ordens_remessa_full_idx
  ON public.ordens_producao (remessa_full_id);

ALTER TABLE public.remessas_full ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'remessas_full'
      AND policyname = 'remessas_full_select'
  ) THEN
    CREATE POLICY remessas_full_select ON public.remessas_full
      FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'remessas_full'
      AND policyname = 'remessas_full_manager_write'
  ) THEN
    CREATE POLICY remessas_full_manager_write ON public.remessas_full
      FOR ALL TO authenticated
      USING (is_manager())
      WITH CHECK (is_manager());
  END IF;
END $$;
