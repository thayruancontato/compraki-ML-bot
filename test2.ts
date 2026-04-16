import * as cheerio from 'cheerio';

export async function test() {
  const rs = await fetch('https://translate.google.com/website?sl=pt&tl=pt&hl=pt-BR&client=webapp&u=' + encodeURIComponent('https://lista.mercadolivre.com.br/iphone'), {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' }
  });
  const html = await rs.text();
  const $ = cheerio.load(html);
  
  $('.poly-card').each((i, el) => {
    if(i < 3) {
      console.log('--- ITEM', i);
      console.log('TITLE:', $(el).find('.poly-component__title').text());
      console.log('LINK:', $(el).find('.poly-component__title').attr('href') || $(el).find('a').attr('href'));
      console.log('PRICE:', $(el).find('.poly-price__current .andes-money-amount__fraction').text());
      console.log('IMAGE:', $(el).find('img.poly-component__picture').attr('data-src') || $(el).find('img.poly-component__picture').attr('src'));
    }
  });
}
test();
