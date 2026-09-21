-- ============================================================
-- 68_diaria_automatica.sql
-- DIÁRIA QUE SE MARCA SOZINHA.
--
-- "Cadastrar vendas do dia anterior" é a única das 4 diárias cuja resposta o
-- sistema já sabe: desde o commit 7e15bc8, a tela /vendas cobra sozinha os
-- dias sem lançamento. Pedir que alguém marque um quadradinho pra dizer o que
-- o banco já sabe é pedir duas verdades sobre o mesmo fato — e duas verdades
-- discordam no dia em que alguém esquece de marcar.
--
-- A coluna guarda QUAL automação, e não um booleano: a segunda diária
-- automática vai ter outra fonte, e um `boolean automatica` obrigaria a
-- adivinhar de onde sai a resposta. NULL = diária normal, marcada à mão, que
-- é o caso das outras três.
--
-- ⚠️ O CHECK ESPELHA UMA TUPLA `as const` EM TS (`DIARIAS_AUTOMATICAS`, em
-- src/lib/validators/tarefas.ts) — mesmo padrão dos motivos de parada da
-- máquina (migration 57). Chave nova entra nos dois lugares ou em nenhum:
-- só no banco, o TypeScript não reconhece; só no TS, o INSERT é recusado.
--
-- Backfill pelo TÍTULO EXATO, que é como a diária foi cadastrada à mão. Só
-- onde `automatica IS NULL`, então rodar de novo não desfaz nada — inclusive
-- se alguém apontar essa chave pra outra linha depois.
--
-- Idempotente. Aditiva: nada de DROP, DELETE ou TRUNCATE.
-- ============================================================

ALTER TABLE public.tarefas_diarias
  ADD COLUMN IF NOT EXISTS automatica text;

ALTER TABLE public.tarefas_diarias
  DROP CONSTRAINT IF EXISTS tarefas_diarias_automatica_ck;
ALTER TABLE public.tarefas_diarias
  ADD CONSTRAINT tarefas_diarias_automatica_ck
  CHECK (automatica IS NULL OR automatica IN ('vendas_do_dia_anterior'));

UPDATE public.tarefas_diarias
  SET automatica = 'vendas_do_dia_anterior'
  WHERE automatica IS NULL
    AND deleted_at IS NULL
    AND titulo = 'Cadastrar vendas do dia anterior';

COMMENT ON COLUMN public.tarefas_diarias.automatica IS
  'Qual automação responde por esta diária. NULL = rotina normal, marcada à mão. Ver DIARIAS_AUTOMATICAS em src/lib/validators/tarefas.ts.';
