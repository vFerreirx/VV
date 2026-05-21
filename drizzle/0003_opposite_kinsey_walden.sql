CREATE TABLE "modelos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "modelos_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "tamanhos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "tamanhos_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
-- Adiciona username em users em 3 passos pra suportar tabela com dados:
--   1. coluna NULL
--   2. backfill a partir do prefixo do email
--   3. NOT NULL + UNIQUE
ALTER TABLE "users" ADD COLUMN "username" text;--> statement-breakpoint
UPDATE "users" SET "username" = split_part("email", '@', 1) WHERE "username" IS NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_username_unique" UNIQUE("username");--> statement-breakpoint
ALTER TABLE "variacoes_produto" ADD COLUMN "modelo" text;--> statement-breakpoint
CREATE INDEX "modelos_ativo_idx" ON "modelos" USING btree ("ativo");--> statement-breakpoint
CREATE INDEX "tamanhos_ativo_idx" ON "tamanhos" USING btree ("ativo");
