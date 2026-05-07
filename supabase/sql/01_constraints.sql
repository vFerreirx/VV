-- ============================================================
-- 01_constraints.sql
-- Constraints que o Drizzle não pode declarar:
--   - FK de public.users.id pra auth.users.id (auth schema é externo)
--   - FKs circulares users <-> maquinas
-- Aplicado depois de drizzle-kit migrate.
-- ============================================================

-- public.users.id deve referenciar auth.users.id e ser deletado em cascata.
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_id_auth_users_id_fk;

ALTER TABLE public.users
  ADD CONSTRAINT users_id_auth_users_id_fk
  FOREIGN KEY (id) REFERENCES auth.users (id)
  ON DELETE CASCADE;

-- Operador atual da máquina referencia public.users.
-- ON DELETE SET NULL pra preservar histórico da máquina se o usuário for removido.
ALTER TABLE public.maquinas
  DROP CONSTRAINT IF EXISTS maquinas_operador_atual_id_users_id_fk;

ALTER TABLE public.maquinas
  ADD CONSTRAINT maquinas_operador_atual_id_users_id_fk
  FOREIGN KEY (operador_atual_id) REFERENCES public.users (id)
  ON DELETE SET NULL;

-- Máquina atual do operador referencia public.maquinas.
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_maquina_atual_id_maquinas_id_fk;

ALTER TABLE public.users
  ADD CONSTRAINT users_maquina_atual_id_maquinas_id_fk
  FOREIGN KEY (maquina_atual_id) REFERENCES public.maquinas (id)
  ON DELETE SET NULL;
