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
-- Obs: Supabase Cloud não permite criar funções no schema auth.
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
-- ENABLE RLS em todas as tabelas de domínio
-- (op_numero_counter NÃO recebe RLS — só o trigger SECURITY DEFINER acessa)
-- ----------------------------------------------------------------

ALTER TABLE public.users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.variacoes_produto    ENABLE ROW LEVEL SECURITY;
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
    -- não pode mudar o próprio role nem o flag ativo
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

-- Operador atualiza status / observacoes da própria máquina
-- (campos efetivamente alteráveis são controlados pela server action).
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

-- Operador edita OPs alocadas em alguma máquina onde ele é operador atual.
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
-- Auditoria: SELECT pra todos autenticados, INSERT pra qualquer um que
-- consiga atualizar a OP referenciada (delegamos pra app).
-- UPDATE/DELETE bloqueados (sem policy = nega tudo, mesmo pra is_manager;
-- por isso adicionamos manager INSERT/SELECT explícitos).
DROP POLICY IF EXISTS eventos_kanban_select ON public.eventos_kanban;
CREATE POLICY eventos_kanban_select ON public.eventos_kanban
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS eventos_kanban_insert ON public.eventos_kanban;
CREATE POLICY eventos_kanban_insert ON public.eventos_kanban
  FOR INSERT TO authenticated
  WITH CHECK (
    -- escreve evento que atribui a si mesmo (ou anônimo, NULL)
    usuario_id IS NULL OR usuario_id = auth.uid()
  );

-- ===== movimentacoes_estoque =====
DROP POLICY IF EXISTS movimentacoes_select_authenticated ON public.movimentacoes_estoque;
CREATE POLICY movimentacoes_select_authenticated ON public.movimentacoes_estoque
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS movimentacoes_estoquista_write ON public.movimentacoes_estoque;
CREATE POLICY movimentacoes_estoquista_write ON public.movimentacoes_estoque
  FOR ALL TO authenticated
  USING (
    public.user_role() IN ('admin', 'gerente_producao', 'estoquista')
  )
  WITH CHECK (
    public.user_role() IN ('admin', 'gerente_producao', 'estoquista')
  );
