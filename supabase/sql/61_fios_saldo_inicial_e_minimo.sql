-- ============================================================
-- 61_fios_saldo_inicial_e_minimo.sql
-- O QUE É SALDO INICIAL E QUANTO É POUCO.
--
-- Duas colunas, dois problemas diferentes da tela de fios:
--
-- 1) SALDO INICIAL. Os 51 lotes de hoje não são entradas: são a foto da
--    prateleira no dia em que a planilha virou sistema (importados em
--    12/08/2026, todos com data de entrada 31/08/2025). Misturados com as
--    entradas de verdade, o livro de entradas nunca fica vazio e ninguém
--    percebe que desde então NÃO ENTROU NADA. Marcados, o livro nasce vazio e
--    conta a verdade, e o estoque continua contando os 51.
--
--    O backfill é pela observação que o próprio import gravou
--    ("Importado da planilha de fios (linha N)."). Conferido antes de
--    escrever: 51 lotes na tabela, 51 com essa observação, 51 não apagados
--    — ou seja, marca todos e não sobra nenhum lote "de verdade" marcado por
--    engano. Entrada nova nasce `false` pelo default.
--
-- 2) MÍNIMO POR COR, em CAIXAS. Caixa é o que se conta na prateleira; o kg é
--    consequência do que sobrou dentro delas. O kg aparece ao lado, como
--    referência, mas quem dispara o aviso é a caixa.
--
--    NULL quer dizer "não tem mínimo", nunca zero — mesma regra do valor do
--    lote (`valor_total`): zero é um número e mente, dizendo "o mínimo é
--    zero, então nunca avise". Por isso o CHECK aceita NULL ou > 0.
--
-- Sem tabela separada de mínimos: o mínimo é atributo da cor do fornecedor,
-- que é onde ele já é cadastrado e onde o de-para mora.
--
-- Idempotente. Só aditivo: nada de DROP TABLE, DELETE, TRUNCATE.
-- O único UPDATE é o backfill, que escreve numa coluna criada agora e só
-- onde ela ainda está no default.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Saldo inicial
-- ------------------------------------------------------------

ALTER TABLE public.lotes_fio
  ADD COLUMN IF NOT EXISTS saldo_inicial boolean NOT NULL DEFAULT false;

UPDATE public.lotes_fio
  SET saldo_inicial = true
  WHERE saldo_inicial = false
    AND observacao LIKE 'Importado da planilha de fios (linha %';

-- O livro de entradas filtra por isto (`WHERE saldo_inicial = false`), e são
-- poucas linhas de um lado só — índice parcial, como os outros da base.
CREATE INDEX IF NOT EXISTS lotes_fio_entradas_idx
  ON public.lotes_fio (data_entrada DESC)
  WHERE saldo_inicial = false AND deleted_at IS NULL;

COMMENT ON COLUMN public.lotes_fio.saldo_inicial IS
  'Lote que veio da foto da prateleira (import da planilha), não de uma entrada. Conta no estoque, fica fora do livro de entradas.';

-- ------------------------------------------------------------
-- 2) Mínimo por cor do fornecedor
-- ------------------------------------------------------------

ALTER TABLE public.cores_fornecedor_fio
  ADD COLUMN IF NOT EXISTS minimo_caixas integer;

ALTER TABLE public.cores_fornecedor_fio
  DROP CONSTRAINT IF EXISTS cores_fornecedor_fio_minimo_ck;
ALTER TABLE public.cores_fornecedor_fio
  ADD CONSTRAINT cores_fornecedor_fio_minimo_ck
  CHECK (minimo_caixas IS NULL OR minimo_caixas > 0);

COMMENT ON COLUMN public.cores_fornecedor_fio.minimo_caixas IS
  'Mínimo de CAIXAS desta cor na prateleira. NULL = sem mínimo (nunca 0: zero diria "nunca avise").';
