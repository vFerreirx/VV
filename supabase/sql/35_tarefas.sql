-- ============================================================
-- 35_tarefas.sql
-- Lista de tarefas da ADMINISTRAÇÃO — pendências de gestão comercial dos
-- marketplaces ("criar promoção do mês", "cadastrar anúncio novo").
--
-- Não tem nada a ver com produção: o kanban de OPs cuida daquilo e as duas
-- coisas não se misturam.
--
-- A lista é COMPARTILHADA entre os admins: não há atribuição a pessoa, quem
-- fizer marca como concluída. Como são vários admins, a tarefa guarda quem
-- concluiu e quando — senão ninguém sabe quem fez.
--
-- O estado vive em `concluida_em` (nulo = pendente), sem booleano separado:
-- dois campos pra mesma verdade saem de sincronia mais cedo ou mais tarde.
--
-- Idempotente. Só aditivo (CREATE TABLE / CREATE INDEX).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tarefas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descricao text,
  -- Prazo é OPCIONAL: boa parte das pendências não tem data.
  prazo date,
  -- Conta de marketplace da tarefa ("promoção em qual das 6 contas?").
  -- Opcional: existem tarefas gerais. SET NULL porque apagar uma conta
  -- nunca pode apagar tarefa.
  conta_id uuid REFERENCES public.contas_marketplace (id) ON DELETE SET NULL,
  -- Nulo = pendente. É o único estado; não existe coluna `concluida`.
  concluida_em timestamptz,
  concluida_por uuid REFERENCES public.users (id),
  criado_por uuid REFERENCES public.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- Concluída sem autor (ou autor sem data) é estado impossível: as duas
-- colunas andam juntas. DROP+ADD pra manter o arquivo idempotente.
ALTER TABLE public.tarefas DROP CONSTRAINT IF EXISTS tarefas_conclusao_ck;
ALTER TABLE public.tarefas ADD CONSTRAINT tarefas_conclusao_ck
  CHECK ((concluida_em IS NULL) = (concluida_por IS NULL));

-- A consulta da tela e a do painel são a mesma: pendentes por prazo. O
-- índice parcial cobre as duas e ignora o histórico de concluídas.
CREATE INDEX IF NOT EXISTS tarefas_pendentes_idx
  ON public.tarefas (prazo)
  WHERE concluida_em IS NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS tarefas_conta_idx ON public.tarefas (conta_id);

-- RLS — leitura restrita por cargo, como em 31_compradores.sql. As tabelas
-- operacionais usam `USING (true)`; esta não pode, porque a lista é só da
-- administração e não deve ficar legível pro resto da casa nem via API
-- REST do Supabase.
--
-- Aqui, ao contrário das outras, a policy NÃO é um piso mais largo que o
-- app: a área é admin-only e não é editável em /permissoes, então as duas
-- camadas dizem a mesma coisa e continuam dizendo.
ALTER TABLE public.tarefas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tarefas_select ON public.tarefas;
CREATE POLICY tarefas_select ON public.tarefas
  FOR SELECT TO authenticated
  USING (user_role() = 'admin'::user_role);

DROP POLICY IF EXISTS tarefas_write ON public.tarefas;
CREATE POLICY tarefas_write ON public.tarefas
  FOR ALL TO authenticated
  USING (user_role() = 'admin'::user_role)
  WITH CHECK (user_role() = 'admin'::user_role);
