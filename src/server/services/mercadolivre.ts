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

export async function getRandomProducts() {
  const query = DISCOVERY_TERMS[Math.floor(Math.random() * DISCOVERY_TERMS.length)];
  return await searchProducts(query, 15);
}

export async function searchProducts(query: string, limit = 5) {
  console.log(`[ML API] Buscando: "${query}" (limite: ${limit})...`);
  
  const token = await getMLToken();
  
  // Tenta busca via API Oficial primeiro (se tiver token)
  if (token) {
    try {
      const resp = await fetch(`https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(query)}&limit=${limit}`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });

      if (resp.ok) {
        const data: any = await resp.json();
        return (data.results || []).map(formatMLItem);
      }
      console.warn(`[ML API] API Oficial falhou (Status ${resp.status}). Tentando Fallback Público...`);
    } catch (err) {
      console.warn('[ML API] Erro na API Oficial, pulando para fallback.');
    }
  }

  // FALLBACK: Busca via Frontend Público (Sem Token, mas com Stealth)
  try {
    const publicUrl = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(query)}&limit=${limit}`;
    const resp = await fetch(publicUrl, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data: any = await resp.json();
    return (data.results || []).map(formatMLItem);
  } catch (err: any) {
    console.error('[ML API] Fallback também falhou:', err.message);
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
