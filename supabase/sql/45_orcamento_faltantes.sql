-- ============================================================
-- 45_orcamento_faltantes.sql
-- Itens FALTANTES do pedido: o que a separação não achou e precisa ser
-- produzido. Hoje isso virava um pedido paralelo de mentira só pra registrar
-- o que fazer.
--
-- A MARCAÇÃO É MANUAL, e de propósito. O sistema não sabe o que tem em
-- estoque — `movimentacoes_estoque` está vazia —, então qualquer inferência
-- daria número errado com cara de certo. Quem separa percorre a via e digita
-- o que não achou.
--
-- A LINHA É A DA VIA DE SEPARAÇÃO, não o item do pedido. O que falta é uma
-- capa específica de dentro do kit, não o kit inteiro — e a via já explode o
-- kit em componentes, resolve o tamanho real de cada peça e SOMA linhas
-- iguais vindas de itens diferentes. Por isso não há FK com `orcamento_itens`:
-- uma linha da via pode vir de vários itens ao mesmo tempo.
--
-- `chave` é o trio produto|tamanho|cor NORMALIZADO (sem espaço sobrando, sem
-- diferença de caixa), montado por src/lib/separacao.ts. Ela existe pra NÃO
-- depender do texto da descrição, que é de exibição e muda de formato:
-- guardar a descrição como chave faria a marcação sumir em silêncio no dia
-- que o documento mudasse. Linha sem trio confiável (item antigo sem
-- `produto_id`, texto escrito à mão) recebe chave com prefixo `?|` seguido da
-- descrição normalizada — tão frágil quanto o texto, mas VISÍVEL como
-- exceção em vez de fingir estrutura que não há. O bloco "A CHAVE DA LINHA"
-- em src/lib/separacao.ts explica a regra inteira; leia antes de mexer.
--
-- `descricao` NÃO é chave: é snapshot do texto que estava na tela quando
-- alguém marcou, pra dar nome à marcação órfã (o item saiu do pedido depois).
--
-- Escrita segue a área de VENDAS, igual a `orcamentos`/`orcamento_itens`
-- (25_orcamentos.sql) — marcar faltante é parte de tocar o pedido.
--
-- Idempotente. Só aditivo: nada de DROP, DELETE, TRUNCATE ou UPDATE.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.orcamento_faltantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orcamento_id uuid NOT NULL REFERENCES public.orcamentos (id) ON DELETE CASCADE,
  chave text NOT NULL,
  descricao text NOT NULL,
  -- Sempre > 0: "não falta nada" é a AUSÊNCIA da linha, não um zero guardado.
  -- Assim a existência da linha já é a resposta, e a lista de pedidos pode
  -- perguntar "tem faltante?" sem filtrar quantidade.
  quantidade integer NOT NULL CHECK (quantidade > 0),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Uma marcação por linha da via, dentro do pedido. Também é o índice de
-- leitura: `orcamento_id` é o prefixo à esquerda, então buscar os faltantes
-- de um pedido usa este mesmo índice e não precisa de outro.
CREATE UNIQUE INDEX IF NOT EXISTS orcamento_faltantes_linha_uidx
  ON public.orcamento_faltantes (orcamento_id, chave);

ALTER TABLE public.orcamento_faltantes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'orcamento_faltantes'
      AND policyname = 'orcamento_faltantes_area_rw'
  ) THEN
    CREATE POLICY orcamento_faltantes_area_rw ON public.orcamento_faltantes
      FOR ALL TO authenticated
      USING (user_role() = ANY (ARRAY['admin','gerente_producao','vendas']::user_role[]))
      WITH CHECK (user_role() = ANY (ARRAY['admin','gerente_producao','vendas']::user_role[]));
  END IF;
END $$;
