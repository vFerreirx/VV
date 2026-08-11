-- ============================================================
-- 41_orcamento_status.sql
-- O pedido passa a ter QUATRO status em vez de dois:
--   aguardando -> aprovado -> separado -> finalizado
--
-- Fluxo LINEAR com volta permitida (uma casa por vez, pra frente ou pra
-- trás). Quem decide o que vale é src/lib/pedido-status.ts — aqui só existe
-- o vocabulário.
--
-- NENHUM pedido precisa ser migrado: todos estão em 'aguardando' ou
-- 'aprovado', que continuam válidos e continuam significando a mesma coisa.
-- O default da coluna ('aguardando', posto pela 30) também segue valendo.
--
-- ORDEM INTERNA DO ENUM: ADD VALUE sem BEFORE/AFTER acrescenta no FIM, então
-- 'separado' e depois 'finalizado' produzem exatamente a ordem do fluxo —
-- aguardando, aprovado, separado, finalizado. Isso importa porque a ordem de
-- declaração do enum é a ordem de comparação/ORDER BY no Postgres, e este
-- projeto já teve ordenação dependendo dela.
--
-- ESTE ARQUIVO SÓ TEM ADD VALUE, de propósito. O Postgres recusa USAR um
-- valor de enum recém-adicionado na mesma transação em que ele foi criado, e
-- o scripts/setup-db.ts manda cada .sql de uma vez só (uma transação
-- implícita por arquivo). Qualquer UPDATE, CHECK ou INSERT que mencione
-- 'separado'/'finalizado' tem que ir num arquivo POSTERIOR, nunca aqui.
--
-- Idempotente (IF NOT EXISTS). Só aditivo: nada de DROP, DELETE ou UPDATE.
-- ============================================================

ALTER TYPE public.orcamento_status ADD VALUE IF NOT EXISTS 'separado';
ALTER TYPE public.orcamento_status ADD VALUE IF NOT EXISTS 'finalizado';
