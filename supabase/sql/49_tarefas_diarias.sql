-- ============================================================
-- 49_tarefas_diarias.sql
-- Tarefas DIÁRIAS: rotinas que voltam a aparecer pendentes todo dia
-- ("conferir perguntas do ML", "baixar relatório de vendas").
--
-- NÃO ACUMULA. Se ninguém fizer hoje, amanhã a diária nasce limpa — não
-- existe dívida nem "pendente de ontem". É checklist do dia, não histórico.
--
-- "FEITA HOJE" NÃO É COLUNA. É `concluida_em` caindo no dia de hoje. Virou o
-- dia, a diária volta pendente sozinha: sem cron, sem job, sem uma linha
-- por dia. Marcar grava now()+usuário; desmarcar zera as duas colunas.
-- É o mesmo raciocínio da prioridade efetiva da tarefa normal (46): o banco
-- guarda o FATO CRU e a regra é aplicada na leitura, toda vez.
--
-- ⚠️ O DIA É O DE BRASÍLIA, NÃO O DO SERVIDOR. Na Vercel o processo roda em
-- UTC, então "hoje" viraria às 21h e uma diária marcada 21h30 contaria como
-- feita amanhã. Quem decide o dia é `src/lib/dia-brasil.ts`, em TS, com um
-- único `hoje` por requisição. Esta tabela guarda só o timestamptz cru —
-- se um dia alguém quiser filtrar por dia AQUI, tem que ser
-- `(concluida_em AT TIME ZONE 'America/Sao_Paulo')::date`, e aí passam a
-- existir duas cópias da regra de fuso. Não faça.
--
-- SEM PRIORIDADE E SEM PRAZO, de propósito. A diária NÃO acende a bolinha
-- do menu (`alertaDeTarefas`) nem entra no painel do dashboard: um aviso
-- que acende toda manhã, sozinho, deixa de ser aviso. A bolinha continua
-- significando "tem pendência de verdade aberta".
--
-- Idempotente. Só aditivo: nada de DROP TABLE, DELETE, TRUNCATE ou UPDATE.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tarefas_diarias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descricao text,

  -- Em quais dias da semana a rotina vale. 0=domingo, igual ao getDay() do
  -- JavaScript e ao EXTRACT(DOW) do Postgres — os três concordam, então não
  -- há conversão em lugar nenhum. Padrão: todos os sete.
  dias_semana smallint[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',

  -- Nulo = nunca foi feita. Não-nulo = feita NAQUELE instante, que só conta
  -- como "feita hoje" se cair no dia de hoje em Brasília. Não existe coluna
  -- booleana separada, pelo mesmo motivo da 35: dois campos pra mesma
  -- verdade saem de sincronia.
  concluida_em timestamptz,
  -- Não guardamos histórico por dia, mas guardamos QUEM: são vários admins e
  -- a pergunta real do dia a dia é "alguém já fez isso hoje?".
  concluida_por uuid REFERENCES public.users (id),
  criado_por uuid REFERENCES public.users (id),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- Igual à 35: feita sem autor (ou autor sem data) é estado impossível.
-- DROP+ADD pra manter o arquivo idempotente.
ALTER TABLE public.tarefas_diarias
  DROP CONSTRAINT IF EXISTS tarefas_diarias_conclusao_ck;
ALTER TABLE public.tarefas_diarias ADD CONSTRAINT tarefas_diarias_conclusao_ck
  CHECK ((concluida_em IS NULL) = (concluida_por IS NULL));

-- Diária que não vale em dia nenhum não apareceria nunca e não teria como
-- ser reencontrada a não ser pela lista "todas". O CHECK cobre range e
-- não-vazio; DUPLICATA (`{1,1}`) ele não pega — Postgres não aceita
-- subquery em CHECK. É inofensiva (a leitura é um `includes`) e quem
-- normaliza é o zod, que ordena e remove repetidos antes de gravar.
ALTER TABLE public.tarefas_diarias
  DROP CONSTRAINT IF EXISTS tarefas_diarias_dias_ck;
ALTER TABLE public.tarefas_diarias ADD CONSTRAINT tarefas_diarias_dias_ck
  CHECK (
    array_length(dias_semana, 1) BETWEEN 1 AND 7
    AND dias_semana <@ ARRAY[0,1,2,3,4,5,6]::smallint[]
  );

-- SEM ÍNDICE, e é decisão, não esquecimento. A 35 indexa `tarefas` porque
-- ela CRESCE com o histórico: cada pendência resolvida vira linha morta que
-- a consulta das abertas precisa pular. Esta tabela não cresce com o uso —
-- é o conjunto fixo de rotinas da casa (unidades, talvez dezenas),
-- justamente porque "feita hoje" não gera linha. A tela lê todas de uma vez
-- e o planner vai de seq scan de qualquer jeito.

-- RLS admin-only, idêntica à 35: a lista é só da administração e não pode
-- ficar legível pro resto da casa nem pela API REST do Supabase. A área
-- `tarefas` é admin-only e não é editável em /permissoes, então a policy e
-- o app dizem a mesma coisa e continuam dizendo.
ALTER TABLE public.tarefas_diarias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tarefas_diarias_select ON public.tarefas_diarias;
CREATE POLICY tarefas_diarias_select ON public.tarefas_diarias
  FOR SELECT TO authenticated
  USING (user_role() = 'admin'::user_role);

DROP POLICY IF EXISTS tarefas_diarias_write ON public.tarefas_diarias;
CREATE POLICY tarefas_diarias_write ON public.tarefas_diarias
  FOR ALL TO authenticated
  USING (user_role() = 'admin'::user_role)
  WITH CHECK (user_role() = 'admin'::user_role);
