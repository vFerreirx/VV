DROP INDEX "produtos_categoria_idx";--> statement-breakpoint
ALTER TABLE "produtos" DROP COLUMN "categoria";--> statement-breakpoint
ALTER TABLE "produtos" DROP COLUMN "composicao";--> statement-breakpoint
ALTER TABLE "produtos" DROP COLUMN "custo_producao";--> statement-breakpoint
ALTER TABLE "produtos" DROP COLUMN "preco_ml";--> statement-breakpoint
ALTER TABLE "produtos" DROP COLUMN "preco_shopee";--> statement-breakpoint
ALTER TABLE "produtos" DROP COLUMN "estoque_minimo_full_ml";--> statement-breakpoint
ALTER TABLE "produtos" DROP COLUMN "estoque_minimo_full_shopee";