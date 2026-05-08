-- ============================================================
-- 05_realtime.sql
-- Habilita Postgres Changes (Realtime) nas tabelas que o app
-- assina via cliente browser.
--
-- Idempotente: se a tabela já está na publicação, ALTER PUBLICATION
-- ADD TABLE retorna erro 'already exists'. Capturamos com DO block.
-- ============================================================

DO $$
BEGIN
  -- ordens_producao: kanban precisa pra atualizar quando outro usuário move card.
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ordens_producao;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
