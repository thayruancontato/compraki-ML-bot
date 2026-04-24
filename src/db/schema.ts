import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const produtos = sqliteTable('produtos', {
  id: text('id').primaryKey(), // Usaremos crypto.randomUUID()
  titulo: text('titulo').notNull(),
  imagem_url: text('imagem_url').notNull(),
  avaliacao_media: real('avaliacao_media'),
  avaliacao_count: integer('avaliacao_count'),
  vendidos_count: integer('vendidos_count'),
  preco_original: real('preco_original'),
  preco_promo: real('preco_promo').notNull(),
  formas_pagamento: text('formas_pagamento'),
  frete_info: text('frete_info'),
  frete_gratis: integer('frete_gratis', { mode: 'boolean' }).default(false),
  atributos: text('atributos', { mode: 'json' }), // Drizzle SQLite parseia automatico
  estoque: integer('estoque'),
  ml_item_id: text('ml_item_id').notNull().unique(),
  ml_link_original: text('ml_link_original').notNull(),
  ml_link_afiliado: text('ml_link_afiliado').notNull(),
  categoria: text('categoria'),
  status: text('status').default('ativo'), // ativo, pausado, esgotado
  ultima_visualizacao: integer('ultima_visualizacao', { mode: 'timestamp' }), // Timestamp vira unix ms
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const posts = sqliteTable('posts', {
  id: text('id').primaryKey(),
  produto_id: text('produto_id').references(() => produtos.id).notNull(),
  texto_postado: text('texto_postado').notNull(),
  imagem_url: text('imagem_url'),
  status: text('status').default('pendente'), // pendente, enviado, erro
  variante_ab: text('variante_ab'), // A ou B
  grupo_whatsapp_id: text('grupo_whatsapp_id'),
  enviado_em: integer('enviado_em', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});
