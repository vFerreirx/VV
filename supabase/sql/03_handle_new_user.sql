-- ============================================================
-- 03_handle_new_user.sql
-- Sincroniza auth.users -> public.users.
-- Quando o admin cria um usuário via service role API, o trigger
-- copia id/email pra public.users e lê username/nome/role/telefone
-- do raw_user_meta_data (default role = 'operador').
--
-- Username é o identificador exibido pro usuário fazer login. O Supabase
-- Auth sempre usa email internamente; nós montamos um email "interno"
-- {username}@malharia.app na hora de criar o usuário pela Admin API.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_nome text;
  v_username text;
  v_role public.user_role;
  v_telefone text;
BEGIN
  -- username vem do meta_data; fallback pro prefixo do email.
  v_username := COALESCE(
    NEW.raw_user_meta_data ->> 'username',
    split_part(NEW.email, '@', 1)
  );

  v_nome := COALESCE(
    NEW.raw_user_meta_data ->> 'nome',
    NEW.raw_user_meta_data ->> 'name',
    v_username
  );

  v_telefone := NEW.raw_user_meta_data ->> 'telefone';

  -- role vem do meta_data; se inválido cai pra 'operador'.
  BEGIN
    v_role := COALESCE(
      (NEW.raw_user_meta_data ->> 'role')::public.user_role,
      'operador'::public.user_role
    );
  EXCEPTION WHEN invalid_text_representation THEN
    v_role := 'operador'::public.user_role;
  END;

  INSERT INTO public.users (id, username, email, nome, telefone, role, ativo)
  VALUES (NEW.id, v_username, NEW.email, v_nome, v_telefone, v_role, true)
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        username = COALESCE(public.users.username, EXCLUDED.username),
        nome = COALESCE(public.users.nome, EXCLUDED.nome),
        telefone = COALESCE(public.users.telefone, EXCLUDED.telefone),
        role = COALESCE(public.users.role, EXCLUDED.role);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Sincroniza updates de email em auth.users de volta pra public.users.
-- (Raramente acontece — o email é interno e o usuário não pode trocar.)
CREATE OR REPLACE FUNCTION public.handle_user_email_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public.users SET email = NEW.email WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_update ON auth.users;

CREATE TRIGGER on_auth_user_email_update
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_email_update();
