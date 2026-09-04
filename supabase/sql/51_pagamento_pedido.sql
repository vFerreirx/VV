-- ============================================================
-- 51_pagamento_pedido.sql
-- O pedido passa a registrar COMO se paga: a forma (Pix, cartão, boleto,
-- cheque) e o DESCONTO À VISTA combinado — na prática 5% no Pix.
--
-- AS DUAS COLUNAS SÃO OPCIONAIS, E A AUSÊNCIA É UM VALOR: "não informado".
-- Sem DEFAULT de propósito. Um default 'pix' faria todo pedido antigo
-- afirmar uma forma de pagamento que ninguém escolheu, e um default 0 no
-- desconto faria o documento imprimir "Desconto R$ 0,00" — uma afirmação
-- que ninguém fez. Mesma regra do frete (43_frete.sql): sem valor, a linha
-- simplesmente não sai no papel do cliente.
--
-- O PERCENTUAL É SNAPSHOT, do lado do preço e não do peso (ver AGENTS.md,
-- "Peso é recalculado, preço é snapshot"): mudar a política de desconto de
-- hoje não pode reescrever sozinha o que já foi combinado com o cliente.
-- É o PERCENTUAL que fica gravado, nunca o valor em reais — esse é sempre
-- derivado da mercadoria de agora (src/lib/total-pedido.ts), pelo mesmo
-- motivo de não existir coluna de total: dois números gravados podem
-- divergir, e aí não há como saber qual dos dois está errado.
--
-- O DESCONTO INCIDE SÓ SOBRE OS PRODUTOS, nunca sobre o frete: frete é
-- custo repassado da transportadora, e descontá-lo seria pagar parte do
-- frete do cliente sem ninguém ter decidido isso.
--
-- ORDEM DO ENUM: tem que bater com `FORMAS_PAGAMENTO` em
-- src/lib/pagamento.ts, que é a ordem de exibição dos botões — e é também a
-- ordem de comparação no Postgres, então um ORDER BY por forma discordaria
-- da tela.
--
-- numeric(5,2) aceita até 999.99, então o teto de 100 precisa do CHECK.
--
-- Idempotente. Só aditivo: nada de DROP, DELETE, TRUNCATE ou UPDATE.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'pagamento_forma'
  ) THEN
    CREATE TYPE public.pagamento_forma AS ENUM
      ('pix', 'cartao', 'boleto', 'cheque');
  END IF;
END $$;

ALTER TABLE public.orcamentos
  ADD COLUMN IF NOT EXISTS pagamento_forma public.pagamento_forma;

ALTER TABLE public.orcamentos
  ADD COLUMN IF NOT EXISTS desconto_percentual numeric(5, 2);

-- `ADD CONSTRAINT` não tem IF NOT EXISTS; o pg_constraint faz o papel.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.orcamentos'::regclass
      AND conname = 'orcamentos_desconto_percentual_check'
  ) THEN
    ALTER TABLE public.orcamentos
      ADD CONSTRAINT orcamentos_desconto_percentual_check
      CHECK (
        desconto_percentual IS NULL
        OR (desconto_percentual >= 0 AND desconto_percentual <= 100)
      );
  END IF;
END $$;
