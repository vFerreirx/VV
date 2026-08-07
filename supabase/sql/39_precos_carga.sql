-- ============================================================
-- 39_precos_carga.sql
-- Carga inicial do preço de tabela, tirada do catálogo em PDF do cliente.
-- 29 pares (produto, tamanho). Nenhum preço de kit: ver o porquê no fim.
--
-- ON CONFLICT DO NOTHING, e não UPSERT: este arquivo roda em todo
-- `npm run db:setup`. Se sobrescrevesse, um preço que o cliente ajustou na
-- tela voltaria pro valor do PDF no próximo setup — silenciosamente, que é
-- a pior forma de perder um dado. Aqui a carga só preenche buraco.
--
-- Resolve produto_id/tamanho_id por NOME, sem UUID escrito à mão: UUID em
-- arquivo versionado quebra em qualquer outro banco e não dá pra conferir a
-- olho. O JOIN também serve de rede: nome que não casar simplesmente não
-- insere, em vez de gravar preço no produto errado.
--
-- Os 29 pares foram conferidos contra o banco antes de escrever este
-- arquivo: todo nome existe, e todo par (produto, tamanho) é um tamanho que
-- o produto realmente oferece em `variacoes_produto`.
--
-- Fica DE FORA de propósito (o catálogo não traz preço): Manta - RAVENA,
-- Capa de Almofada - RAVENA, e a Peseira RELEVO e TRANÇAS nos tamanhos
-- Casal e King. Esses caem na reserva do builder (soma dos componentes /
-- último preço praticado) em vez de ganhar um número inventado.
--
-- Idempotente. Só INSERT.
-- ============================================================

INSERT INTO public.produto_tamanho_preco (produto_id, tamanho_id, preco)
SELECT p.id, t.id, v.preco
FROM (VALUES
  -- PESEIRAS
  ('Peseira - ACONCHEGO'::text,              'Casal'::text,   50.00::numeric(12,2)),
  ('Peseira - ACONCHEGO',                    'Queen',         60.00),
  ('Peseira - ACONCHEGO',                    'King',          70.00),
  ('Peseira - ARAN',                         'Casal',         50.00),
  ('Peseira - ARAN',                         'Queen',         60.00),
  ('Peseira - ARAN',                         'King',          65.00),
  ('Peseira - EFEITO 3D',                    'Casal',         40.00),
  ('Peseira - EFEITO 3D',                    'Queen',         50.00),
  ('Peseira - EFEITO 3D',                    'King',          55.00),
  ('Peseira - LINKS',                        'Casal',         40.00),
  ('Peseira - LINKS',                        'Queen',         50.00),
  ('Peseira - LINKS',                        'King',          55.00),
  ('Peseira - RELEVO',                       'Queen',         50.00),
  ('Peseira - SOFISTICADA',                  'Queen',         65.00),
  ('Peseira - TRANÇAS',                      'Queen',         60.00),

  -- CAPAS DE ALMOFADA
  ('Capa de Almofada - ACONCHEGO',           '45x45',         25.00),
  ('Capa de Almofada - ACONCHEGO',           '50x50',         30.00),
  ('Capa de Almofada - ACONCHEGO',           '60x60',         35.00),
  ('Capa de Almofada - SIENA',               '45x45',         25.00),
  ('Capa de Almofada - SOFISTICADA',         '45x45',         25.00),
  ('Capa de Almofada - ARAN',                '45x45',         20.00),
  ('Capa de Almofada - EFEITO 3D',           '45x45',         20.00),
  ('Capa de Almofada - LINKS',               '45x45',         20.00),
  ('Capa de Almofada - RELEVO',              '45x45',         20.00),
  ('Capa de Almofada - TRANÇAS',             '45x45',         20.00),
  -- O preço de Baguete pertence a produtos SEPARADOS no cadastro, não ao
  -- tamanho Baguete das capas comuns (que não existe).
  ('Capa de Almofada Baguete - SOFISTICADA', 'Baguete',       25.00),
  ('Capa de Almofada Baguete - ARAN',        'Baguete',       20.00),

  -- MANTAS
  ('Manta - ACONCHEGO',                      'Manta',         60.00),
  ('Manta - SIENA',                          'Manta',         55.00)
) AS v(produto, tamanho, preco)
JOIN public.produtos p ON p.nome = v.produto AND p.deleted_at IS NULL
JOIN public.tamanhos t ON t.nome = v.tamanho AND t.deleted_at IS NULL
ON CONFLICT ON CONSTRAINT produto_tamanho_preco_uk DO NOTHING;

-- --------------------------------------------------------------
-- KITS: nenhuma linha, de propósito.
--
-- O catálogo traz preço fechado pra dois kits, ambos rotulados no tamanho
-- "Manta": SIENA a 105,00 e ACONCHEGO a 110,00. Só que "Manta" não é um
-- tamanho que o kit possa assumir no pedido — o seletor de tamanho do kit
-- (orcamentos-view.tsx, `tamanhosKit`) só oferece tamanhos de componentes
-- que TÊM escolha de tamanho. No kit SIENA nenhum componente tem, então não
-- há seletor; no ACONCHEGO quem tem é a capa, e o seletor oferece
-- 45x45/50x50/60x60. Linha com tamanho_id = Manta nunca seria consultada.
--
-- E não faz falta: a soma dos componentes já devolve exatamente esses dois
-- valores (55 + 2×25 = 105; 60 + 2×25 = 110 no 45x45). Preço fechado que
-- repete a soma é dado inerte com aparência de regra.
--
-- A `kit_tamanho_preco` existe e fica vazia, pro dia em que um kit precisar
-- de preço que DIFIRA da soma — aí a linha tem o que dizer.
-- --------------------------------------------------------------
