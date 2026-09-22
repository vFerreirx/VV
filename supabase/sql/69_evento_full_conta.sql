-- ============================================================
-- 69_evento_full_conta.sql
-- DE QUAL CONTA É ESTE ENVIO PRO FULL.
--
-- São 6 contas cadastradas (3 do Mercado Livre e 3 da Shopee), cada uma com um
-- CNPJ atrás, e a remessa real já guarda a sua (`remessas_full.conta_id`). O
-- evento do calendário, não: ele só sabia o CANAL, e "Full ML" em três contas
-- diferentes é a informação faltando justamente na hora de separar o lote.
--
-- ⚠️ NULL É CASO NORMAL E PERMANENTE, não "faltou preencher": os 2 eventos que
-- existem hoje são de julho/2026, de antes de as contas existirem, e vão
-- continuar sem conta pra sempre. A tela mostra só o canal nesses, e está
-- certo — inventar uma conta pra eles seria inventar um fato.
--
-- ON DELETE SET NULL: excluir uma conta não pode apagar o histórico do
-- calendário. O evento vira "sem conta", que é exatamente o que ele passou a
-- ser.
--
-- Idempotente. Só aditiva: nada de DROP, DELETE, TRUNCATE ou UPDATE.
-- ============================================================

ALTER TABLE public.eventos_full
  ADD COLUMN IF NOT EXISTS conta_id uuid
    REFERENCES public.contas_marketplace (id) ON DELETE SET NULL;

-- Os eventos de uma conta. Parcial: a maioria das linhas antigas é NULL, e
-- elas não têm por que ocupar o índice.
CREATE INDEX IF NOT EXISTS eventos_full_conta_idx
  ON public.eventos_full (conta_id)
  WHERE conta_id IS NOT NULL;

COMMENT ON COLUMN public.eventos_full.conta_id IS
  'Conta de marketplace do envio. NULL = evento anterior ao cadastro de contas (caso normal, não pendência).';
