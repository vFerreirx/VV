-- ============================================================
-- 29_movimentacoes_fio.sql
-- Saída (retirada) de fio de um lote. Saldo do lote = lotes_fio.caixas /
-- peso_total_kg menos a soma das saídas aqui. Lançamento imobilizado —
-- sem editar/apagar depois; erro se corrige com um lançamento novo.
--
-- Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.movimentacoes_fio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id uuid NOT NULL REFERENCES public.lotes_fio (id),
  caixas integer NOT NULL,
  -- Peso retirado real (pode não ser proporcional às caixas).
  peso_kg numeric(10, 2) NOT NULL,
  data date NOT NULL,
  motivo text NOT NULL,
  observacao text,
  usuario_id uuid REFERENCES public.users (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS movimentacoes_fio_lote_idx
  ON public.movimentacoes_fio (lote_id);
CREATE INDEX IF NOT EXISTS movimentacoes_fio_data_idx
  ON public.movimentacoes_fio (data);

-- RLS (mesmo padrão de 28_estoque_fios.sql).
ALTER TABLE public.movimentacoes_fio ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS movimentacoes_fio_select ON public.movimentacoes_fio;
CREATE POLICY movimentacoes_fio_select ON public.movimentacoes_fio
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS movimentacoes_fio_write ON public.movimentacoes_fio;
CREATE POLICY movimentacoes_fio_write ON public.movimentacoes_fio
  FOR ALL TO authenticated
  USING (user_role() = ANY (ARRAY['admin','gerente_producao','estoquista']::user_role[]))
  WITH CHECK (user_role() = ANY (ARRAY['admin','gerente_producao','estoquista']::user_role[]));
