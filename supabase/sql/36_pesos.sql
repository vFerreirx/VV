-- ============================================================
-- 36_pesos.sql
-- Peso das peças, pra calcular o peso total do pedido e cotar frete.
--
-- Onde o peso mora:
--   - `tamanhos.peso_gramas` é o PADRÃO. Uma peseira King pesa o que pesa,
--     independente do modelo.
--   - `produtos.peso_gramas` é um OVERRIDE opcional, pro modelo que foge do
--     padrão (hoje 7 modelos de capa dividem o tamanho "45x45"). Quando
--     preenchido, vence o do tamanho.
--
-- Em GRAMAS e inteiro: peso de peça de cama/mesa não precisa de fração, e
-- inteiro não acumula erro de ponto flutuante ao somar dezenas de itens.
-- Nullable porque o cadastro atual não tem peso nenhum e vai ser preenchido
-- aos poucos — item sem peso é tratado como "sem peso", nunca como zero.
--
-- `orcamento_itens.produto_id` liga a linha AVULSA ao produto do catálogo.
-- Hoje ela guarda só texto ("Peseira - Aconchego Casal"), e é por isso que o
-- resolvedor de peso precisa de um fallback por descrição pros 371 itens
-- antigos. As linhas novas passam a gravar o vínculo e não dependem disso.
-- ON DELETE SET NULL: apagar um produto não pode apagar item de pedido.
--
-- Idempotente. Só aditivo (ADD COLUMN IF NOT EXISTS) — nenhuma coluna é
-- alterada ou removida, e nenhuma linha é tocada.
--
-- RLS: nada a fazer. As policies de produtos/tamanhos (04_rls.sql) e de
-- orcamento_itens (25_orcamentos.sql) valem para a linha inteira, sem lista
-- de colunas — coluna nova entra coberta pela policy que já existe.
-- ============================================================

ALTER TABLE public.tamanhos
  ADD COLUMN IF NOT EXISTS peso_gramas integer;

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS peso_gramas integer;

ALTER TABLE public.orcamento_itens
  ADD COLUMN IF NOT EXISTS produto_id uuid
  REFERENCES public.produtos (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orcamento_itens_produto_idx
  ON public.orcamento_itens (produto_id);
