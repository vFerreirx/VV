-- Segunda tonalidade opcional para cores bicolor (ex.: capa de almofada
-- listrada). Aditivo e idempotente.
ALTER TABLE public.cores ADD COLUMN IF NOT EXISTS codigo_hex2 text;
