-- ============================================================
-- 04_rls.sql
-- Row Level Security em todas as tabelas + helpers em public.
--
-- Helpers:
--   public.user_role()  -> retorna o role do usuário logado (ou NULL)
--   public.is_manager() -> true se admin ou gerente_producao
--
-- Política geral:
--   - admin / gerente_producao: CRUD em tudo
--   - operador: lê tudo; edita OPs/máquinas das próprias máquinas
--                e cria apontamentos pra si próprio
--   - estoquista: CRUD de movimentacoes_estoque; lê o resto
--   - vendas: lê produtos / variações / movimentações; sem edição
--   - todos os usuários autenticados podem editar o próprio perfil
--     (sem alterar role nem ativo)
-- ============================================================

-- ----------------------------------------------------------------
-- Helpers em public (SECURITY DEFINER pra evitar recursão de policy)
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.users WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
      AND role IN ('admin', 'gerente_producao')
  )
$$;

-- ----------------------------------------------------------------
-- ENABLE RLS
-- ----------------------------------------------------------------

ALTER TABLE public.users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.variacoes_produto    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cores                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modelos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tamanhos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maquinas             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordens_producao      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apontamentos_producao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eventos_kanban       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimentacoes_estoque ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------
-- Policies (DROP IF EXISTS antes de CREATE pra ser idempotente)
-- ----------------------------------------------------------------

-- ===== users =====
DROP POLICY IF EXISTS users_select_authenticated ON public.users;
CREATE POLICY users_select_authenticated ON public.users
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL OR public.is_manager());

DROP POLICY IF EXISTS users_manager_all ON public.users;
CREATE POLICY users_manager_all ON public.users
  FOR ALL TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

DROP POLICY IF EXISTS users_self_update ON public.users;
CREATE POLICY users_self_update ON public.users
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = public.user_role()
    AND ativo = (SELECT ativo FROM public.users WHERE id = auth.uid())
  );

-- ===== produtos =====
DROP POLICY IF EXISTS produtos_select_authenticated ON public.produtos;
CREATE POLICY produtos_select_authenticated ON public.produtos
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL OR public.is_manager());

DROP POLICY IF EXISTS produtos_manager_all ON public.produtos;
CREATE POLICY produtos_manager_all ON public.produtos
  FOR ALL TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

-- ===== cores =====
DROP POLICY IF EXISTS cores_select_authenticated ON public.cores;
CREATE POLICY cores_select_authenticated ON public.cores
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL OR public.is_manager());

DROP POLICY IF EXISTS cores_manager_all ON public.cores;
CREATE POLICY cores_manager_all ON public.cores
  FOR ALL TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

-- ===== modelos =====
DROP POLICY IF EXISTS modelos_select_authenticated ON public.modelos;
CREATE POLICY modelos_select_authenticated ON public.modelos
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL OR public.is_manager());

DROP POLICY IF EXISTS modelos_manager_all ON public.modelos;
CREATE POLICY modelos_manager_all ON public.modelos
  FOR ALL TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

-- ===== tamanhos =====
DROP POLICY IF EXISTS tamanhos_select_authenticated ON public.tamanhos;
CREATE POLICY tamanhos_select_authenticated ON public.tamanhos
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL OR public.is_manager());

DROP POLICY IF EXISTS tamanhos_manager_all ON public.tamanhos;
CREATE POLICY tamanhos_manager_all ON public.tamanhos
  FOR ALL TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

-- ===== variacoes_produto =====
DROP POLICY IF EXISTS variacoes_select_authenticated ON public.variacoes_produto;
CREATE POLICY variacoes_select_authenticated ON public.variacoes_produto
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS variacoes_manager_all ON public.variacoes_produto;
CREATE POLICY variacoes_manager_all ON public.variacoes_produto
  FOR ALL TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

-- ===== maquinas =====
DROP POLICY IF EXISTS maquinas_select_authenticated ON public.maquinas;
CREATE POLICY maquinas_select_authenticated ON public.maquinas
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL OR public.is_manager());

DROP POLICY IF EXISTS maquinas_manager_all ON public.maquinas;
CREATE POLICY maquinas_manager_all ON public.maquinas
  FOR ALL TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

DROP POLICY IF EXISTS maquinas_operador_update ON public.maquinas;
CREATE POLICY maquinas_operador_update ON public.maquinas
  FOR UPDATE TO authenticated
  USING (
    public.user_role() = 'operador'
    AND operador_atual_id = auth.uid()
  )
  WITH CHECK (
    public.user_role() = 'operador'
    AND operador_atual_id = auth.uid()
  );

-- ===== ordens_producao =====
DROP POLICY IF EXISTS ordens_select_authenticated ON public.ordens_producao;
CREATE POLICY ordens_select_authenticated ON public.ordens_producao
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL OR public.is_manager());

DROP POLICY IF EXISTS ordens_manager_all ON public.ordens_producao;
CREATE POLICY ordens_manager_all ON public.ordens_producao
  FOR ALL TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

DROP POLICY IF EXISTS ordens_operador_update ON public.ordens_producao;
CREATE POLICY ordens_operador_update ON public.ordens_producao
  FOR UPDATE TO authenticated
  USING (
    public.user_role() = 'operador'
    AND EXISTS (
      SELECT 1 FROM public.maquinas m
      WHERE m.id = ordens_producao.maquina_id
        AND m.operador_atual_id = auth.uid()
    )
  )
  WITH CHECK (
    public.user_role() = 'operador'
    AND EXISTS (
      SELECT 1 FROM public.maquinas m
      WHERE m.id = ordens_producao.maquina_id
        AND m.operador_atual_id = auth.uid()
    )
  );

-- ===== apontamentos_producao =====
DROP POLICY IF EXISTS apontamentos_select_authenticated ON public.apontamentos_producao;
CREATE POLICY apontamentos_select_authenticated ON public.apontamentos_producao
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS apontamentos_manager_all ON public.apontamentos_producao;
CREATE POLICY apontamentos_manager_all ON public.apontamentos_producao
  FOR ALL TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

DROP POLICY IF EXISTS apontamentos_operador_self ON public.apontamentos_producao;
CREATE POLICY apontamentos_operador_self ON public.apontamentos_producao
  FOR ALL TO authenticated
  USING (
    public.user_role() = 'operador'
    AND operador_id = auth.uid()
  )
  WITH CHECK (
    public.user_role() = 'operador'
    AND operador_id = auth.uid()
  );

-- ===== eventos_kanban =====
DROP POLICY IF EXISTS eventos_kanban_select ON public.eventos_kanban;
CREATE POLICY eventos_kanban_select ON public.eventos_kanban
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS eventos_kanban_insert ON public.eventos_kanban;
CREATE POLICY eventos_kanban_insert ON public.eventos_kanban
  FOR INSERT TO authenticated
  WITH CHECK (usuario_id IS NULL OR usuario_id = auth.uid());

-- ===== movimentacoes_estoque =====
DROP POLICY IF EXISTS movimentacoes_select_authenticated ON public.movimentacoes_estoque;
CREATE POLICY movimentacoes_select_authenticated ON public.movimentacoes_estoque
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS movimentacoes_estoquista_write ON public.movimentacoes_estoque;
CREATE POLICY movimentacoes_estoquista_write ON public.movimentacoes_estoque
  FOR ALL TO authenticated
  USING (public.user_role() IN ('admin', 'gerente_producao', 'estoquista'))
  WITH CHECK (public.user_role() IN ('admin', 'gerente_producao', 'estoquista'));
