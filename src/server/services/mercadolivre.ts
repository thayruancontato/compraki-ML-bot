const ML_APP_ID = process.env.ML_APP_ID || '';
const ML_SECRET_KEY = process.env.ML_SECRET_KEY || '';
const TRACKING_ID = process.env.ML_AFFILIATE_TRACKING_ID || '';

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
 * GERA TOKEN DE ACESSO OFICIAL DO MERCADO LIVRE
 */
async function getMLToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  console.log('[ML API] Solicitando novo Access Token...');
  try {
    const resp = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=client_credentials&client_id=${ML_APP_ID}&client_secret=${ML_SECRET_KEY}`
    });
    
    const data: any = await resp.json();
    if (data.access_token) {
      cachedToken = data.access_token;
      tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;
      return cachedToken;
    }
    throw new Error(data.message || 'Erro ao gerar token');
  } catch (err: any) {
    console.error('[ML API] Erro fatal no token:', err.message);
    return null;
  }
}

export async function getRandomProducts() {
  const query = DISCOVERY_TERMS[Math.floor(Math.random() * DISCOVERY_TERMS.length)];
  return await searchProducts(query, 20);
}

export async function searchProducts(query: string, limit = 5) {
  console.log(`[ML API] Buscando: "${query}" (limite: ${limit})...`);
  
  const token = await getMLToken();
  if (!token) return [];

  try {
    const url = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(query)}&limit=${limit}`;
    const resp = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!resp.ok) {
      console.error(`[ML API] Erro HTTP ${resp.status}`);
      return [];
    }

    const data: any = await resp.json();
    const results = data.results || [];

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
    console.error('[ML API] Erro na busca:', err.message);
    return [];
  }
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
