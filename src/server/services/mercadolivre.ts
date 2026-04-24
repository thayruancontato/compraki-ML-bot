import * as cheerio from 'cheerio';
import { FALLBACK_PRODUCTS } from './fallback-data';

const ML_APP_ID = process.env.ML_APP_ID || '';
const ML_SECRET_KEY = process.env.ML_SECRET_KEY || '';
const TRACKING_ID = process.env.ML_AFFILIATE_TRACKING_ID || '';
const CF_WORKER_URL = process.env.CF_WORKER_URL || 'https://compraki-ml-bridge.thayrufino2.workers.dev';

const DISCOVERY_TERMS = [
  'ofertas do dia',
  'mais vendidos',
  'promoção relampago',
  'eletronicos em oferta',
  'cozinha em promoção',
  'setup gamer barato',
  'smartwatch promoção',
  'fones de ouvido bluetooth',
  'casa inteligente oferta',
  'ferramentas promoção'
];

let cachedToken: string | null = null;
let tokenExpiry = 0;

/**
 * GERA TOKEN DE ACESSO OFICIAL DO MERCADO LIVRE (Com Stealth Headers)
 */
async function getMLToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  console.log('[ML API] Solicitando novo Access Token...');
  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', ML_APP_ID);
    params.append('client_secret', ML_SECRET_KEY);

    const resp = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      body: params.toString()
    });
    
    const data: any = await resp.json();
    if (data.access_token) {
      cachedToken = data.access_token;
      tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;
      return cachedToken;
    }
    console.error('[ML API] Resposta OAuth:', JSON.stringify(data));
    return null;
  } catch (err: any) {
    console.error('[ML API] Erro fatal no token:', err.message);
    return null;
  }
}

export const CATEGORIES = {
  'Tudo': 'ofertas do dia',
  'Eletrônicos': 'eletronicos em oferta',
  'Gamer': 'setup gamer barato',
  'Cozinha': 'cozinha em promoção',
  'Celulares': 'smartphone promoção',
  'Casa': 'casa inteligente oferta',
  'Ferramentas': 'ferramentas promoção'
};

export async function getRandomProducts(category?: string) {
  const query = category && (CATEGORIES as any)[category] 
    ? (CATEGORIES as any)[category] 
    : DISCOVERY_TERMS[Math.floor(Math.random() * DISCOVERY_TERMS.length)];
  return await searchProducts(query, 16);
}


export async function searchProducts(query: string, limit = 5) {
  console.log(`[ML API] Buscando: "${query}" (limite: ${limit})...`);

  // CAMADA 1: Scraping direto (Local)
  try {
    const publicUrl = `https://lista.mercadolivre.com.br/${encodeURIComponent(query)}`;
    const rs = await fetch(publicUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9'
      }
    });
    if (!rs.ok) throw new Error(`HTTP ${rs.status}`);
    const html = await rs.text();
    const items = parseMLHtml(html, limit);
    if (items && items.length > 0) {
      console.log(`[ML API] Scrape local extraiu ${items.length} itens.`);
      return items;
    }
    throw new Error('Scrape local retornou lista vazia (captcha/bloqueio)');
  } catch (err: any) {
    console.warn('[ML API] Camada 1 (Scrape Local) falhou:', err.message);
  }

  // Se as duas camadas de scraping falharem, retornamos lista vazia (conforme pedido: sem dados mock)
  console.log('[ML API] Todas as camadas de scraping falharam.');
  return [];
}


function parseMLHtml(html: string, limit: number): any[] {
  const $ = cheerio.load(html);
  const items: any[] = [];
  $('.poly-card').each((_, el) => {
    if (items.length >= limit) return false;
    const titleEl = $(el).find('.poly-component__title');
    const title = titleEl.text().trim();
    const link = titleEl.attr('href') || $(el).find('a').first().attr('href');
    const currentPriceText = $(el).find('.poly-price__current .andes-money-amount__fraction').first().text();
    const oldPriceText = $(el).find('.poly-price__strike .andes-money-amount__fraction').first().text();
    const thumb = $(el).find('img').attr('data-src') || $(el).find('img').attr('src');
    if (title && currentPriceText) {
      items.push({
        id: link?.split('/')[3] || String(Date.now()),
        title,
        price: parseFloat(currentPriceText.replace(/\./g, '').replace(',', '.')),
        original_price: oldPriceText
          ? parseFloat(oldPriceText.replace(/\./g, '').replace(',', '.'))
          : parseFloat(currentPriceText.replace(/\./g, '').replace(',', '.')),
        permalink: appendTrackingId(link || ''),
        thumbnail: (thumb || '').replace('I.jpg', 'O.jpg'),
        free_shipping: $(el).text().toLowerCase().includes('frete grátis')
      });
    }
  });
  return items;
}

async function getLocalFallbackProducts(limit: number) {
  try {
    const products = FALLBACK_PRODUCTS;
    
    // Pick random items to simulate discovery
    const shuffled = products.sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, limit);
    
    console.log(`[ML API] Usando ${selected.length} produtos da Curadoria Local!`);
    
    return selected.map((item: any, i: number) => ({
      id: `CACHE_${Date.now()}_${i}`,
      title: item.title,
      price: parseFloat(item.price.replace('R$ ', '').replace('.', '').replace(',', '.')),
      original_price: parseFloat(item.price.replace('R$ ', '').replace('.', '').replace(',', '.')),
      permalink: appendTrackingId(item.link),
      thumbnail: item.thumbnail,
      free_shipping: true
    }));
  } catch (e: any) {
    console.error('[ML API] Cache local também falhou:', e.message);
    return [];
  }
}

function formatMLItem(item: any) {
  return {
    id: item.id,
    title: item.title,
    price: item.price,
    original_price: item.original_price || item.price,
    permalink: appendTrackingId(item.permalink),
    thumbnail: item.thumbnail?.replace('http://', 'https://') || '',
    free_shipping: item.shipping?.free_shipping || false
  };
}

function appendTrackingId(permalink: string): string {
  if (!TRACKING_ID || !permalink) return permalink;
  const separator = permalink.includes('?') ? '&' : '?';
  return `${permalink}${separator}matt_tool=${TRACKING_ID}`;
}

export async function getProductDetails(itemId: string) {
  const token = await getMLToken();
  if (!token) return null;

  try {
    const resp = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch (err: any) {
    console.error('[ML API] Erro ao buscar detalhes:', err.message);
    return null;
  }
}
