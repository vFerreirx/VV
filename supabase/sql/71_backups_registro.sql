-- ============================================================
-- 71_backups_registro.sql
-- O SISTEMA PASSA A SABER SE O BACKUP ESTÁ ACONTECENDO.
--
-- O backup (`npm run db:backup`) roda numa tarefa do Windows na máquina da
-- casa, e depende dela ligada e com a sessão aberta — o `G:` do Google Drive
-- só existe ali. Se ela parar, o backup para EM SILÊNCIO. O app roda na
-- Vercel e não enxerga o Drive; o que ele enxerga é o banco. Então cada
-- backup bem-sucedido deixa UMA linha aqui, e o dashboard e o sino do admin
-- leem a mais recente (src/lib/backup.ts decide se está em dia).
--
-- `arquivo` é só o NOME (vanvest-AAAA-MM-DD.sql), nunca o caminho: o caminho
-- da máquina não é assunto do banco. `copia_drive` diz se a cópia pro Drive
-- chegou de verdade — backup que só existe no disco local morre com a
-- máquina.
--
-- Idempotente: pode rodar em todo `db:setup`.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.backups_registro (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feito_em timestamptz NOT NULL DEFAULT now(),
  arquivo text NOT NULL,
  tamanho_bytes bigint NOT NULL,
  tabelas integer NOT NULL,
  linhas integer NOT NULL,
  copia_drive boolean NOT NULL,
  maquina text NOT NULL
);

-- A única leitura é "o mais recente": um passo no índice, pra sempre.
CREATE INDEX IF NOT EXISTS backups_registro_feito_em_idx
  ON public.backups_registro (feito_em DESC);

-- ------------------------------------------------------------
-- RLS LIGADA, NENHUMA POLÍTICA, E REVOKE — o desenho do `op_numero_counter`
-- na 70, pelo mesmo motivo: tabela nova no Supabase NASCE com permissão pra
-- `anon`, e foi isso que deixou o contador de OP aberto pra internet.
--
-- Quem escreve é o script de backup e quem lê é o servidor, os dois pela
-- DATABASE_URL (`postgres`, dona da tabela, BYPASSRLS). Ninguém lê isto pelo
-- supabase-js — e a tabela fica FORA da publicação do realtime: nada aqui
-- pede evento ao vivo, o sino relê sozinho.
--
-- Quem criar uma política aqui "pra consertar" algo abre pra API o nome dos
-- arquivos e o hostname da máquina da casa.
-- ------------------------------------------------------------
ALTER TABLE public.backups_registro ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.backups_registro FROM anon, authenticated;
