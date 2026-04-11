CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"produto_id" uuid NOT NULL,
	"texto_postado" text NOT NULL,
	"imagem_url" text,
	"status" text DEFAULT 'pendente',
	"variante_ab" text,
	"grupo_whatsapp_id" text,
	"enviado_em" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "produtos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"titulo" text NOT NULL,
	"imagem_url" text NOT NULL,
	"avaliacao_media" real,
	"avaliacao_count" integer,
	"vendidos_count" integer,
	"preco_original" real,
	"preco_promo" real NOT NULL,
	"formas_pagamento" text,
	"frete_info" text,
	"frete_gratis" boolean DEFAULT false,
	"atributos" jsonb,
	"estoque" integer,
	"ml_item_id" text NOT NULL,
	"ml_link_original" text NOT NULL,
	"ml_link_afiliado" text NOT NULL,
	"categoria" text,
	"status" text DEFAULT 'ativo',
	"ultima_visualizacao" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "produtos_ml_item_id_unique" UNIQUE("ml_item_id")
);
--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id") ON DELETE no action ON UPDATE no action;