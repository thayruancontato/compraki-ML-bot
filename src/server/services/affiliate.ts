import * as dotenv from 'dotenv';
dotenv.config();

export function generateAffiliateLink(originalUrl: string): string {
  const trackingId = process.env.ML_AFFILIATE_TRACKING_ID;
  if (!trackingId) return originalUrl;

  try {
    const url = new URL(originalUrl);
    // Adiciona ou substitui o parâmetro tracking_id garantindo que a comissão seja registrada
    url.searchParams.set('tracking_id', trackingId);
    return url.toString();
  } catch (err) {
    console.error('URL inválida:', originalUrl);
    return originalUrl;
  }
}
