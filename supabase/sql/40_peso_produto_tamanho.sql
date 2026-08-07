-- ============================================================
-- 40_peso_produto_tamanho.sql
-- Peso no par (produto, tamanho) — corrige um erro de modelagem.
--
-- É a 40, não a 37: o 37 foi pulado e a 38/39 já estão aplicadas em
-- produção. Criar agora um arquivo "anterior" a elas só confundiria a ordem
-- em que o db:setup aplica a pasta.
--
-- O QUE ESTAVA ERRADO: `produtos.peso_gramas` é UM peso por produto, mas
-- "Peseira - ACONCHEGO" existe em Casal, King e Queen. Não dá pra dizer a
-- qual tamanho aquele número se refere. Pior: em src/lib/peso.ts o override
-- do produto era consultado ANTES do tamanho, então preencher o campo faria
-- os três tamanhos pesarem igual. Passou despercebido porque o único
-- override preenchido é "Capa de Almofada - LINKS" (225 g), produto que só
-- tem o tamanho 45x45 — o caso em que o erro não aparece.
--
-- O PREÇO JÁ RESOLVEU ISSO CERTO na migration 38: par (produto, tamanho),
-- unique, FK nos dois lados. Esta tabela é o espelho daquela, de propósito —
-- peso e preço têm o mesmo eixo e não faz sentido inventar outra forma.
--
-- Em GRAMAS e inteiro, como já era: peso de peça de cama/mesa não precisa de
-- fração, e inteiro não acumula erro de ponto flutuante ao somar dezenas de
-- itens. NOT NULL aqui (diferente da coluna antiga, que era nullable):
-- "sem peso" agora é a ausência da linha, não uma linha com null.
--
-- `produtos.peso_gramas` NÃO é removida — ver o bloco no fim do arquivo.
--
-- Idempotente. Só aditivo (CREATE TABLE / CREATE INDEX / CREATE POLICY /
-- INSERT ... ON CONFLICT DO NOTHING). Nenhuma linha existente é alterada.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.produto_tamanho_peso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id uuid NOT NULL REFERENCES public.produtos (id) ON DELETE CASCADE,
  tamanho_id uuid NOT NULL REFERENCES public.tamanhos (id),
  peso_gramas integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT produto_tamanho_peso_uk UNIQUE (produto_id, tamanho_id)
);

-- Peso negativo é impossível; zero também não é peso de peça física.
ALTER TABLE public.produto_tamanho_peso
  DROP CONSTRAINT IF EXISTS produto_tamanho_peso_positivo_ck;
ALTER TABLE public.produto_tamanho_peso
  ADD CONSTRAINT produto_tamanho_peso_positivo_ck CHECK (peso_gramas > 0);

CREATE INDEX IF NOT EXISTS produto_tamanho_peso_produto_idx
  ON public.produto_tamanho_peso (produto_id);

-- --------------------------------------------------------------
-- RLS — igual à produto_tamanho_preco (38), que por sua vez espelha
-- produtos/tamanhos (04_rls.sql): é catálogo. Leitura pra qualquer
-- autenticado (vendas precisa do peso pra cotar frete no pedido) e escrita
-- pra gerência, que é quem entra em /produtos.
--
-- Como nas outras, o app NÃO depende disto: todo acesso é server-side e
-- passa por requireArea/requireAreaEscrita. Estas policies só limitam acesso
-- direto à API REST do Supabase.
-- --------------------------------------------------------------
ALTER TABLE public.produto_tamanho_peso ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS produto_tamanho_peso_select_authenticated ON public.produto_tamanho_peso;
CREATE POLICY produto_tamanho_peso_select_authenticated ON public.produto_tamanho_peso
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS produto_tamanho_peso_manager_all ON public.produto_tamanho_peso;
CREATE POLICY produto_tamanho_peso_manager_all ON public.produto_tamanho_peso
  FOR ALL TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

-- --------------------------------------------------------------
-- Migração do que já existe: cada override de `produtos.peso_gramas` vira
-- uma linha por TAMANHO que aquele produto oferece.
--
-- Copiar pra todos os tamanhos do produto é o que PRESERVA o comportamento
-- atual, não o que o perpetua: hoje o override vence o peso do tamanho em
-- todos eles (src/lib/peso.ts consultava o produto antes do tamanho), então
-- é exatamente esse o peso que o sistema já devolve hoje. Corrigir um
-- override que esteja errado é decisão de cadastro do usuário, na tela — a
-- migration não pode adivinhar qual dos tamanhos ele quis dizer.
--
-- Genérico em vez de citar "Capa de Almofada - LINKS" na mão: hoje é o único
-- override (conferido), mas se aparecer outro entre escrever e aplicar, ele
-- entra junto em vez de ficar pra trás em silêncio.
--
-- O vínculo variação → tamanho é por NOME sem caixa, igual a
-- src/lib/db/pesos.ts faz — assim o que migra é o mesmo par que a tela lê.
-- --------------------------------------------------------------
INSERT INTO public.produto_tamanho_peso (produto_id, tamanho_id, peso_gramas)
SELECT DISTINCT p.id, t.id, p.peso_gramas
FROM public.produtos p
JOIN public.variacoes_produto v
  ON v.produto_id = p.id
 AND v.deleted_at IS NULL
 AND v.tamanho IS NOT NULL
JOIN public.tamanhos t
  ON lower(t.nome) = lower(v.tamanho)
 AND t.deleted_at IS NULL
WHERE p.peso_gramas IS NOT NULL
  AND p.peso_gramas > 0
ON CONFLICT ON CONSTRAINT produto_tamanho_peso_uk DO NOTHING;

-- --------------------------------------------------------------
-- `produtos.peso_gramas` fica no banco, sem ninguém ler nem escrever.
--
-- Mesmo tratamento dado a produtos.largura_cm / comprimento_cm quando as
-- dimensões migraram pro tamanho: DROP COLUMN em produção é irreversível e
-- não há ganho nenhum em apagar um integer nullable. A coluna permanece como
-- histórico do que foi migrado acima, e o app deixou de enxergá-la — ver o
-- comentário em src/lib/db/schema/produtos.ts.
-- --------------------------------------------------------------
