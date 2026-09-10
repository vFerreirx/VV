-- ============================================================
-- 54_pin_operador.sql
-- PIN de 4 dígitos pro operador trocar de conta no tablet da estação.
--
-- O TABLET É COMPARTILHADO, e trocar de operador hoje custa: abrir a
-- sidebar, rolar até o fim, Sair, digitar o usuário, digitar a senha
-- alfanumérica num teclado de tablet, com o dedo sujo de fiapo. Uma troca
-- que dá trabalho é uma troca que ninguém faz — e aí o operador da noite
-- registra a produção dele no nome do operador do dia, que é exatamente o
-- problema de autoria que a tela inteira existe pra resolver.
--
-- ⚠️ O PIN NÃO É UMA PORTA NOVA NO LOGIN. Ele só vale a partir de "Trocar
-- operador", DENTRO de uma sessão de operador já ativa, e só pra quem tem
-- role = 'operador'. Admin e gerente entram sempre com senha completa. Quem
-- chega no /login sem sessão nenhuma continua tendo só o caminho de sempre.
--
-- ⚠️ E O PIN NÃO AFROUXA A SESSÃO. Depois de conferido, o servidor emite uma
-- sessão SUPABASE DE VERDADE pra aquele usuário (admin.generateLink +
-- verifyOtp, provado neste projeto). Daí em diante é o mesmo cookie, as
-- mesmas permissões e a mesma autoria de sempre — nenhuma action muda, e
-- "selecionar um nome" continua não bastando pra agir como outra pessoa.
--
-- SENDO HONESTO SOBRE A FORÇA: 4 dígitos são mais fracos que uma senha. O
-- que este PIN defende é ATRIBUIÇÃO — que o registro saia no nome de quem
-- fez —, não o sistema contra um atacante determinado. Por isso ele fica
-- confinado ao cargo operador e ao gesto de troca, onde o estrago possível
-- é o mesmo que o colega ao lado já poderia fazer de qualquer jeito.
-- ============================================================

-- Guardamos o HASH, nunca o número. Formato: scrypt$<salt-hex>$<hash-hex>,
-- gerado com o `node:crypto` embutido — sem dependência nova pra isso.
--
-- NULL é um valor com significado: "este usuário não tem PIN". Ele
-- simplesmente não aparece na lista de troca rápida, e continua entrando
-- por senha. Sem DEFAULT de propósito — um default faria todo usuário
-- existente afirmar ter um PIN que ninguém cadastrou.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS pin_hash text;

COMMENT ON COLUMN public.users.pin_hash IS
  'Hash scrypt do PIN de troca rápida no tablet (scrypt$salt$hash). NULL = sem PIN, entra só por senha. Só usado por role=operador.';

-- Contador de tentativas erradas, pra travar a força bruta num teclado que
-- só tem dez teclas e quatro casas. Zera a cada acerto.
--
-- ⚠️ POR USUÁRIO, e não por sessão ou IP: a estação inteira compartilha o
-- tablet e o IP, então travar por IP travaria a fábrica junto. O alvo é
-- quem fica tentando adivinhar o PIN do colega.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS pin_tentativas integer NOT NULL DEFAULT 0;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS pin_bloqueado_ate timestamptz;

COMMENT ON COLUMN public.users.pin_bloqueado_ate IS
  'Enquanto no futuro, a troca por PIN recusa. Bloqueio CURTO (30s): minutos parariam a estacao por dedo errado, e maquina parada e prejuizo certo. A senha completa nunca e bloqueada por isto.';

-- ------------------------------------------------------------
-- RLS: o hash NUNCA sai pelo cliente
-- ------------------------------------------------------------
-- A tabela users já tem RLS e as políticas existentes valem pras colunas
-- novas. O que importa registrar é a regra de uso, que o Postgres não tem
-- como impor: pin_hash só é lido em Server Action, nunca selecionado numa
-- consulta que alimente componente de cliente. A lista de troca rápida
-- devolve id e nome — e a existência do PIN como booleano, jamais o hash.
