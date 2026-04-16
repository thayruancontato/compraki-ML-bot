const fs = require('fs');
const cheerio = require('cheerio');

async function scrapeList(query) {
  try {
    const rs = await fetch('https://lista.mercadolivre.com.br/' + encodeURIComponent(query));
    if(!rs.ok) return [];
    const html = await rs.text();
    const $ = cheerio.load(html);
    const items = [];
    $('.poly-card').each((_, el) => {
      if (items.length >= 10) return;
      const title = $(el).find('.poly-component__title').first().text().trim();
      let link = $(el).find('a').first().attr('href');
      if (link) link = link.split('#')[0];
      const price = $(el).find('.poly-price__current .andes-money-amount__fraction').first().text() || '0,00';
      let thumb = $(el).find('img.poly-component__picture').attr('data-src') || $(el).find('img.poly-component__picture').attr('src');
      
      if (title && link && thumb && !items.find(i => i.title === title)) {
        items.push({ 
          title, 
          link, 
          price: "R$ " + price, 
          thumbnail: thumb, 
          source: 'cache' 
        });
      }
    });
    return items;
  } catch (err) {
    console.error(err);
    return [];
  }
}

async function run() {
  const queries = ['iphone', 'xiaomi', 'notebook', 'tv', 'smartwatch', 'playstation', 'geladeira', 'airfryer', 'fone de ouvido', 'monitor'];
  let all = [];
  for (const q of queries) {
    console.log('Scraping', q);
    const list = await scrapeList(q);
    all = all.concat(list);
    await new Promise(r => setTimeout(r, 1000));
  }
  
  if (all.length > 0) {
    fs.writeFileSync('src/server/fallback_products.json', JSON.stringify(all, null, 2));
    console.log('Saved ' + all.length + ' products to fallback cache!');
  } else {
    console.log('No products found to cache. Captcha blocked locally?');
  }
}

run();
