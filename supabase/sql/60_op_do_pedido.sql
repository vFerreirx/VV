-- ============================================================
-- 60_op_do_pedido.sql
-- A OP QUE PRODUZ O FALTANTE DE UM PEDIDO.
--
-- A via de faltantes lista o que a separação não achou, mas a OP não tinha
-- ligação nenhuma com o pedido: produzir era lembrar de cabeça, e o pedido não
-- sabia se alguém já tinha mandado fazer.
--
-- DUAS COLUNAS, e não uma FK pro faltante: a marcação de faltante é apagada e
-- regravada inteira a cada salvamento (salvarFaltantesAction), então não tem
-- id estável. A identidade dela é a CHAVE (produto|tamanho|cor, montada por
-- src/lib/separacao.ts), e é a chave que fica aqui.
--
-- Sem ON DELETE: pedido só é apagado de forma lógica (deleted_at), então a FK
-- nunca bloqueia nada.
--
-- Idempotente. Só aditivo: nada de DROP TABLE, DELETE, TRUNCATE ou UPDATE.
-- Toda OP existente fica com as duas colunas NULAS.
-- ============================================================

ALTER TABLE public.ordens_producao
  ADD COLUMN IF NOT EXISTS orcamento_id uuid
    REFERENCES public.orcamentos (id);

ALTER TABLE public.ordens_producao
  ADD COLUMN IF NOT EXISTS orcamento_faltante_chave text;

-- A chave do faltante só existe junto do pedido dele.
ALTER TABLE public.ordens_producao
  DROP CONSTRAINT IF EXISTS ordens_producao_faltante_ck;
ALTER TABLE public.ordens_producao
  ADD CONSTRAINT ordens_producao_faltante_ck
  CHECK (orcamento_faltante_chave IS NULL OR orcamento_id IS NOT NULL);

-- As OPs de um pedido (página do pedido e via de faltantes).
CREATE INDEX IF NOT EXISTS ordens_producao_orcamento_idx
  ON public.ordens_producao (orcamento_id)
  WHERE orcamento_id IS NOT NULL;

COMMENT ON COLUMN public.ordens_producao.orcamento_id IS
  'Pedido cujo faltante esta OP produz. NULL = OP sem pedido (toda OP anterior a 60).';
COMMENT ON COLUMN public.ordens_producao.orcamento_faltante_chave IS
  'Chave da linha de faltante (produto|tamanho|cor, src/lib/separacao.ts) que esta OP produz.';
