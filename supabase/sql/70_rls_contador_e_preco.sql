-- ============================================================
-- 70_rls_contador_e_preco.sql
-- FECHA DOIS BURACOS QUE SÓ EXISTIAM PELA API REST DO SUPABASE.
--
-- Medido em 23/09/2026:
--   1. `op_numero_counter` estava SEM RLS e com DELETE/INSERT/UPDATE/TRUNCATE
--      pra `anon` e `authenticated`. O `anon` é a chave pública que vai no
--      bundle do site: qualquer visitante podia reescrever o contador e
--      quebrar a numeração das OPs. É o aviso "RLS Disabled in Public" do
--      painel do Supabase.
--   2. `produto_tamanho_preco` e `kit_tamanho_preco` — o preço de ATACADO,
--      que é a margem da casa — tinham SELECT `USING (true)`. A área
--      `precosCatalogo` esconde esse preço na TELA; pela API ele continuava
--      legível por qualquer sessão autenticada.
--
-- ⚠️ POR QUE ISSO NÃO QUEBRA O APP:
--   - Toda consulta do sistema passa pela conexão do SERVIDOR (Drizzle), que
--     entra como `postgres`: dona das tabelas e com BYPASSRLS. RLS e grant de
--     `anon`/`authenticated` não se aplicam a ela. Nada em `src/` lê essas
--     três tabelas pelo supabase-js.
--   - O único uso do supabase-js no browser é o realtime, e NENHUMA destas
--     tabelas está na publicação. As que estão são `ordens_producao` e
--     `maquinas` (05_realtime.sql) e `orcamento_parcelas` (55). ⚠️ ESSAS TRÊS
--     PRECISAM CONTINUAR COM SELECT PRA `authenticated`: o realtime só entrega
--     o evento a quem a RLS deixa ler a linha. Sem isso, o tablet e o kanban
--     param de receber evento — sem erro nenhum, só silêncio.
--
-- Idempotente: pode rodar em todo `db:setup`.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Contador de OP
--
-- RLS LIGADA E NENHUMA POLÍTICA. Isso é a decisão, não um esquecimento: o
-- único acesso legítimo a esta tabela é o trigger `generate_op_numero()`
-- (02_op_numero.sql), que é SECURITY DEFINER — roda como a dona (`postgres`),
-- então não usa os grants que saem aqui e não é barrado pela RLS. Ninguém
-- mais tem motivo pra ler nem escrever nesta tabela.
--
-- Quem criar uma política aqui "pra consertar" algo reabre o buraco. Se
-- alguma tela precisar do número, ela lê `ordens_producao.numero`.
-- ------------------------------------------------------------
ALTER TABLE public.op_numero_counter ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.op_numero_counter FROM anon, authenticated;

-- ------------------------------------------------------------
-- 2. Preço de atacado: leitura só da gerência
--
-- MESMO NOME da política da 38/47, de propósito. Todo `db:setup` roda a
-- 38 e a 47 de novo; elas já foram corrigidas pra `is_manager()`, mas, se
-- alguém um dia voltar a escrever `USING (true)` lá, esta aqui roda depois e
-- derruba pelo nome. Com nome diferente, as duas políticas conviveriam — e
-- políticas permissivas se somam com OR: a `true` venceria em silêncio.
--
-- A `*_manager_all` (FOR ALL, `is_manager()`) já cobre o SELECT da gerência;
-- esta fica explícita pra ninguém ter que deduzir quem lê o preço.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS produto_tamanho_preco_select_authenticated
  ON public.produto_tamanho_preco;
CREATE POLICY produto_tamanho_preco_select_authenticated
  ON public.produto_tamanho_preco
  FOR SELECT TO authenticated
  USING (public.is_manager());

DROP POLICY IF EXISTS kit_tamanho_preco_select_authenticated
  ON public.kit_tamanho_preco;
CREATE POLICY kit_tamanho_preco_select_authenticated
  ON public.kit_tamanho_preco
  FOR SELECT TO authenticated
  USING (public.is_manager());
