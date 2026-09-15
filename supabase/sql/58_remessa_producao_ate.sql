-- ============================================================
-- 58_remessa_producao_ate.sql
-- O PRAZO DA PRODUÇÃO DE UMA REMESSA FULL, separado da data de envio.
--
-- Até aqui toda OP de Full nascia com o prazo = data de envio às 23:59. Só
-- que depois que a peça sai da malharia ainda passa por costura e separação,
-- e o "atrasada" só acendia quando o caminhão já tinha saído — tarde demais
-- pra fazer qualquer coisa.
--
-- `producao_ate` é o dia em que a produção precisa terminar pra dar tempo do
-- resto. NULO É O PADRÃO: data de envio menos a folga de costura + separação,
-- que mora no código (src/lib/producao/prazo-da-remessa.ts). Preenchido só
-- quando alguém escolheu outro dia de propósito — e por isso uma mudança na
-- data de envio arrasta o prazo junto enquanto ninguém mexeu nele.
--
-- ⚠️ A FOLGA MÍNIMA NÃO ESTÁ AQUI. Os 3 dias são política da fábrica e podem
-- mudar sem migration; o banco guarda só o que é impossível em qualquer
-- política: a produção terminar DEPOIS do envio.
--
-- Idempotente. Só aditivo: nada de DROP TABLE, DELETE, TRUNCATE ou UPDATE.
-- Remessas existentes não recebem valor: ficam NULAS (= padrão).
-- ============================================================

ALTER TABLE public.remessas_full
  ADD COLUMN IF NOT EXISTS producao_ate date;

-- DROP+ADD pra manter o arquivo idempotente — mesmo idioma dos CHECKs de
-- 55_pedido_parcelas.sql e 57_maquina_paradas.sql.
ALTER TABLE public.remessas_full
  DROP CONSTRAINT IF EXISTS remessas_full_producao_ate_ck;
ALTER TABLE public.remessas_full
  ADD CONSTRAINT remessas_full_producao_ate_ck
  CHECK (producao_ate IS NULL OR producao_ate <= data_envio);

COMMENT ON COLUMN public.remessas_full.producao_ate IS
  'Prazo da producao desta remessa. NULL = padrao: data_envio menos a folga de costura + separacao (constante em src/lib/producao/prazo-da-remessa.ts). Preenchido so quando alguem muda o padrao.';
