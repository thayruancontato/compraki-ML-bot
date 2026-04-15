import * as dotenv from 'dotenv';
dotenv.config();

/**
 * MOTOR DE BUSCA VIA CLOUDFLARE WORKER (SEM BROWSER!)
 * Usa o Worker já deployado no Cloudflare para buscar produtos no Mercado Livre.
 * Isso elimina completamente a necessidade de Puppeteer/Chrome no servidor.
 */

const ML_WORKER_URL = process.env.ML_WORKER_URL || 'https://compraki-ml-bridge.thayrufino2.workers.dev';
const TRACKING_ID = process.env.ML_AFFILIATE_TRACKING_ID || '';

export async function searchProducts(query: string, limit = 5) {
  console.log(`[ML Worker] Buscando: "${query}" (limite: ${limit})...`);

  try {
    const url = `${ML_WORKER_URL}/search?q=${encodeURIComponent(query)}&limit=${limit}`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'ComprakiBot/2.0' }
    });

    if (!resp.ok) {
      console.error(`[ML Worker] Erro HTTP ${resp.status}`);
      return [];
    }

    const data: any = await resp.json();
    const results = data.ml_response?.results || [];

    return results.map((item: any) => ({
      id: item.id,
      title: item.title,
      price: item.price,
      original_price: item.original_price || item.price,
      permalink: appendTrackingId(item.permalink),
      thumbnail: item.thumbnail?.replace('http://', 'https://') || '',
      free_shipping: item.shipping?.free_shipping || false
    }));
  } catch (err: any) {
    console.error('[ML Worker] Erro na busca:', err.message);
    return [];
  }
}

function appendTrackingId(permalink: string): string {
  if (!TRACKING_ID || !permalink) return permalink;
  const separator = permalink.includes('?') ? '&' : '?';
  return `${permalink}${separator}matt_tool=${TRACKING_ID}`;
}

export async function getProductDetails(itemId: string) {
  console.log(`[ML Worker] Obtendo detalhes de: ${itemId}...`);
  try {
    const url = `${ML_WORKER_URL}/items?id=${itemId}`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    return await resp.json();
  } catch (err: any) {
    console.error('[ML Worker] Erro ao buscar detalhes:', err.message);
    return null;
  }
}
