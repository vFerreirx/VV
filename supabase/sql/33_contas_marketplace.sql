-- ============================================================
-- 33_contas_marketplace.sql
-- Em qual CONTA de marketplace cada envio Full foi feito.
--
-- São 3 contas no Mercado Livre e 3 na Shopee. Os PDFs não dizem qual é:
-- o do ML traz só o número do envio e a Picking List da Shopee só o
-- cabeçalho das colunas. Por isso a conta é ESCOLHIDA na mão, nunca
-- detectada.
--
-- `remessas_full.conta_id` é NULLABLE de propósito: as remessas que já
-- existem não têm conta e não haverá backfill. A obrigatoriedade vive no
-- FORMULÁRIO, não no schema — o banco precisa continuar aceitando o
-- histórico como ele é.
--
-- O índice único (canal, envio_id) de remessas_full NÃO é tocado: os
-- números de envio do ML vêm de uma sequência global e não colidem entre
-- contas, e manter a trava global impede importar o mesmo envio duas
-- vezes por engano em contas diferentes.
--
-- Idempotente. Só aditivo (CREATE TABLE / CREATE INDEX / ADD COLUMN).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.contas_marketplace (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Reaproveita o enum de canal das OPs/remessas. Só full_ml e
  -- full_shopee entram (validado no zod, mesmo padrão de remessas_full).
  canal ordem_canal_destino NOT NULL,
  nome text NOT NULL,
  -- Desligar a conta para de oferecê-la nos formulários sem apagar o
  -- histórico das remessas que já apontam pra ela.
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- Nome único DENTRO do canal, entre as não-excluídas. "Principal" pode
-- existir no ML e na Shopee ao mesmo tempo; duas "Principal" no ML, não.
CREATE UNIQUE INDEX IF NOT EXISTS contas_marketplace_nome_uidx
  ON public.contas_marketplace (canal, nome)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS contas_marketplace_canal_idx
  ON public.contas_marketplace (canal);

-- SET NULL: apagar uma conta nunca pode apagar remessa. A remessa perde a
-- identificação da conta e volta a exibir "sem conta", como as antigas.
ALTER TABLE public.remessas_full
  ADD COLUMN IF NOT EXISTS conta_id uuid
  REFERENCES public.contas_marketplace (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS remessas_full_conta_idx
  ON public.remessas_full (conta_id);

-- RLS (mesmo padrão de 29_movimentacoes_fio.sql).
--
-- A lista de cargos que escrevem é propositalmente mais larga que o
-- nivelPadrao da área: ela é o piso grosso, e quem faz o controle fino é
-- /permissoes + requireAreaEscrita. Se um dia o admin liberar a área pro
-- gerente, a política não pode ser o que impede.
ALTER TABLE public.contas_marketplace ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contas_marketplace_select ON public.contas_marketplace;
CREATE POLICY contas_marketplace_select ON public.contas_marketplace
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS contas_marketplace_write ON public.contas_marketplace;
CREATE POLICY contas_marketplace_write ON public.contas_marketplace
  FOR ALL TO authenticated
  USING (user_role() = ANY (ARRAY['admin','gerente_producao','vendas']::user_role[]))
  WITH CHECK (user_role() = ANY (ARRAY['admin','gerente_producao','vendas']::user_role[]));
