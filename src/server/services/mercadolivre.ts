import puppeteer from 'puppeteer';
import * as dotenv from 'dotenv';
dotenv.config();

/**
 * MOTOR DE SCRAPING (Bypass de Bloqueio de Rede)
 * Usa o navegador para buscar os dados quando a API oficial está inacessível.
 */

async function getBrowser() {
  return await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
}

export async function searchProducts(query: string, limit = 5) {
  console.log(`[SCRAPER] Buscando por: ${query}...`);
  const browser = await getBrowser();
  try {
    const page = await browser.newPage();
    // Define User Agent Real
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    const url = `https://lista.mercadolivre.com.br/${encodeURIComponent(query)}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Extração de dados da página de resultados
    const products = await page.evaluate((max) => {
      const items = Array.from(document.querySelectorAll('.ui-search-result__wrapper')).slice(0, max);
      return items.map(el => {
        const titleEl = el.querySelector('.ui-search-item__title');
        const priceEl = el.querySelector('.poly-price__current .andes-money-amount__fraction');
        const linkEl = el.querySelector('a.ui-search-link') as HTMLAnchorElement;
        const imgEl = el.querySelector('.poly-component__picture') as HTMLImageElement;
        const originalPriceEl = el.querySelector('.andes-money-amount__fraction'); // Simplificado pra teste

        return {
          id: linkEl?.href.split('MLB-')[1]?.split('-')[0] || Math.random().toString(),
          title: titleEl?.textContent || '',
          price: parseFloat(priceEl?.textContent?.replace('.', '') || '0'),
          original_price: parseFloat(priceEl?.textContent?.replace('.', '') || '0'), // Ajustar p/ pegar original se houver
          permalink: linkEl?.href || '',
          thumbnail: imgEl?.src || '',
          free_shipping: el.textContent?.includes('Frete grátis') || false
        };
      });
    }, limit);

    await browser.close();
    return products;
  } catch (err: any) {
    console.error('[SCRAPER ERROR]', err.message);
    await browser.close();
    return [];
  }
}

export async function getProductDetails(itemId: string) {
  // Para detalhes, se tivermos o permalink do search, já é suficiente.
  // Mas se precisar entrar na página:
  console.log(`[SCRAPER] Obtendo detalhes de: ${itemId}...`);
  return {
      id: itemId,
      title: 'Detalhes via Scraper (Mock)',
      price: 0,
      original_price: 0,
      secure_thumbnail: '',
      pictures: [],
      permalink: '',
      available_quantity: 1,
      sold_quantity: 1
  };
}
