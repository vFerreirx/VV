-- ============================================================
-- 19_permissoes_nivel.sql
-- Permissões por área passam de liga/desliga (boolean) para 3 níveis:
-- 'nenhum' (desativado), 'ver' (só ver) e 'total' (controle total).
--
-- A tabela estava vazia, então a troca é direta. Idempotente.
-- ============================================================

ALTER TABLE public.permissoes_acesso
  ADD COLUMN IF NOT EXISTS nivel text;

UPDATE public.permissoes_acesso
   SET nivel = CASE WHEN liberado THEN 'total' ELSE 'nenhum' END
 WHERE nivel IS NULL;

ALTER TABLE public.permissoes_acesso
  ALTER COLUMN nivel SET NOT NULL;

ALTER TABLE public.permissoes_acesso
  DROP COLUMN IF EXISTS liberado;
