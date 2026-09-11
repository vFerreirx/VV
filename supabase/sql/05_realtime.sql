-- ============================================================
-- 05_realtime.sql
-- Habilita Postgres Changes (Realtime) nas tabelas que o app
-- assina via cliente browser.
--
-- Idempotente: se a tabela já está na publicação, ALTER PUBLICATION
-- ADD TABLE retorna erro 'already exists'. Capturamos com DO block.
-- ============================================================

DO $$
BEGIN
  -- ordens_producao: kanban precisa pra atualizar quando outro usuário move card.
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ordens_producao;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  -- maquinas: a tela do operador é uma grade de MÁQUINAS, e o cartão precisa
  -- das DUAS tabelas pra saber em que pé está. A OP diz se a máquina está
  -- ocupada; a máquina diz se está indisponível (manutenção/desativada).
  --
  -- Sem esta linha o `.on('postgres_changes', ... table: 'maquinas')` do
  -- painel-operador.tsx assina, conecta e NUNCA recebe evento — falha muda,
  -- sem erro no console: marcar uma máquina como manutenção não apagaria o
  -- cartão no tablet do operador que está de pé na frente dela.
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.maquinas;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

END $$;

-- ⚠️ NEM TODA TABELA DE REALTIME CABE AQUI. Os NN_*.sql rodam em ordem
-- alfabética, então este arquivo (05) roda ANTES de qualquer tabela criada
-- de 06 em diante — e `ALTER PUBLICATION ... ADD TABLE` numa tabela que
-- ainda não existe levanta `undefined_table`, que o EXCEPTION acima não
-- captura (ele só trata `duplicate_object`). O arquivo inteiro reverte e o
-- setup para ali.
--
-- Por isso `orcamento_parcelas` publica dentro da própria
-- 55_pedido_parcelas.sql, logo depois do CREATE TABLE. Quem for publicar
-- uma tabela nova: faça o mesmo, e some a esta lista mentalmente ao
-- procurar "quais tabelas têm realtime" —
--   05: ordens_producao, maquinas
--   55: orcamento_parcelas
