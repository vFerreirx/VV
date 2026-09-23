-- ============================================================
-- 59_reposicoes_estoque.sql
-- A FILA DE REPOSIÇÃO: peças que alguém avisou que estão acabando, e que
-- terminam em OP.
--
-- O /estoque mostrava saldo, mas nada registra saída — o saldo era maior que
-- o estoque real. Em vez de um número que mente, a tela passa a ser a lista
-- do que precisa ser produzido. O saldo (`movimentacoes_estoque`) continua
-- existindo e recebendo a entrada da baixa; volta a ser mostrado quando as
-- estoquistas usarem o sistema.
--
-- ⚠️ O ESTADO ACOMPANHA A OP, e quem sincroniza é o app
-- (src/lib/db/reposicao-da-op.ts), dentro da mesma transação que muda a OP.
--
-- Idempotente. Só aditivo: nada de DROP TABLE, DELETE, TRUNCATE ou UPDATE.
-- (O único DROP é o do índice de variação ativa, recriado na hora — ver lá.)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.reposicoes_estoque (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id uuid NOT NULL REFERENCES public.produtos (id),
  variacao_id uuid NOT NULL REFERENCES public.variacoes_produto (id),

  -- Texto com CHECK, e não enum: mesmo motivo de maquina_paradas.motivo (57).
  situacao text NOT NULL,
  observacao text,
  marcado_por uuid REFERENCES public.users (id),
  marcado_em timestamptz NOT NULL DEFAULT now(),

  estado text NOT NULL DEFAULT 'aberto',
  -- Sem ON DELETE: a OP só é apagada de vez pela lixeira, que confere
  -- dependências antes.
  ordem_id uuid REFERENCES public.ordens_producao (id),
  reposto_em timestamptz,

  descartado_em timestamptz,
  descartado_por uuid REFERENCES public.users (id),
  motivo_descarte text
);

ALTER TABLE public.reposicoes_estoque
  DROP CONSTRAINT IF EXISTS reposicoes_estoque_situacao_ck;
ALTER TABLE public.reposicoes_estoque
  ADD CONSTRAINT reposicoes_estoque_situacao_ck
  CHECK (situacao IN ('acabando','acabou'));

ALTER TABLE public.reposicoes_estoque
  DROP CONSTRAINT IF EXISTS reposicoes_estoque_estado_ck;
ALTER TABLE public.reposicoes_estoque
  ADD CONSTRAINT reposicoes_estoque_estado_ck
  CHECK (estado IN ('aberto','em_producao','pedido_parceiro','reposto','descartado'));

-- OP ligada: obrigatória em produção, proibida em aberto / pedido ao
-- parceiro / descartado. No 'reposto' pode ter ou não: produto de parceiro
-- chega sem OP (a 72 exige, nesse caso, o registro do pedido).
--
-- ⚠️ ALTERADO AQUI (23/09/2026), e não na 72, pelo mesmo motivo do descarte
-- logo abaixo: este DROP+ADD roda em todo setup e recolocaria a regra antiga
-- — "reposto ⇔ tem OP" — antes da 72, e falharia no primeiro item de
-- parceiro que chegasse. O 'pedido_parceiro' do CHECK de estado, acima, idem.
ALTER TABLE public.reposicoes_estoque
  DROP CONSTRAINT IF EXISTS reposicoes_estoque_ordem_ck;
ALTER TABLE public.reposicoes_estoque
  ADD CONSTRAINT reposicoes_estoque_ordem_ck
  CHECK (
    (estado <> 'em_producao' OR ordem_id IS NOT NULL)
    AND (estado NOT IN ('aberto','pedido_parceiro','descartado') OR ordem_id IS NULL)
  );

ALTER TABLE public.reposicoes_estoque
  DROP CONSTRAINT IF EXISTS reposicoes_estoque_reposto_ck;
ALTER TABLE public.reposicoes_estoque
  ADD CONSTRAINT reposicoes_estoque_reposto_ck
  CHECK ((estado = 'reposto') = (reposto_em IS NOT NULL));

-- Descarte: data e autor andam juntos. O motivo é OPCIONAL: só pode existir
-- num item descartado e, quando existe, não pode ser vazio.
--
-- ⚠️ ALTERADO NO PRÓPRIO 59 (16/09/2026), e não num 60. Na primeira versão o
-- motivo era obrigatório. Como o db:setup roda todos os arquivos em ordem, um
-- 60 separado não bastaria: este DROP+ADD recolocaria a regra antiga antes
-- dele, e falharia assim que existisse um descarte sem motivo.
ALTER TABLE public.reposicoes_estoque
  DROP CONSTRAINT IF EXISTS reposicoes_estoque_descarte_ck;
ALTER TABLE public.reposicoes_estoque
  ADD CONSTRAINT reposicoes_estoque_descarte_ck
  CHECK (
    (estado = 'descartado') = (descartado_em IS NOT NULL)
    AND (descartado_em IS NULL) = (descartado_por IS NULL)
    AND (
      motivo_descarte IS NULL
      OR (descartado_em IS NOT NULL AND length(btrim(motivo_descarte)) > 0)
    )
  );

-- ⚠️ NO MÁXIMO UM ITEM ATIVO POR VARIAÇÃO. Índice, e não checagem na action:
-- duas pessoas marcando a mesma peça ao mesmo tempo passam por qualquer
-- verificação feita antes do INSERT.
--
-- 'pedido_parceiro' é ATIVO como 'em_producao': pediu e ainda não chegou.
-- Sem ele no predicado, marcar a peça de novo abriria um segundo item.
-- `CREATE INDEX IF NOT EXISTS` não atualiza um predicado antigo, então o
-- índice da versão anterior (sem 'pedido_parceiro') é derrubado uma vez,
-- aqui, e recriado com o predicado novo. Nos setups seguintes nada acontece.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname = 'reposicoes_estoque_variacao_ativa_uidx'
       AND indexdef NOT LIKE '%pedido_parceiro%'
  ) THEN
    DROP INDEX public.reposicoes_estoque_variacao_ativa_uidx;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS reposicoes_estoque_variacao_ativa_uidx
  ON public.reposicoes_estoque (variacao_id)
  WHERE estado IN ('aberto','em_producao','pedido_parceiro');

-- Uma OP atende um item só.
CREATE UNIQUE INDEX IF NOT EXISTS reposicoes_estoque_ordem_uidx
  ON public.reposicoes_estoque (ordem_id)
  WHERE ordem_id IS NOT NULL;

-- A fila (estado ativo, mais antigo primeiro) e os atendidos recentes.
CREATE INDEX IF NOT EXISTS reposicoes_estoque_estado_idx
  ON public.reposicoes_estoque (estado, marcado_em);

-- RLS: todos leem; gestão e estoquista escrevem; ninguém apaga.
ALTER TABLE public.reposicoes_estoque ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reposicoes_estoque_select ON public.reposicoes_estoque;
CREATE POLICY reposicoes_estoque_select ON public.reposicoes_estoque
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS reposicoes_estoque_insert ON public.reposicoes_estoque;
CREATE POLICY reposicoes_estoque_insert ON public.reposicoes_estoque
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.is_manager() OR public.user_role() = 'estoquista')
    AND (marcado_por IS NULL OR marcado_por = auth.uid())
  );

DROP POLICY IF EXISTS reposicoes_estoque_update ON public.reposicoes_estoque;
CREATE POLICY reposicoes_estoque_update ON public.reposicoes_estoque
  FOR UPDATE TO authenticated
  USING (public.is_manager() OR public.user_role() = 'estoquista')
  WITH CHECK (public.is_manager() OR public.user_role() = 'estoquista');
