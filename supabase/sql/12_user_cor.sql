-- ============================================================
-- 12_user_cor.sql
-- Cor do operador (hex), usada pra colorir os cards dele no kanban.
--
-- Idempotente.
-- ============================================================

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS cor text;
