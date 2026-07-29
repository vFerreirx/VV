-- ============================================================
-- 28_estoque_fios.sql
-- Controle de estoque de fios. `cores_fornecedor_fio` é o de-para entre a
-- cor que o FORNECEDOR usa e a cor equivalente do nosso catálogo (`cores`).
-- `lotes_fio` é a entrada de lote. Saída/saldo em 29_movimentacoes_fio.sql.
--
-- Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cores_fornecedor_fio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_fornecedor text NOT NULL,
  cor_id uuid NOT NULL REFERENCES public.cores (id),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS cores_fornecedor_fio_cor_idx
  ON public.cores_fornecedor_fio (cor_id);

-- Nome do fornecedor único entre as não-excluídas.
CREATE UNIQUE INDEX IF NOT EXISTS cores_fornecedor_fio_nome_uidx
  ON public.cores_fornecedor_fio (nome_fornecedor) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.lotes_fio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_lote text NOT NULL,
  cor_fornecedor_id uuid NOT NULL REFERENCES public.cores_fornecedor_fio (id),
  caixas integer NOT NULL,
  -- Peso total real do lote (padrão caixas×32kg sugerido na tela, mas
  -- ajustável quando o lote vem mais leve).
  peso_total_kg numeric(10, 2) NOT NULL,
  -- Valor total do lote em R$. R$/kg é derivado (valor_total ÷ peso_total_kg)
  -- só pra exibição — não fica armazenado.
  valor_total numeric(12, 2) NOT NULL,
  vendedor text NOT NULL,
  data_entrada date NOT NULL,
  vencimento_pagamento date NOT NULL,
  nota_fiscal text,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS lotes_fio_cor_fornecedor_idx
  ON public.lotes_fio (cor_fornecedor_id);
CREATE INDEX IF NOT EXISTS lotes_fio_data_entrada_idx
  ON public.lotes_fio (data_entrada);

-- RLS (mesmo padrão conservador das demais tabelas de domínio: leitura
-- autenticada, escrita restrita por cargo). O app acessa via role postgres
-- server-side; RLS aqui só limita acesso direto à API REST do Supabase.
ALTER TABLE public.cores_fornecedor_fio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lotes_fio ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cores_fornecedor_fio_select ON public.cores_fornecedor_fio;
CREATE POLICY cores_fornecedor_fio_select ON public.cores_fornecedor_fio
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS cores_fornecedor_fio_write ON public.cores_fornecedor_fio;
CREATE POLICY cores_fornecedor_fio_write ON public.cores_fornecedor_fio
  FOR ALL TO authenticated
  USING (user_role() = ANY (ARRAY['admin','gerente_producao','estoquista']::user_role[]))
  WITH CHECK (user_role() = ANY (ARRAY['admin','gerente_producao','estoquista']::user_role[]));

DROP POLICY IF EXISTS lotes_fio_select ON public.lotes_fio;
CREATE POLICY lotes_fio_select ON public.lotes_fio
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS lotes_fio_write ON public.lotes_fio;
CREATE POLICY lotes_fio_write ON public.lotes_fio
  FOR ALL TO authenticated
  USING (user_role() = ANY (ARRAY['admin','gerente_producao','estoquista']::user_role[]))
  WITH CHECK (user_role() = ANY (ARRAY['admin','gerente_producao','estoquista']::user_role[]));
