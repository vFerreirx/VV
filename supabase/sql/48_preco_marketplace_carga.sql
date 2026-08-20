-- ============================================================
-- 48_preco_marketplace_carga.sql
-- Carga do preço de MARKETPLACE, tirada das duas planilhas do cliente
-- ("RELAÇÃO DE VALORES - PESEIRAS/MANTAS").
--
-- ⚠️ ESTE PREÇO NÃO ALIMENTA PEDIDO. O pedido puxa o de ATACADO
-- (produto_tamanho_preco / kit_tamanho_preco). A regra inteira, com o porquê,
-- está no topo de src/lib/preco-marketplace.ts.
--
-- GERADO por scripts/analise/gerar-carga-marketplace.ts — não edite à mão;
-- corrija a planilha ou o script e rode de novo. O script confere cada célula
-- contra o catálogo e recusa o que não casa, em vez de criar cadastro.
--
-- 51 linhas de produto e 75 de kit (27 com combinação de DOIS
-- tamanhos, todas do Kit Peseira+2 Capas ACONCHEGO). Total 126.
--
-- NÃO ENTRARAM, e é de propósito:
--   • 69 células dos combos 2/3/4 CAPAS — vendidos como anúncio, não
--     existem como kit no catálogo. Nenhum kit foi criado pra acomodá-los.
--   • 38 células nas 12 linhas sem sufixo de marketplace —
--     modelos fora de linha, descarte confirmado pelo usuário.
--   • SEM MODELO NO CADASTRO — "077-MAX" (linha "077-MAX - ML", 4 células). Nada criado.
--   • SEM MODELO NO CADASTRO — "077-MAX" (linha "077-MAX - SHOPEE", 4 células). Nada criado.
--   • SEM MODELO NO CADASTRO — "077-MAX" (linha "077-MAX - SHEIN", 4 células). Nada criado.
--   • KIT INEXISTENTE — Kit de peseira do modelo SIENA (094-SIENA - ML / KIT QUEEN) = R$ 139.99
--   • PRODUTO INEXISTENTE — "Peseira - SIENA" (094-SIENA - ML / PESEIRA QUEEN) = R$ 79.99
--   • KIT INEXISTENTE — Kit de peseira do modelo SIENA (094-SIENA - SHOPEE / KIT QUEEN) = R$ 139.99
--   • PRODUTO INEXISTENTE — "Peseira - SIENA" (094-SIENA - SHOPEE / PESEIRA QUEEN) = R$ 79.99
--   • KIT INEXISTENTE — Kit de peseira do modelo SIENA (094-SIENA - SHEIN / KIT QUEEN) = R$ 139.99
--   • PRODUTO INEXISTENTE — "Peseira - SIENA" (094-SIENA - SHEIN / PESEIRA QUEEN) = R$ 79.99
--   • SEM MODELO NO CADASTRO — "095-ACONCHEGO KIT PESEIRA E 4 CAPAS (50 e 60)" (linha "095-ACONCHEGO KIT PESEIRA E 4 CAPAS (50 e 60) - ML", 3 células). Nada criado.
--   • SEM MODELO NO CADASTRO — "095-ACONCHEGO KIT PESEIRA E 4 CAPAS (50 e 60)" (linha "095-ACONCHEGO KIT PESEIRA E 4 CAPAS (50 e 60) - SHOPEE", 3 células). Nada criado.
--   • SEM MODELO NO CADASTRO — "095-ACONCHEGO KIT PESEIRA E 4 CAPAS (50 e 60)" (linha "095-ACONCHEGO KIT PESEIRA E 4 CAPAS (50 e 60) - SHEIN", 3 células). Nada criado.
--
-- ON CONFLICT DO NOTHING, e não UPSERT: este arquivo roda em todo
-- `npm run db:setup`. Se sobrescrevesse, um preço ajustado na tela voltaria
-- pro valor da planilha no próximo setup, em silêncio. Aqui a carga só
-- preenche buraco — mesmo padrão do 39_precos_carga.sql.
--
-- IDs resolvidos por NOME, sem UUID escrito à mão: UUID em arquivo versionado
-- quebra em qualquer outro banco e não dá pra conferir a olho. O JOIN também
-- é rede de segurança — nome que não casa simplesmente não insere.
--
-- Idempotente. Só INSERT.
-- ============================================================

INSERT INTO public.produto_tamanho_preco_marketplace
  (produto_id, tamanho_id, marketplace, preco)
SELECT p.id, t.id, v.marketplace, v.preco
FROM (VALUES
  ('Manta - ACONCHEGO'::text, 'Manta'::text, 'mercado_livre'::text, 79.99::numeric(12,2)),
  ('Manta - ACONCHEGO', 'Manta', 'shein', 69.99),
  ('Manta - ACONCHEGO', 'Manta', 'shopee', 69.99),
  ('Manta - SIENA', 'Manta', 'mercado_livre', 79.99),
  ('Manta - SIENA', 'Manta', 'shein', 79.99),
  ('Manta - SIENA', 'Manta', 'shopee', 79.99),
  ('Peseira - ACONCHEGO', 'Casal', 'mercado_livre', 79.99),
  ('Peseira - ACONCHEGO', 'Casal', 'shein', 79.99),
  ('Peseira - ACONCHEGO', 'Casal', 'shopee', 79.99),
  ('Peseira - ACONCHEGO', 'King', 'mercado_livre', 99.99),
  ('Peseira - ACONCHEGO', 'King', 'shein', 99.99),
  ('Peseira - ACONCHEGO', 'King', 'shopee', 99.99),
  ('Peseira - ACONCHEGO', 'Queen', 'mercado_livre', 89.99),
  ('Peseira - ACONCHEGO', 'Queen', 'shein', 89.99),
  ('Peseira - ACONCHEGO', 'Queen', 'shopee', 89.99),
  ('Peseira - ARAN', 'Casal', 'mercado_livre', 69.99),
  ('Peseira - ARAN', 'Casal', 'shein', 69.99),
  ('Peseira - ARAN', 'Casal', 'shopee', 69.99),
  ('Peseira - ARAN', 'King', 'mercado_livre', 89.99),
  ('Peseira - ARAN', 'King', 'shein', 89.99),
  ('Peseira - ARAN', 'King', 'shopee', 89.99),
  ('Peseira - ARAN', 'Queen', 'mercado_livre', 79.99),
  ('Peseira - ARAN', 'Queen', 'shein', 79.99),
  ('Peseira - ARAN', 'Queen', 'shopee', 79.99),
  ('Peseira - EFEITO 3D', 'Casal', 'mercado_livre', 59.99),
  ('Peseira - EFEITO 3D', 'Casal', 'shein', 59.99),
  ('Peseira - EFEITO 3D', 'Casal', 'shopee', 64.99),
  ('Peseira - EFEITO 3D', 'King', 'mercado_livre', 78.99),
  ('Peseira - EFEITO 3D', 'King', 'shein', 69.99),
  ('Peseira - EFEITO 3D', 'King', 'shopee', 79.99),
  ('Peseira - EFEITO 3D', 'Queen', 'mercado_livre', 69.99),
  ('Peseira - EFEITO 3D', 'Queen', 'shein', 64.99),
  ('Peseira - EFEITO 3D', 'Queen', 'shopee', 69.99),
  ('Peseira - LINKS', 'Casal', 'mercado_livre', 59.99),
  ('Peseira - LINKS', 'Casal', 'shein', 69.99),
  ('Peseira - LINKS', 'Casal', 'shopee', 69.99),
  ('Peseira - LINKS', 'King', 'mercado_livre', 78.99),
  ('Peseira - LINKS', 'King', 'shein', 89.99),
  ('Peseira - LINKS', 'King', 'shopee', 89.99),
  ('Peseira - LINKS', 'Queen', 'mercado_livre', 69.99),
  ('Peseira - LINKS', 'Queen', 'shein', 79.99),
  ('Peseira - LINKS', 'Queen', 'shopee', 79.99),
  ('Peseira - RELEVO', 'Queen', 'mercado_livre', 69.99),
  ('Peseira - RELEVO', 'Queen', 'shein', 69.99),
  ('Peseira - RELEVO', 'Queen', 'shopee', 69.99),
  ('Peseira - SOFISTICADA', 'Queen', 'mercado_livre', 79.99),
  ('Peseira - SOFISTICADA', 'Queen', 'shein', 79.99),
  ('Peseira - SOFISTICADA', 'Queen', 'shopee', 79.99),
  ('Peseira - TRANÇAS', 'Queen', 'mercado_livre', 79.99),
  ('Peseira - TRANÇAS', 'Queen', 'shein', 79.99),
  ('Peseira - TRANÇAS', 'Queen', 'shopee', 79.99)
) AS v(produto, tamanho, marketplace, preco)
JOIN public.produtos p ON p.nome = v.produto AND p.deleted_at IS NULL
JOIN public.tamanhos t ON t.nome = v.tamanho AND t.deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- --------------------------------------------------------------
-- KITS — a `combinacao` é MONTADA AQUI, não escrita literal.
--
-- Ela contém produto_id (uuid), que muda de banco pra banco. Então a planilha
-- entra como pares "Nome do Produto=Tamanho" dos componentes VARIÁVEIS, e o
-- LATERAL abaixo reproduz exatamente `chaveDeTamanhos`
-- (src/lib/kit-tamanhos.ts): pares `<produtoId>=<tamanho minúsculo>`
-- ordenados por produto_id, unidos por '|'.
--
-- A ordenação bate com a do TypeScript porque lá os pares são ordenados como
-- STRING e todo par começa pelo produto_id — e a ordem de bytes de um uuid é
-- a mesma da representação hexadecimal minúscula dele.
--
-- `ARRAY[]` vazio é o kit SEM componente variável: combinação '' , que é
-- chave válida ("este kit tem um preço só").
--
-- `c.casados = cardinality(v.escolhas)` é a rede: se algum nome de produto
-- não casar com um componente do kit, a linha não insere, em vez de gravar
-- uma combinação truncada que ninguém acharia depois.
-- --------------------------------------------------------------

INSERT INTO public.kit_tamanho_preco_marketplace
  (kit_id, combinacao, marketplace, preco)
SELECT k.id, c.combinacao, v.marketplace, v.preco
FROM (VALUES
  ('Kit Manta + 2 Capas de Almofada - SIENA'::text, ARRAY[]::text[], 'mercado_livre'::text, 139.99::numeric(12,2)),
  ('Kit Manta + 2 Capas de Almofada - SIENA', ARRAY[]::text[], 'shein', 139.99),
  ('Kit Manta + 2 Capas de Almofada - SIENA', ARRAY[]::text[], 'shopee', 139.99),
  ('Kit Manta+ 2 Capas de Almofada - ACONCHEGO', ARRAY['Capa de Almofada - ACONCHEGO=45x45'], 'mercado_livre', 139.99),
  ('Kit Manta+ 2 Capas de Almofada - ACONCHEGO', ARRAY['Capa de Almofada - ACONCHEGO=45x45'], 'shein', 129.99),
  ('Kit Manta+ 2 Capas de Almofada - ACONCHEGO', ARRAY['Capa de Almofada - ACONCHEGO=45x45'], 'shopee', 129.99),
  ('Kit Manta+ 2 Capas de Almofada - ACONCHEGO', ARRAY['Capa de Almofada - ACONCHEGO=50x50'], 'mercado_livre', 149.99),
  ('Kit Manta+ 2 Capas de Almofada - ACONCHEGO', ARRAY['Capa de Almofada - ACONCHEGO=50x50'], 'shein', 139.99),
  ('Kit Manta+ 2 Capas de Almofada - ACONCHEGO', ARRAY['Capa de Almofada - ACONCHEGO=50x50'], 'shopee', 139.99),
  ('Kit Manta+ 2 Capas de Almofada - ACONCHEGO', ARRAY['Capa de Almofada - ACONCHEGO=60x60'], 'mercado_livre', 159.99),
  ('Kit Manta+ 2 Capas de Almofada - ACONCHEGO', ARRAY['Capa de Almofada - ACONCHEGO=60x60'], 'shein', 149.99),
  ('Kit Manta+ 2 Capas de Almofada - ACONCHEGO', ARRAY['Capa de Almofada - ACONCHEGO=60x60'], 'shopee', 149.99),
  ('Kit Peseira+ 2 Capas de Almofada - ACONCHEGO', ARRAY['Capa de Almofada - ACONCHEGO=45x45', 'Peseira - ACONCHEGO=Casal'], 'mercado_livre', 149.99),
  ('Kit Peseira+ 2 Capas de Almofada - ACONCHEGO', ARRAY['Capa de Almofada - ACONCHEGO=45x45', 'Peseira - ACONCHEGO=Casal'], 'shein', 149.99),
  ('Kit Peseira+ 2 Capas de Almofada - ACONCHEGO', ARRAY['Capa de Almofada - ACONCHEGO=45x45', 'Peseira - ACONCHEGO=Casal'], 'shopee', 149.99),
  ('Kit Peseira+ 2 Capas de Almofada - ACONCHEGO', ARRAY['Capa de Almofada - ACONCHEGO=45x45', 'Peseira - ACONCHEGO=King'], 'mercado_livre', 189.99),
  ('Kit Peseira+ 2 Capas de Almofada - ACONCHEGO', ARRAY['Capa de Almofada - ACONCHEGO=45x45', 'Peseira - ACONCHEGO=King'], 'shein', 189.99),
  ('Kit Peseira+ 2 Capas de Almofada - ACONCHEGO', ARRAY['Capa de Almofada - ACONCHEGO=45x45', 'Peseira - ACONCHEGO=King'], 'shopee', 189.99),
  ('Kit Peseira+ 2 Capas de Almofada - ACONCHEGO', ARRAY['Capa de Almofada - ACONCHEGO=45x45', 'Peseira - ACONCHEGO=Queen'], 'mercado_livre', 169.99),
  ('Kit Peseira+ 2 Capas de Almofada - ACONCHEGO', ARRAY['Capa de Almofada - ACONCHEGO=45x45', 'Peseira - ACONCHEGO=Queen'], 'shein', 169.99),
  ('Kit Peseira+ 2 Capas de Almofada - ACONCHEGO', ARRAY['Capa de Almofada - ACONCHEGO=45x45', 'Peseira - ACONCHEGO=Queen'], 'shopee', 169.99),
  ('Kit Peseira+ 2 Capas de Almofada - ACONCHEGO', ARRAY['Capa de Almofada - ACONCHEGO=50x50', 'Peseira - ACONCHEGO=Casal'], 'mercado_livre', 159.99),
  ('Kit Peseira+ 2 Capas de Almofada - ACONCHEGO', ARRAY['Capa de Almofada - ACONCHEGO=50x50', 'Peseira - ACONCHEGO=Casal'], 'shein', 159.99),
  ('Kit Peseira+ 2 Capas de Almofada - ACONCHEGO', ARRAY['Capa de Almofada - ACONCHEGO=50x50', 'Peseira - ACONCHEGO=Casal'], 'shopee', 159.99),
  ('Kit Peseira+ 2 Capas de Almofada - ACONCHEGO', ARRAY['Capa de Almofada - ACONCHEGO=50x50', 'Peseira - ACONCHEGO=King'], 'mercado_livre', 199.99),
  ('Kit Peseira+ 2 Capas de Almofada - ACONCHEGO', ARRAY['Capa de Almofada - ACONCHEGO=50x50', 'Peseira - ACONCHEGO=King'], 'shein', 199.99),
  ('Kit Peseira+ 2 Capas de Almofada - ACONCHEGO', ARRAY['Capa de Almofada - ACONCHEGO=50x50', 'Peseira - ACONCHEGO=King'], 'shopee', 199.99),
  ('Kit Peseira+ 2 Capas de Almofada - ACONCHEGO', ARRAY['Capa de Almofada - ACONCHEGO=50x50', 'Peseira - ACONCHEGO=Queen'], 'mercado_livre', 179.99),
  ('Kit Peseira+ 2 Capas de Almofada - ACONCHEGO', ARRAY['Capa de Almofada - ACONCHEGO=50x50', 'Peseira - ACONCHEGO=Queen'], 'shein', 179.99),
  ('Kit Peseira+ 2 Capas de Almofada - ACONCHEGO', ARRAY['Capa de Almofada - ACONCHEGO=50x50', 'Peseira - ACONCHEGO=Queen'], 'shopee', 179.99),
  ('Kit Peseira+ 2 Capas de Almofada - ACONCHEGO', ARRAY['Capa de Almofada - ACONCHEGO=60x60', 'Peseira - ACONCHEGO=Casal'], 'mercado_livre', 169.99),
  ('Kit Peseira+ 2 Capas de Almofada - ACONCHEGO', ARRAY['Capa de Almofada - ACONCHEGO=60x60', 'Peseira - ACONCHEGO=Casal'], 'shein', 169.99),
  ('Kit Peseira+ 2 Capas de Almofada - ACONCHEGO', ARRAY['Capa de Almofada - ACONCHEGO=60x60', 'Peseira - ACONCHEGO=Casal'], 'shopee', 169.99),
  ('Kit Peseira+ 2 Capas de Almofada - ACONCHEGO', ARRAY['Capa de Almofada - ACONCHEGO=60x60', 'Peseira - ACONCHEGO=King'], 'mercado_livre', 199.99),
  ('Kit Peseira+ 2 Capas de Almofada - ACONCHEGO', ARRAY['Capa de Almofada - ACONCHEGO=60x60', 'Peseira - ACONCHEGO=King'], 'shein', 199.99),
  ('Kit Peseira+ 2 Capas de Almofada - ACONCHEGO', ARRAY['Capa de Almofada - ACONCHEGO=60x60', 'Peseira - ACONCHEGO=King'], 'shopee', 199.99),
  ('Kit Peseira+ 2 Capas de Almofada - ACONCHEGO', ARRAY['Capa de Almofada - ACONCHEGO=60x60', 'Peseira - ACONCHEGO=Queen'], 'mercado_livre', 189.99),
  ('Kit Peseira+ 2 Capas de Almofada - ACONCHEGO', ARRAY['Capa de Almofada - ACONCHEGO=60x60', 'Peseira - ACONCHEGO=Queen'], 'shein', 189.99),
  ('Kit Peseira+ 2 Capas de Almofada - ACONCHEGO', ARRAY['Capa de Almofada - ACONCHEGO=60x60', 'Peseira - ACONCHEGO=Queen'], 'shopee', 189.99),
  ('Kit Peseira+ 2 Capas de Almofada - EFEITO 3D', ARRAY['Peseira - EFEITO 3D=Casal'], 'mercado_livre', 119.99),
  ('Kit Peseira+ 2 Capas de Almofada - EFEITO 3D', ARRAY['Peseira - EFEITO 3D=Casal'], 'shein', 124.99),
  ('Kit Peseira+ 2 Capas de Almofada - EFEITO 3D', ARRAY['Peseira - EFEITO 3D=Casal'], 'shopee', 124.99),
  ('Kit Peseira+ 2 Capas de Almofada - EFEITO 3D', ARRAY['Peseira - EFEITO 3D=King'], 'mercado_livre', 139.99),
  ('Kit Peseira+ 2 Capas de Almofada - EFEITO 3D', ARRAY['Peseira - EFEITO 3D=King'], 'shein', 139.99),
  ('Kit Peseira+ 2 Capas de Almofada - EFEITO 3D', ARRAY['Peseira - EFEITO 3D=King'], 'shopee', 139.99),
  ('Kit Peseira+ 2 Capas de Almofada - EFEITO 3D', ARRAY['Peseira - EFEITO 3D=Queen'], 'mercado_livre', 129.99),
  ('Kit Peseira+ 2 Capas de Almofada - EFEITO 3D', ARRAY['Peseira - EFEITO 3D=Queen'], 'shein', 129.99),
  ('Kit Peseira+ 2 Capas de Almofada - EFEITO 3D', ARRAY['Peseira - EFEITO 3D=Queen'], 'shopee', 129.99),
  ('Kit Peseira+ 2 Capas de Almofada - LINKS', ARRAY['Peseira - LINKS=Casal'], 'mercado_livre', 119.99),
  ('Kit Peseira+ 2 Capas de Almofada - LINKS', ARRAY['Peseira - LINKS=Casal'], 'shein', 129.99),
  ('Kit Peseira+ 2 Capas de Almofada - LINKS', ARRAY['Peseira - LINKS=Casal'], 'shopee', 129.99),
  ('Kit Peseira+ 2 Capas de Almofada - LINKS', ARRAY['Peseira - LINKS=King'], 'mercado_livre', 139.99),
  ('Kit Peseira+ 2 Capas de Almofada - LINKS', ARRAY['Peseira - LINKS=King'], 'shein', 149.99),
  ('Kit Peseira+ 2 Capas de Almofada - LINKS', ARRAY['Peseira - LINKS=King'], 'shopee', 149.99),
  ('Kit Peseira+ 2 Capas de Almofada - LINKS', ARRAY['Peseira - LINKS=Queen'], 'mercado_livre', 129.99),
  ('Kit Peseira+ 2 Capas de Almofada - LINKS', ARRAY['Peseira - LINKS=Queen'], 'shein', 139.99),
  ('Kit Peseira+ 2 Capas de Almofada - LINKS', ARRAY['Peseira - LINKS=Queen'], 'shopee', 139.99),
  ('Kit Peseira+ 2 Capas de Almofada - RELEVO', ARRAY[]::text[], 'mercado_livre', 129.99),
  ('Kit Peseira+ 2 Capas de Almofada - RELEVO', ARRAY[]::text[], 'shein', 129.99),
  ('Kit Peseira+ 2 Capas de Almofada - RELEVO', ARRAY[]::text[], 'shopee', 129.99),
  ('Kit Peseira+ 2 Capas de Almofada - TRANÇAS', ARRAY[]::text[], 'mercado_livre', 139.99),
  ('Kit Peseira+ 2 Capas de Almofada - TRANÇAS', ARRAY[]::text[], 'shein', 139.99),
  ('Kit Peseira+ 2 Capas de Almofada - TRANÇAS', ARRAY[]::text[], 'shopee', 139.99),
  ('Kit Peseira+ 3 Capas de Almofada - ARAN', ARRAY['Peseira - ARAN=Casal'], 'mercado_livre', 149.99),
  ('Kit Peseira+ 3 Capas de Almofada - ARAN', ARRAY['Peseira - ARAN=Casal'], 'shein', 149.99),
  ('Kit Peseira+ 3 Capas de Almofada - ARAN', ARRAY['Peseira - ARAN=Casal'], 'shopee', 149.99),
  ('Kit Peseira+ 3 Capas de Almofada - ARAN', ARRAY['Peseira - ARAN=King'], 'mercado_livre', 189.99),
  ('Kit Peseira+ 3 Capas de Almofada - ARAN', ARRAY['Peseira - ARAN=King'], 'shein', 189.99),
  ('Kit Peseira+ 3 Capas de Almofada - ARAN', ARRAY['Peseira - ARAN=King'], 'shopee', 189.99),
  ('Kit Peseira+ 3 Capas de Almofada - ARAN', ARRAY['Peseira - ARAN=Queen'], 'mercado_livre', 169.99),
  ('Kit Peseira+ 3 Capas de Almofada - ARAN', ARRAY['Peseira - ARAN=Queen'], 'shein', 169.99),
  ('Kit Peseira+ 3 Capas de Almofada - ARAN', ARRAY['Peseira - ARAN=Queen'], 'shopee', 169.99),
  ('Kit Peseira+ 3 Capas de Almofada - SOFISTICADA', ARRAY[]::text[], 'mercado_livre', 169.99),
  ('Kit Peseira+ 3 Capas de Almofada - SOFISTICADA', ARRAY[]::text[], 'shein', 169.99),
  ('Kit Peseira+ 3 Capas de Almofada - SOFISTICADA', ARRAY[]::text[], 'shopee', 169.99)
) AS v(kit_nome, escolhas, marketplace, preco)
JOIN public.kits k ON k.nome = v.kit_nome AND k.deleted_at IS NULL
JOIN LATERAL (
  SELECT
    COALESCE(
      string_agg(ki.produto_id::text || '=' || lower(split_part(e, '=', 2)), '|'
                 ORDER BY ki.produto_id),
      ''
    ) AS combinacao,
    count(*) AS casados
  FROM unnest(v.escolhas) AS e
  JOIN public.produtos p2
    ON p2.nome = split_part(e, '=', 1) AND p2.deleted_at IS NULL
  JOIN public.kit_itens ki
    ON ki.kit_id = k.id AND ki.produto_id = p2.id
) c ON c.casados = cardinality(v.escolhas)
ON CONFLICT DO NOTHING;
