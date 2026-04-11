import { generateAffiliateLink } from './affiliate';

export function buildWhatsAppPost(product: any, variant: 'A' | 'B' = 'A') {
  const isDiscounted = product.original_price > product.price;
  const affiliateLink = generateAffiliateLink(product.permalink);
  
  // Formatadores de moeda (Real brasileiro)
  const fmt = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  let msg = `🔥 *OFERTA IMPERDÍVEL* 🔥\n\n`;
  msg += `*${product.title.trim()}*\n\n`;

  if (isDiscounted) {
    const discount = Math.round((1 - (product.price / product.original_price)) * 100);
    msg += `❌ De: ~${fmt(product.original_price)}~\n`;
    msg += `💲 *Por apenas: ${fmt(product.price)}* (${discount}% OFF!)\n\n`;
  } else {
    msg += `💲 *Preço: ${fmt(product.price)}*\n\n`;
  }

  if (product.free_shipping) {
    msg += `🚚 *Frete Grátis*\n\n`;
  }

  // Variant A: Link in the middle
  // Variant B: Link at the very end with a CTA
  if (variant === 'A') {
    msg += `🛒 *Compre aqui com desconto:*\n👉 ${affiliateLink}\n\n`;
    msg += `_Oferta sujeita a alteração de preço_`;
  } else {
    msg += `_Oferta sujeita a alteração de preço, garanta o seu antes que acabe!_\n\n`;
    msg += `🛒 *Garantir o meu agora:*\n👉 ${affiliateLink}`;
  }

  return msg;
}
