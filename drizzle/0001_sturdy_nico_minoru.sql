CREATE TABLE "cores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"codigo_hex" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "cores_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE INDEX "cores_ativo_idx" ON "cores" USING btree ("ativo");