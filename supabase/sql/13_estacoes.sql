-- ============================================================
-- 13_estacoes.sql
-- Estações: grupos de máquinas com operador de dia + de noite + cor.
-- Usadas pra colorir os cards do kanban por estação.
--
-- Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.estacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cor text,
  operador_dia_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  operador_noite_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- Nome único entre estações ativas.
CREATE UNIQUE INDEX IF NOT EXISTS estacoes_nome_ativo_uidx
  ON public.estacoes (nome) WHERE deleted_at IS NULL;

-- Máquina pertence a uma estação.
ALTER TABLE public.maquinas
  ADD COLUMN IF NOT EXISTS estacao_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'maquinas_estacao_id_fkey'
  ) THEN
    ALTER TABLE public.maquinas
      ADD CONSTRAINT maquinas_estacao_id_fkey
      FOREIGN KEY (estacao_id) REFERENCES public.estacoes (id) ON DELETE SET NULL;
  END IF;
END $$;

-- RLS (mesmo padrão conservador das demais tabelas de domínio).
ALTER TABLE public.estacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS estacoes_select ON public.estacoes;
CREATE POLICY estacoes_select ON public.estacoes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS estacoes_all ON public.estacoes;
CREATE POLICY estacoes_all ON public.estacoes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
