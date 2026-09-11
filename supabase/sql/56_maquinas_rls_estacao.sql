-- ============================================================
-- 56_maquinas_rls_estacao.sql
-- A policy de UPDATE do operador sobre `maquinas` passa a seguir a ESTAÇÃO,
-- e não o campo `operador_atual_id`.
--
-- POR QUÊ: o campo virou dado morto. Em 3 das 18 máquinas ele aponta pra um
-- usuário APAGADO e inativo ("Operador de Tear"), e os três operadores reais
-- não são `operador_atual` de nenhuma — eles vivem em `estacao_operadores`,
-- que é o que o app usa desde a migration 50 pra decidir o que o operador
-- enxerga e o que ele pode mover na produção.
--
-- A policy antiga é INÓCUA HOJE: concede a quem não consegue nem logar. Mas
-- ela volta a conceder no dia em que alguém preencher o campo de novo — e
-- preencher um campo de cadastro é coisa que se faz sem pensar em permissão.
-- Regra de autorização que depende de um campo que ninguém mantém é uma
-- porta que se abre sozinha.
--
-- ⚠️ A COLUNA CONTINUA, E OS DADOS TAMBÉM. Isto não derruba coluna nem apaga
-- linha: `operador_atual_id` fica no banco como histórico, igual a
-- `produtos.peso_gramas` e a `estacoes.operador_dia_id`. O que muda é quem
-- manda, não o que está guardado.
--
-- ⚠️ O ÚNICO VERBO DESTRUTIVO AQUI É O `DROP POLICY`, e ele troca uma
-- autorização em produção — foi aprovado explicitamente. A policy nova é
-- criada logo abaixo, com nome novo pra que a troca fique legível no
-- `pg_policies` de quem for auditar depois.
--
-- Idempotente. Nada de DROP TABLE, DELETE, TRUNCATE ou UPDATE.
-- ============================================================

DROP POLICY IF EXISTS maquinas_operador_update ON public.maquinas;

DROP POLICY IF EXISTS maquinas_operador_estacao_update ON public.maquinas;
CREATE POLICY maquinas_operador_estacao_update ON public.maquinas
  FOR UPDATE TO authenticated
  USING (
    public.user_role() = 'operador'
    AND EXISTS (
      SELECT 1 FROM public.estacao_operadores eo
      WHERE eo.operador_id = auth.uid()
        AND eo.estacao_id = public.maquinas.estacao_id
    )
  )
  WITH CHECK (
    public.user_role() = 'operador'
    AND EXISTS (
      SELECT 1 FROM public.estacao_operadores eo
      WHERE eo.operador_id = auth.uid()
        AND eo.estacao_id = public.maquinas.estacao_id
    )
  );

COMMENT ON COLUMN public.maquinas.operador_atual_id IS
  'LEGADO. Nao e lido nem escrito pelo app desde a fase 2 da revisao de Maquinas: quem responde "este operador manda nesta maquina" e estacao_operadores. Mantido por historico; nao volte a preencher esperando que conceda permissao.';
