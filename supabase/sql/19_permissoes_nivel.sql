-- ============================================================
-- 19_permissoes_nivel.sql
-- Permissões por área passam de liga/desliga (boolean) para 3 níveis:
-- 'nenhum' (desativado), 'ver' (só ver) e 'total' (controle total).
--
-- A tabela estava vazia, então a troca é direta. Idempotente.
-- ============================================================

ALTER TABLE public.permissoes_acesso
  ADD COLUMN IF NOT EXISTS nivel text;

-- `liberado` já pode ter sido removida por uma execução anterior deste
-- arquivo (linha 20). Migra o dado só se a coluna antiga ainda existir —
-- via EXECUTE porque um UPDATE estático referenciando `liberado` falharia
-- no parse mesmo dentro do IF, se a coluna não existisse mais.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'permissoes_acesso'
      AND column_name = 'liberado'
  ) THEN
    EXECUTE $sql$
      UPDATE public.permissoes_acesso
         SET nivel = CASE WHEN liberado THEN 'total' ELSE 'nenhum' END
       WHERE nivel IS NULL
    $sql$;
  END IF;
END $$;

ALTER TABLE public.permissoes_acesso
  ALTER COLUMN nivel SET NOT NULL;

ALTER TABLE public.permissoes_acesso
  DROP COLUMN IF EXISTS liberado;
