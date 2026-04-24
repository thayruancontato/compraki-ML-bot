import { generateAffiliateLink } from './affiliate';

export function buildWhatsAppPost(product: any, variant: 'A' | 'B' = 'A') {
  const affiliateLink = generateAffiliateLink(product.permalink);
  // Se o preço já for string (ex: R$ 50,00), usamos direto. Se não, formatamos.
  const formatPrice = (val: any) => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  // Se vier do robô de automação, os campos serão 'price', 'originalPrice' e 'discount'
  const hasPromo = !!product.originalPrice;
  const currentPrice = formatPrice(product.price);
  const oldPrice = formatPrice(product.originalPrice);
  const discountText = product.discount || '';

  let msg = `🔥 *OFERTA IMPERDÍVEL* 🔥\n\n`;
  msg += `*${product.title?.trim() || 'Produto'}*\n\n`;

  if (hasPromo) {
    msg += `❌ De: ~${oldPrice}~\n`;
    msg += `💲 *Por apenas: ${currentPrice}* ${discountText ? `(${discountText})` : ''}\n\n`;
  } else {
    msg += `💲 *Preço: ${currentPrice}*\n\n`;
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
