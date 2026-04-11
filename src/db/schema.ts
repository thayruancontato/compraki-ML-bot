import { pgTable, uuid, text, timestamp, real, integer, boolean, jsonb } from 'drizzle-orm/pg-core';

export const produtos = pgTable('produtos', {
  id: uuid('id').primaryKey().defaultRandom(),
  titulo: text('titulo').notNull(),
  imagem_url: text('imagem_url').notNull(),
  avaliacao_media: real('avaliacao_media'),
  avaliacao_count: integer('avaliacao_count'),
  vendidos_count: integer('vendidos_count'),
  preco_original: real('preco_original'),
  preco_promo: real('preco_promo').notNull(),
  formas_pagamento: text('formas_pagamento'),
  frete_info: text('frete_info'),
  frete_gratis: boolean('frete_gratis').default(false),
  atributos: jsonb('atributos'),
  estoque: integer('estoque'),
  ml_item_id: text('ml_item_id').notNull().unique(),
  ml_link_original: text('ml_link_original').notNull(),
  ml_link_afiliado: text('ml_link_afiliado').notNull(),
  categoria: text('categoria'),
  status: text('status').default('ativo'), // ativo, pausado, esgotado
  ultima_visualizacao: timestamp('ultima_visualizacao').defaultNow(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const posts = pgTable('posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  produto_id: uuid('produto_id').references(() => produtos.id).notNull(),
  texto_postado: text('texto_postado').notNull(),
  imagem_url: text('imagem_url'),
  status: text('status').default('pendente'), // pendente, enviado, erro
  variante_ab: text('variante_ab'), // A ou B
  grupo_whatsapp_id: text('grupo_whatsapp_id'),
  enviado_em: timestamp('enviado_em'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
