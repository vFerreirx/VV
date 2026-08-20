-- ============================================================
-- 46_tarefa_prioridade.sql
-- Tarefa da administração passa a ter PRIORIDADE, com os mesmos quatro
-- níveis da OP: baixa / normal / alta / urgente.
--
-- ENUM NOVO, e não `ordem_prioridade` reaproveitado. Os valores são
-- idênticos e a tentação é óbvia, mas um tipo chamado "ordem" numa tabela de
-- tarefas confunde pra sempre — e no dia que a produção precisar de um nível
-- a mais ('parada'?), a tarefa herdaria em silêncio. Criar enum é barato;
-- desfazer o acoplamento não é.
--
-- A ORDEM DE DECLARAÇÃO É A ORDEM DE COMPARAÇÃO no Postgres, então
-- `ORDER BY prioridade DESC` devolve urgente primeiro sem CASE nenhum. É
-- disso que a lista da tela e a consulta do menu vivem. Mexer na ordem aqui
-- muda as duas.
--
-- DEFAULT 'normal', NOT NULL: as tarefas que já existem nascem em normal,
-- que é a verdade sobre elas — ninguém as marcou de nada. Nenhuma linha
-- precisa de UPDATE.
--
-- Usar o valor 'normal' logo depois do CREATE TYPE funciona porque o tipo
-- nasce nesta MESMA transação; a restrição do Postgres que o
-- `41_orcamento_status.sql` documenta vale pra ALTER TYPE ... ADD VALUE em
-- tipo preexistente, que não é o caso aqui.
--
-- Idempotente. Só aditivo: nada de DROP, DELETE, TRUNCATE ou UPDATE.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'tarefa_prioridade'
  ) THEN
    CREATE TYPE public.tarefa_prioridade AS ENUM
      ('baixa', 'normal', 'alta', 'urgente');
  END IF;
END $$;

ALTER TABLE public.tarefas
  ADD COLUMN IF NOT EXISTS prioridade public.tarefa_prioridade
  NOT NULL DEFAULT 'normal';

-- O MENU consulta isto em TODA navegação: "existe tarefa aberta de
-- prioridade alta ou urgente?". Índice parcial só das abertas, ordenado por
-- prioridade — a consulta vira `ORDER BY prioridade DESC LIMIT 1` e lê UMA
-- entrada, independente de quantas tarefas concluídas houver no histórico.
--
-- O mesmo índice serve a lista da tela, que ordena por prioridade primeiro.
-- O `tarefas_pendentes_idx` (35) continua existindo pro caminho por prazo.
CREATE INDEX IF NOT EXISTS tarefas_abertas_prioridade_idx
  ON public.tarefas (prioridade DESC)
  WHERE concluida_em IS NULL AND deleted_at IS NULL;
