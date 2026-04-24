import * as dotenv from 'dotenv';
dotenv.config();

export function generateAffiliateLink(originalUrl: string): string {
  // Se já for um link curto meli.la, não mexemos (pois já tem o rastreio do hub)
  if (originalUrl.includes('meli.la')) return originalUrl;

  const trackingId = process.env.ML_AFFILIATE_TRACKING_ID;
  if (!trackingId) return originalUrl;

  try {
    const url = new URL(originalUrl);
    url.searchParams.set('tracking_id', trackingId);
    return url.toString();
  } catch (err) {
    return originalUrl;
  }
}
