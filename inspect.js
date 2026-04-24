const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
(async () => {
  const userDataDir = path.join(process.cwd(), '.ml_session');
  console.log('Iniciando puppeteer...');
  const browser = await puppeteer.launch({
    executablePath: 'C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
    headless: 'new',
    userDataDir: userDataDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800']
  });
  const page = await browser.newPage();
  console.log('Navegando para o Hub...');
  await page.goto('https://www.mercadolivre.com.br/afiliados/hub?is_affiliate=true#menu-user', { waitUntil: 'networkidle2', timeout: 60000 });
  console.log('Aguardando cards...');
  try {
    await page.waitForSelector('.poly-card, .andes-card, .hub-card', { timeout: 15000 });
    const cardHtml = await page.$eval('.poly-card, .andes-card, .hub-card', el => el.outerHTML);
    fs.writeFileSync('card_dump.html', cardHtml);
    console.log('Card HTML salvo em card_dump.html');
    
    // Clica no botão de compartilhar
    await page.evaluate(() => {
      const card = document.querySelector('.poly-card, .andes-card, .hub-card');
      const btn = Array.from(card.querySelectorAll('button, [role="button"]')).find(b => {
        const text = (b.textContent || '').toLowerCase();
        return text.includes('compartilhar') || text.includes('ganhar') || (b.getAttribute('aria-label') || '').includes('compartilhar');
      });
      if (btn) btn.click();
    });
    
    console.log('Aguardando modal...');
    await new Promise(r => setTimeout(r, 3000));
    const modalHtml = await page.evaluate(() => {
      const modal = document.querySelector('.andes-modal, .andes-modal--show, [role="dialog"]');
      return modal ? modal.outerHTML : 'Modal não encontrado';
    });
    fs.writeFileSync('modal_dump.html', modalHtml);
    console.log('Modal HTML salvo em modal_dump.html');
  } catch(e) {
    console.error('Erro:', e.message);
    const html = await page.content();
    fs.writeFileSync('page_error.html', html);
  }
  await browser.close();
})();
