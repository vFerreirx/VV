-- ============================================================
-- 73_codigo_do_programa.sql
-- O CÓDIGO DO PROGRAMA DA MÁQUINA, NO PRODUTO.
--
-- O chão de fábrica lê a OP pelo código: "059 - Peseira Links - QUEEN -
-- AREIA - 55" (o Trello, 23/09/2026). O "059" é o número do PROGRAMA que o
-- programador das máquinas usa pra tecer aquele produto — e NÃO é o SKU,
-- embora hoje o SKU comece com ele. O 3D é 076 na peseira e na capa e 115 na
-- manta; o PIENZA é 100 na peseira e 116 na manta e na capa. É por PRODUTO.
--
-- NÃO É ÚNICO, de propósito: 059 é da peseira E da capa LINKS — o mesmo
-- programa tece as duas. Sem índice único, e sem NOT NULL: produto novo ainda
-- sem programa, e produto de PARCEIRO (o suéter), não têm código, e NULL é a
-- resposta honesta. A tela nunca mostra "null" nem um traço sobrando
-- (`linhaDaOp`, src/lib/producao/rotulo-da-op.ts).
--
-- ⚠️ A CARGA RODA UMA VEZ SÓ, quando a coluna nasce: os DÍGITOS DO COMEÇO do
-- SKU ("059-P" → "059", "095-" → "095"). Depois disso o código é do cadastro
-- ("Código do programa", na tela do produto). Um UPDATE solto aqui
-- sobrescreveria, em todo `db:setup`, o código que alguém corrigiu à mão —
-- mesmo princípio da 72 e do ON CONFLICT DO NOTHING da 39.
--
-- Medido em 23/09/2026: 27 produtos, 26 com dígito no começo do SKU e 1 sem
-- (SUETER-M-, o suéter de parceiro).
--
-- Idempotente.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'produtos'
       AND column_name = 'codigo'
  ) THEN
    ALTER TABLE public.produtos ADD COLUMN codigo text;
    UPDATE public.produtos
       SET codigo = substring(sku FROM '^[0-9]+')
     WHERE sku ~ '^[0-9]';
  END IF;
END $$;

-- Vazio não é código: o formulário manda NULL, e isto garante que ninguém
-- grave '' por outro caminho — a tela trataria '' como código e montaria
-- " - Peseira…" com o traço sobrando.
ALTER TABLE public.produtos DROP CONSTRAINT IF EXISTS produtos_codigo_ck;
ALTER TABLE public.produtos
  ADD CONSTRAINT produtos_codigo_ck
  CHECK (codigo IS NULL OR length(btrim(codigo)) > 0);
