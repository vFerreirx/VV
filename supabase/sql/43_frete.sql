-- ============================================================
-- 43_frete.sql
-- Cotação de frete pelo Melhor Envio: origem, embalagem e o frete escolhido.
--
-- TRÊS PARTES, e cada uma resolve uma ausência:
--
--  1. `empresas` ganha ENDEREÇO. Não havia CEP de origem em lugar nenhum do
--     sistema, e sem origem não existe cotação. A empresa PRINCIPAL é a
--     origem. As colunas espelham as de `compradores` de propósito — mesmo
--     eixo, mesma forma, mesma tela de busca por CEP.
--
--  2. `faixas_embalagem`: peso ATÉ -> medidas do pacote. Eles não usam caixa
--     padrão; embalam em pacote e o tamanho varia com o volume de itens. A
--     MAIOR faixa é a capacidade de um pacote — pedido acima disso vai em
--     mais de um volume. SEM carga inicial aqui: as medidas saem de pacotes
--     reais medidos e entram pela tela.
--
--  3. `orcamentos` ganha o frete ESCOLHIDO. É SNAPSHOT, do lado do preço e
--     não do peso (ver AGENTS.md, "Peso é recalculado, preço é snapshot"):
--     recotar depois não pode reescrever sozinho o que foi combinado com o
--     cliente. Por isso o CEP usado também fica gravado — a cotação só faz
--     sentido junto do destino que a produziu.
--
-- Idempotente. Só aditivo: nada de DROP, DELETE, TRUNCATE ou UPDATE.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Endereço da empresa (origem da cotação)
-- ------------------------------------------------------------

ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS cep text;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS logradouro text;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS numero text;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS complemento text;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS bairro text;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS cidade text;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS uf text;

-- ------------------------------------------------------------
-- 2. Faixas de embalagem
-- ------------------------------------------------------------

-- `peso_ate_gramas` é o TETO da faixa, em gramas inteiras — mesma unidade do
-- resto do sistema (ver src/lib/peso.ts); a conversão pra kg que a API do
-- Melhor Envio quer acontece só na borda.
--
-- As medidas em numeric(8,2): pacote medido com fita dá meio centímetro, e
-- arredondar pra cima na hora de cadastrar seria o usuário decidindo o que o
-- código pode fazer sozinho.
CREATE TABLE IF NOT EXISTS public.faixas_embalagem (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  peso_ate_gramas integer NOT NULL CHECK (peso_ate_gramas > 0),
  altura_cm numeric(8, 2) NOT NULL CHECK (altura_cm > 0),
  largura_cm numeric(8, 2) NOT NULL CHECK (largura_cm > 0),
  comprimento_cm numeric(8, 2) NOT NULL CHECK (comprimento_cm > 0),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- Um teto de peso não se repete entre as faixas vivas: duas faixas com o
-- mesmo "até" tornariam a escolha do pacote ambígua. Parcial, pra que a
-- faixa excluída libere o número de volta.
CREATE UNIQUE INDEX IF NOT EXISTS faixas_embalagem_peso_uidx
  ON public.faixas_embalagem (peso_ate_gramas)
  WHERE deleted_at IS NULL;

ALTER TABLE public.faixas_embalagem ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'faixas_embalagem'
      AND policyname = 'faixas_embalagem_select_authenticated'
  ) THEN
    CREATE POLICY faixas_embalagem_select_authenticated
      ON public.faixas_embalagem FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'faixas_embalagem'
      AND policyname = 'faixas_embalagem_manager_all'
  ) THEN
    CREATE POLICY faixas_embalagem_manager_all
      ON public.faixas_embalagem FOR ALL TO authenticated
      USING (public.is_manager()) WITH CHECK (public.is_manager());
  END IF;
END $$;

-- ------------------------------------------------------------
-- 3. Frete escolhido no pedido (snapshot)
-- ------------------------------------------------------------

-- O CEP que PRODUZIU esta cotação. Fica junto porque o comprador pode mudar
-- de endereço depois, e aí o valor gravado deixaria de ter contexto.
ALTER TABLE public.orcamentos ADD COLUMN IF NOT EXISTS frete_cep_destino text;
ALTER TABLE public.orcamentos ADD COLUMN IF NOT EXISTS frete_transportadora text;
ALTER TABLE public.orcamentos ADD COLUMN IF NOT EXISTS frete_servico text;
ALTER TABLE public.orcamentos ADD COLUMN IF NOT EXISTS frete_valor numeric(12, 2);
ALTER TABLE public.orcamentos ADD COLUMN IF NOT EXISTS frete_prazo_dias integer;
ALTER TABLE public.orcamentos ADD COLUMN IF NOT EXISTS frete_cotado_em timestamptz;
