-- ============================================================
-- 10_eventos_full.sql
-- Tabela de eventos de envio pro Full (ML/Shopee) usada no calendário.
--
-- Idempotente: CREATE TABLE / INDEX IF NOT EXISTS.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.eventos_full (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL,
  canal text NOT NULL,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS eventos_full_data_idx ON public.eventos_full (data);

-- RLS: habilita e permite acesso a usuários autenticados (mesmo padrão
-- conservador das demais tabelas de domínio).
ALTER TABLE public.eventos_full ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "eventos_full_select" ON public.eventos_full;
CREATE POLICY "eventos_full_select" ON public.eventos_full
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "eventos_full_all" ON public.eventos_full;
CREATE POLICY "eventos_full_all" ON public.eventos_full
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
