-- ============================================================
-- 44_lotes_fio_opcionais.sql
-- A planilha da fábrica não tem valor, vendedor, vencimento nem (em duas
-- linhas) número de lote. Enquanto essas quatro colunas forem NOT NULL,
-- cadastrar um lote exige INVENTAR dado — foi o que travou a adoção da
-- tela: a tentativa anterior de migrar a planilha gravou "R$ 0,00",
-- "Importação planilha (sem dado)" e o lote fictício "SEM-CODIGO" em 54
-- linhas, e acabou toda apagada.
--
-- Quem não usa a parte financeira não pode ser barrado por ela. Campo
-- vazio passa a significar "não tem" — nunca zero, que mentiria no R$/kg.
--
-- data_entrada continua NOT NULL de propósito: o import aplica uma data de
-- referência única a todas as linhas e o formulário já vem com hoje
-- preenchido, então ela nunca barra ninguém.
--
-- Idempotente: DROP NOT NULL não falha se a coluna já aceitar null.
-- ============================================================

ALTER TABLE public.lotes_fio ALTER COLUMN numero_lote          DROP NOT NULL;
ALTER TABLE public.lotes_fio ALTER COLUMN valor_total          DROP NOT NULL;
ALTER TABLE public.lotes_fio ALTER COLUMN vendedor             DROP NOT NULL;
ALTER TABLE public.lotes_fio ALTER COLUMN vencimento_pagamento DROP NOT NULL;
