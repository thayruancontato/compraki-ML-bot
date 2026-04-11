const puppeteer = require('puppeteer');

async function test() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  console.log('Navigating to ML...');
  try {
    await page.goto('https://www.mercadolivre.com.br/', { waitUntil: 'networkidle2', timeout: 30000 });
    const title = await page.title();
    console.log('Page Title:', title);
    await browser.close();
    console.log('Success!');
  } catch (err) {
    console.error('Scrape Failed:', err.message);
    await browser.close();
  }
}
test();
