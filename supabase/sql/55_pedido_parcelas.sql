-- ============================================================
-- 55_pedido_parcelas.sql
-- PARCELAS do pedido: os vencimentos de boleto/cheque, pra dar pra lembrar
-- de conferir se o dinheiro caiu no dia certo.
--
-- Hoje `orcamentos` guarda só COMO se paga (`pagamento_forma`) e quanto de
-- desconto (51_pagamento_pedido.sql) — data de vencimento não existe em
-- lugar nenhum, então não há do que lembrar. Esta tabela é a data.
--
-- VOCABULÁRIO: na tela isso se chama PEDIDO (a rota é /pedidos); no banco
-- continua `orcamento`, igual a `orcamento_itens` e `orcamento_faltantes`.
-- O bloco no topo de src/lib/db/schema/orcamentos.ts explica por quê.
--
-- ⚠️ ESCRITA SEGUE A ÁREA DE VENDAS, igual às irmãs (25_orcamentos.sql e
-- 45_orcamento_faltantes.sql) — e NÃO o `USING (true)` de
-- 50_estacao_operadores.sql. Parcela é financeiro: o operador do chão de
-- fábrica não tem o que fazer aqui, e a política mais frouxa entraria como
-- se fosse padrão da casa quando não é.
--
-- Idempotente. Só aditivo: nada de DROP TABLE, DELETE, TRUNCATE ou UPDATE.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.orcamento_parcelas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orcamento_id uuid NOT NULL
    REFERENCES public.orcamentos (id) ON DELETE CASCADE,

  -- 1..N, a ordem em que aparecem na tela. Não é identidade de propósito:
  -- regerar as parcelas recomeça do 1, e o que precisa ser único é o par
  -- (orcamento_id, numero) — ver o índice abaixo.
  numero smallint NOT NULL CHECK (numero >= 1),

  -- `date`, e não timestamptz: vencimento é um DIA, sem hora e sem fuso.
  -- Virar timestamp traria o fuso do servidor junto e a parcela venceria
  -- cedo ou tarde demais — é o mesmo erro que o comentário de `estaVencida`
  -- (src/lib/validators/tarefas.ts) descreve por extenso: na Vercel o
  -- servidor é UTC, então das 21h à meia-noite ele já acha que é amanhã.
  vencimento date NOT NULL,

  -- Sempre > 0: parcela de zero não é parcela. "Este pedido não tem
  -- parcelas" é a AUSÊNCIA das linhas, não um zero guardado — mesma regra
  -- da quantidade em orcamento_faltantes.
  valor numeric(12,2) NOT NULL CHECK (valor > 0),

  -- Nº do boleto, nº e banco do cheque. Texto livre de propósito: serve pra
  -- achar o papel, não é dado estruturado que alguém vá consultar.
  observacao text,

  -- ESTADO DA PARCELA. Nulo = pendente. Não existe coluna booleana separada
  -- de propósito: dois campos pra mesma verdade saem de sincronia — o
  -- comentário em src/lib/db/schema/tarefas.ts explica, e é de lá que este
  -- par (data + autor) vem.
  recebido_em timestamptz,
  recebido_por uuid REFERENCES public.users (id),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Recebida sem autor (ou autor sem data) é estado impossível: as duas
-- colunas andam juntas. DROP+ADD pra manter o arquivo idempotente — mesmo
-- idioma de `tarefas_conclusao_ck` em 35_tarefas.sql.
ALTER TABLE public.orcamento_parcelas
  DROP CONSTRAINT IF EXISTS orcamento_parcelas_recebimento_ck;
ALTER TABLE public.orcamento_parcelas
  ADD CONSTRAINT orcamento_parcelas_recebimento_ck
  CHECK ((recebido_em IS NULL) = (recebido_por IS NULL));

-- Uma parcela por número dentro do pedido. É também o índice de LEITURA do
-- painel: `orcamento_id` é o prefixo à esquerda, então listar as parcelas de
-- um pedido já na ordem usa este mesmo índice e não precisa de outro.
CREATE UNIQUE INDEX IF NOT EXISTS orcamento_parcelas_numero_uidx
  ON public.orcamento_parcelas (orcamento_id, numero);

-- A CONSULTA DO SINO, e só ela: "quais parcelas ainda não foram recebidas e
-- já venceram?". PARCIAL porque o histórico de recebidas só cresce e não
-- interessa a essa pergunta — mesmo desenho de `tarefas_pendentes_idx`.
CREATE INDEX IF NOT EXISTS orcamento_parcelas_pendentes_idx
  ON public.orcamento_parcelas (vencimento)
  WHERE recebido_em IS NULL;

-- ------------------------------------------------------------
-- RLS (o padrão das irmãs do pedido, não o de estacao_operadores)
-- ------------------------------------------------------------
ALTER TABLE public.orcamento_parcelas ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'orcamento_parcelas'
      AND policyname = 'orcamento_parcelas_area_rw'
  ) THEN
    CREATE POLICY orcamento_parcelas_area_rw ON public.orcamento_parcelas
      FOR ALL TO authenticated
      USING (user_role() = ANY (ARRAY['admin','gerente_producao','vendas']::user_role[]))
      WITH CHECK (user_role() = ANY (ARRAY['admin','gerente_producao','vendas']::user_role[]));
  END IF;
END $$;

-- ------------------------------------------------------------
-- REALTIME
-- ------------------------------------------------------------
-- O sino de notificações deriva o lembrete de "conferir se o dinheiro caiu"
-- do estado das parcelas. Sem isto o badge só recalcularia na próxima
-- navegação — quem desse baixa numa aba veria o aviso continuar aceso na
-- outra até trocar de página.
--
-- ⚠️ PUBLICA AQUI, e não em 05_realtime.sql, porque os NN_*.sql rodam em
-- ordem alfabética: lá a tabela ainda não existe e o ALTER levanta
-- `undefined_table`, que o EXCEPTION de lá não captura — derrubando o setup
-- inteiro. Descobri isso do jeito difícil.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.orcamento_parcelas;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
