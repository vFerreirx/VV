-- ============================================================
-- 24_rls_fechar_buracos.sql
-- Fecha as políticas RLS abertas (USING true) das tabelas criadas depois
-- do 04_rls.sql. Ver supabase/PLANO-RLS.md pro roteiro de aplicação.
--
-- ⚠️ NÃO APLICAR sem seguir o roteiro (backup ok + smoke test depois).
--
-- O app NÃO usa essas políticas (todo acesso é server-side via role
-- postgres); elas só limitam acesso direto à API REST do Supabase.
-- Usa os helpers is_manager() e user_role() criados no 04_rls.sql.
-- Idempotente.
-- ============================================================

-- --------------------------------------------------------------
-- permissoes_acesso: leitura autenticada, escrita SÓ admin
-- (era o buraco crítico: qualquer usuário podia se auto-conceder acesso)
-- --------------------------------------------------------------
DROP POLICY IF EXISTS permissoes_acesso_authenticated ON public.permissoes_acesso;
DROP POLICY IF EXISTS permissoes_acesso_select ON public.permissoes_acesso;
DROP POLICY IF EXISTS permissoes_acesso_admin_write ON public.permissoes_acesso;

CREATE POLICY permissoes_acesso_select ON public.permissoes_acesso
  FOR SELECT TO authenticated USING (true);
CREATE POLICY permissoes_acesso_admin_write ON public.permissoes_acesso
  FOR ALL TO authenticated
  USING (user_role() = 'admin'::user_role)
  WITH CHECK (user_role() = 'admin'::user_role);

-- --------------------------------------------------------------
-- vendas + vendas_marketplace: leitura e escrita admin/gerente/vendas
-- --------------------------------------------------------------
DROP POLICY IF EXISTS vendas_all ON public.vendas;
DROP POLICY IF EXISTS vendas_select ON public.vendas;
DROP POLICY IF EXISTS vendas_area_rw ON public.vendas;

CREATE POLICY vendas_area_rw ON public.vendas
  FOR ALL TO authenticated
  USING (user_role() = ANY (ARRAY['admin','gerente_producao','vendas']::user_role[]))
  WITH CHECK (user_role() = ANY (ARRAY['admin','gerente_producao','vendas']::user_role[]));

DROP POLICY IF EXISTS vendas_marketplace_authenticated ON public.vendas_marketplace;
DROP POLICY IF EXISTS vendas_marketplace_area_rw ON public.vendas_marketplace;

CREATE POLICY vendas_marketplace_area_rw ON public.vendas_marketplace
  FOR ALL TO authenticated
  USING (user_role() = ANY (ARRAY['admin','gerente_producao','vendas']::user_role[]))
  WITH CHECK (user_role() = ANY (ARRAY['admin','gerente_producao','vendas']::user_role[]));

-- --------------------------------------------------------------
-- estacoes: leitura autenticada (kanban usa cor/nome), escrita gerência
-- --------------------------------------------------------------
DROP POLICY IF EXISTS estacoes_all ON public.estacoes;
DROP POLICY IF EXISTS estacoes_select ON public.estacoes;
DROP POLICY IF EXISTS estacoes_manager_write ON public.estacoes;

CREATE POLICY estacoes_select ON public.estacoes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY estacoes_manager_write ON public.estacoes
  FOR ALL TO authenticated
  USING (is_manager())
  WITH CHECK (is_manager());

-- --------------------------------------------------------------
-- eventos_full (calendário): leitura autenticada, escrita adm/ger/vendas
-- --------------------------------------------------------------
DROP POLICY IF EXISTS eventos_full_all ON public.eventos_full;
DROP POLICY IF EXISTS eventos_full_select ON public.eventos_full;
DROP POLICY IF EXISTS eventos_full_area_write ON public.eventos_full;

CREATE POLICY eventos_full_select ON public.eventos_full
  FOR SELECT TO authenticated USING (true);
CREATE POLICY eventos_full_area_write ON public.eventos_full
  FOR ALL TO authenticated
  USING (user_role() = ANY (ARRAY['admin','gerente_producao','vendas']::user_role[]))
  WITH CHECK (user_role() = ANY (ARRAY['admin','gerente_producao','vendas']::user_role[]));

-- --------------------------------------------------------------
-- kits + kit_itens: leitura autenticada, escrita gerência
-- --------------------------------------------------------------
DROP POLICY IF EXISTS kits_authenticated ON public.kits;
DROP POLICY IF EXISTS kits_select ON public.kits;
DROP POLICY IF EXISTS kits_manager_write ON public.kits;

CREATE POLICY kits_select ON public.kits
  FOR SELECT TO authenticated USING (true);
CREATE POLICY kits_manager_write ON public.kits
  FOR ALL TO authenticated
  USING (is_manager())
  WITH CHECK (is_manager());

DROP POLICY IF EXISTS kit_itens_authenticated ON public.kit_itens;
DROP POLICY IF EXISTS kit_itens_select ON public.kit_itens;
DROP POLICY IF EXISTS kit_itens_manager_write ON public.kit_itens;

CREATE POLICY kit_itens_select ON public.kit_itens
  FOR SELECT TO authenticated USING (true);
CREATE POLICY kit_itens_manager_write ON public.kit_itens
  FOR ALL TO authenticated
  USING (is_manager())
  WITH CHECK (is_manager());

-- ============================================================
-- ROLLBACK (por tabela, se algo quebrar — recria a política aberta):
--
-- CREATE POLICY <tabela>_authenticated ON public.<tabela>
--   FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- ============================================================
