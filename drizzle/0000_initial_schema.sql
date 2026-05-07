CREATE TYPE "public"."maquina_status" AS ENUM('operando', 'parada', 'manutencao', 'setup', 'desativada');--> statement-breakpoint
CREATE TYPE "public"."maquina_tipo" AS ENUM('circular_pequeno', 'circular_medio', 'circular_grande');--> statement-breakpoint
CREATE TYPE "public"."movimentacao_tipo" AS ENUM('entrada_producao', 'saida_full_ml', 'saida_full_shopee', 'saida_venda_direta', 'ajuste', 'devolucao');--> statement-breakpoint
CREATE TYPE "public"."ordem_canal_destino" AS ENUM('full_ml', 'full_shopee', 'venda_direta', 'estoque');--> statement-breakpoint
CREATE TYPE "public"."ordem_prioridade" AS ENUM('baixa', 'normal', 'alta', 'urgente');--> statement-breakpoint
CREATE TYPE "public"."ordem_status" AS ENUM('aguardando_materia_prima', 'programado', 'em_producao', 'acabamento', 'embalagem', 'pronto_envio', 'enviado', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'gerente_producao', 'operador', 'estoquista', 'vendas');--> statement-breakpoint
CREATE TABLE "movimentacoes_estoque" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"produto_id" uuid NOT NULL,
	"variacao_id" uuid,
	"tipo" "movimentacao_tipo" NOT NULL,
	"quantidade_kg" numeric(12, 3) DEFAULT '0' NOT NULL,
	"quantidade_unidades" numeric(12, 3) DEFAULT '0' NOT NULL,
	"referencia_id" uuid,
	"referencia_tipo" text,
	"usuario_id" uuid,
	"observacao" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"telefone" text,
	"role" "user_role" DEFAULT 'operador' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"maquina_atual_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "produtos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" text NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"categoria" text,
	"composicao" text,
	"gramatura" numeric(8, 2),
	"largura_cm" numeric(8, 2),
	"rendimento_kg_por_metro" numeric(10, 4),
	"custo_producao" numeric(12, 2),
	"preco_ml" numeric(12, 2),
	"preco_shopee" numeric(12, 2),
	"mlb_id" text,
	"shopee_item_id" text,
	"estoque_minimo_full_ml" numeric(12, 3) DEFAULT '0',
	"estoque_minimo_full_shopee" numeric(12, 3) DEFAULT '0',
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "produtos_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "variacoes_produto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"produto_id" uuid NOT NULL,
	"sku_variacao" text NOT NULL,
	"cor" text,
	"tamanho" text,
	"preco_adicional" numeric(12, 2) DEFAULT '0',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "variacoes_produto_skuVariacao_unique" UNIQUE("sku_variacao")
);
--> statement-breakpoint
CREATE TABLE "maquinas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"nome" text NOT NULL,
	"tipo" "maquina_tipo" NOT NULL,
	"diametro_polegadas" numeric(5, 2),
	"finura" integer,
	"num_alimentadores" integer,
	"capacidade_kg_por_hora" numeric(8, 3),
	"status" "maquina_status" DEFAULT 'parada' NOT NULL,
	"operador_atual_id" uuid,
	"ultima_manutencao" timestamp with time zone,
	"proxima_manutencao" timestamp with time zone,
	"observacoes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "maquinas_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "apontamentos_producao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ordem_id" uuid NOT NULL,
	"maquina_id" uuid NOT NULL,
	"operador_id" uuid NOT NULL,
	"inicio" timestamp with time zone NOT NULL,
	"fim" timestamp with time zone,
	"kg_produzidos" numeric(12, 3) DEFAULT '0' NOT NULL,
	"kg_refugo" numeric(12, 3) DEFAULT '0' NOT NULL,
	"motivo_parada" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eventos_kanban" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ordem_id" uuid NOT NULL,
	"status_anterior" "ordem_status",
	"status_novo" "ordem_status" NOT NULL,
	"usuario_id" uuid,
	"observacao" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ordens_producao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero" text NOT NULL,
	"produto_id" uuid NOT NULL,
	"variacao_id" uuid,
	"quantidade_kg" numeric(12, 3) NOT NULL,
	"quantidade_metros" numeric(12, 3),
	"rendimento_snapshot" numeric(10, 4),
	"maquina_id" uuid,
	"canal_destino" "ordem_canal_destino" DEFAULT 'estoque' NOT NULL,
	"prioridade" "ordem_prioridade" DEFAULT 'normal' NOT NULL,
	"status" "ordem_status" DEFAULT 'aguardando_materia_prima' NOT NULL,
	"data_prevista_inicio" timestamp with time zone,
	"data_prevista_fim" timestamp with time zone,
	"data_real_inicio" timestamp with time zone,
	"data_real_fim" timestamp with time zone,
	"criado_por" uuid,
	"responsavel_id" uuid,
	"observacoes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "ordens_producao_numero_unique" UNIQUE("numero")
);
--> statement-breakpoint
ALTER TABLE "movimentacoes_estoque" ADD CONSTRAINT "movimentacoes_estoque_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes_estoque" ADD CONSTRAINT "movimentacoes_estoque_variacao_id_variacoes_produto_id_fk" FOREIGN KEY ("variacao_id") REFERENCES "public"."variacoes_produto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes_estoque" ADD CONSTRAINT "movimentacoes_estoque_usuario_id_users_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variacoes_produto" ADD CONSTRAINT "variacoes_produto_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apontamentos_producao" ADD CONSTRAINT "apontamentos_producao_ordem_id_ordens_producao_id_fk" FOREIGN KEY ("ordem_id") REFERENCES "public"."ordens_producao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apontamentos_producao" ADD CONSTRAINT "apontamentos_producao_maquina_id_maquinas_id_fk" FOREIGN KEY ("maquina_id") REFERENCES "public"."maquinas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apontamentos_producao" ADD CONSTRAINT "apontamentos_producao_operador_id_users_id_fk" FOREIGN KEY ("operador_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_kanban" ADD CONSTRAINT "eventos_kanban_ordem_id_ordens_producao_id_fk" FOREIGN KEY ("ordem_id") REFERENCES "public"."ordens_producao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_kanban" ADD CONSTRAINT "eventos_kanban_usuario_id_users_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_producao" ADD CONSTRAINT "ordens_producao_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_producao" ADD CONSTRAINT "ordens_producao_variacao_id_variacoes_produto_id_fk" FOREIGN KEY ("variacao_id") REFERENCES "public"."variacoes_produto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_producao" ADD CONSTRAINT "ordens_producao_maquina_id_maquinas_id_fk" FOREIGN KEY ("maquina_id") REFERENCES "public"."maquinas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_producao" ADD CONSTRAINT "ordens_producao_criado_por_users_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_producao" ADD CONSTRAINT "ordens_producao_responsavel_id_users_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "movimentacoes_produto_idx" ON "movimentacoes_estoque" USING btree ("produto_id");--> statement-breakpoint
CREATE INDEX "movimentacoes_tipo_idx" ON "movimentacoes_estoque" USING btree ("tipo");--> statement-breakpoint
CREATE INDEX "movimentacoes_created_at_idx" ON "movimentacoes_estoque" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "users_ativo_idx" ON "users" USING btree ("ativo");--> statement-breakpoint
CREATE INDEX "produtos_categoria_idx" ON "produtos" USING btree ("categoria");--> statement-breakpoint
CREATE INDEX "produtos_ativo_idx" ON "produtos" USING btree ("ativo");--> statement-breakpoint
CREATE INDEX "variacoes_produto_id_idx" ON "variacoes_produto" USING btree ("produto_id");--> statement-breakpoint
CREATE INDEX "maquinas_status_idx" ON "maquinas" USING btree ("status");--> statement-breakpoint
CREATE INDEX "maquinas_tipo_idx" ON "maquinas" USING btree ("tipo");--> statement-breakpoint
CREATE INDEX "apontamentos_ordem_idx" ON "apontamentos_producao" USING btree ("ordem_id");--> statement-breakpoint
CREATE INDEX "apontamentos_maquina_idx" ON "apontamentos_producao" USING btree ("maquina_id");--> statement-breakpoint
CREATE INDEX "apontamentos_operador_idx" ON "apontamentos_producao" USING btree ("operador_id");--> statement-breakpoint
CREATE INDEX "eventos_kanban_ordem_idx" ON "eventos_kanban" USING btree ("ordem_id");--> statement-breakpoint
CREATE INDEX "eventos_kanban_created_at_idx" ON "eventos_kanban" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ordens_producao_status_idx" ON "ordens_producao" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ordens_producao_maquina_idx" ON "ordens_producao" USING btree ("maquina_id");--> statement-breakpoint
CREATE INDEX "ordens_producao_produto_idx" ON "ordens_producao" USING btree ("produto_id");--> statement-breakpoint
CREATE INDEX "ordens_producao_canal_idx" ON "ordens_producao" USING btree ("canal_destino");--> statement-breakpoint
CREATE INDEX "ordens_producao_prioridade_idx" ON "ordens_producao" USING btree ("prioridade");--> statement-breakpoint
CREATE INDEX "ordens_producao_data_prevista_fim_idx" ON "ordens_producao" USING btree ("data_prevista_fim");