-- ============================================================
-- 14_apontamento_maquina_opcional.sql
-- No fluxo puxado a OP não tem máquina, então o apontamento de produção
-- também pode não ter. Torna maquina_id opcional.
--
-- Idempotente.
-- ============================================================

ALTER TABLE public.apontamentos_producao
  ALTER COLUMN maquina_id DROP NOT NULL;
