-- ============================================================
-- 52_vendas_pedidos.sql
-- O pedido FINALIZADO vira venda do dia, identificado pelo NÚMERO.
--
-- POR QUE UMA TABELA NOVA, e não uma linha em `vendas_marketplace`:
-- `salvarVendaDiaAction` e `importarVendasCSVAction` APAGAM todas as linhas
-- de vendas_marketplace do dia e regravam a partir do formulário/arquivo.
-- Um lançamento "comum" ali seria varrido no próximo salvamento manual
-- daquele dia, em silêncio. E vendas_marketplace não tem onde guardar o
-- número do pedido — a chave dela é (venda, conta), não (venda, pedido).
--
-- SÃO DUAS GRAVAÇÕES, e cada uma resolve um problema diferente:
--
--   - esta tabela é O DETALHE: uma linha por pedido, com número e cliente;
--   - a linha ESPELHO em vendas_marketplace, na conta 'atacado_pedidos', é
--     O DINHEIRO: é ela que faz o valor entrar no total do dia, na aba
--     Mensal, no relatório por conta e na tendência sem tocar em nenhuma
--     dessas telas. Sem ela a soma das contas para de bater com o total do
--     período — relatorios/actions.ts soma o total de `vendas` e o detalhe
--     por conta de `vendas_marketplace`, e os dois têm que fechar.
--
-- AS DUAS SOMAM O MESMO DINHEIRO, visto de dois jeitos. Ler as duas como
-- parcelas separadas seria contar a venda duas vezes.
--
-- `numero` e `cliente` são SNAPSHOT, do lado do preço e não do peso (ver
-- AGENTS.md): a venda de setembro não pode mudar de nome porque alguém
-- corrigiu o cadastro do cliente em outubro.
--
-- UNIQUE em orcamento_id: um pedido nunca lança duas vezes. É o que torna
-- re-finalizar idempotente — repetir o mesmo status atualiza a linha em vez
-- de criar outra.
--
-- ON DELETE CASCADE dos dois lados: apagar o dia ou apagar o pedido de vez
-- não pode deixar lançamento órfão apontando pra nada.
--
-- VALOR = produtos − desconto, SEM FRETE. Frete é repasse à transportadora;
-- somá-lo infla o faturamento do dia. A conta vive em
-- src/lib/vendas/lancamento-pedido.ts, com os helpers de
-- src/lib/total-pedido.ts.
--
-- Idempotente. Só aditivo: nada de DROP, DELETE, TRUNCATE ou UPDATE.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.vendas_pedidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id uuid NOT NULL REFERENCES public.vendas (id) ON DELETE CASCADE,
  orcamento_id uuid NOT NULL REFERENCES public.orcamentos (id) ON DELETE CASCADE,
  numero integer NOT NULL,
  cliente text NOT NULL,
  quantidade integer NOT NULL DEFAULT 0,
  faturamento numeric(12, 2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vendas_pedidos_venda_idx
  ON public.vendas_pedidos (venda_id);

CREATE UNIQUE INDEX IF NOT EXISTS vendas_pedidos_orcamento_uidx
  ON public.vendas_pedidos (orcamento_id);

-- RLS igual às irmãs `vendas` e `vendas_marketplace` depois da migration 24:
-- admin, gerente de produção e vendas. Tabela nova SEM policy fica
-- inacessível via PostgREST — ver supabase/PLANO-RLS.md.
ALTER TABLE public.vendas_pedidos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'vendas_pedidos'
      AND policyname = 'vendas_pedidos_area_rw'
  ) THEN
    CREATE POLICY vendas_pedidos_area_rw ON public.vendas_pedidos
      FOR ALL TO authenticated
      USING (user_role() = ANY (ARRAY['admin','gerente_producao','vendas']::user_role[]))
      WITH CHECK (user_role() = ANY (ARRAY['admin','gerente_producao','vendas']::user_role[]));
  END IF;
END $$;
